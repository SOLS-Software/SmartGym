import { z } from 'zod';
import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@solsfit/db';
import { normalizeExercisePayload, assertValidId } from '../../shared/normalize.js';
import { getSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import { assertAllowedUploadType, assertUploadBuffer, getExerciseFilePath } from '../../shared/files.js';
import type {
  ExercicioAreaCorporalPayload,
  ExercicioEquipamentoPayload,
  ExercisePayload,
} from '../../shared/api-types.js';
import { clientErrorMessage } from '../../shared/errors.js';

const IMAGE_EXTENSION_PATTERN = /\.(jpg|jpeg|png|gif|webp)$/i;

// ---------------------------------------------------------------------------
// Validacao de entrada
// ---------------------------------------------------------------------------

const queryFlagSchema = z.enum(['true', 'false']).optional();

const queryIntSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().int().optional(),
);

const queryOffsetSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().int().min(0).optional(),
);

const listQuerySchema = z.object({
  search: z.string().optional(),
  limit: queryIntSchema,
  offset: queryOffsetSchema,
  includeCover: queryFlagSchema,
  // Padrao: so exercicio ATIVO. O catalogo do aluno (web e mobile) e a montagem
  // de treino consomem esta rota, e exercicio inativo aparecia la como card
  // vazio — sem imagem, sem area e sem instrucao. Quem precisa dos inativos e a
  // tela de cadastro, que mostra o badge de status e permite reativar; ela pede
  // includeInactive=true explicitamente.
  includeInactive: queryFlagSchema,
  ids: z.string().regex(/^[\d,\s]*$/, 'Lista de ids invalida.').optional(),
});

const relatedListQuerySchema = z.object({ limit: queryIntSchema });

const bodyNumberSchema = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .refine(
    (value) => value == null || value === '' || Number.isFinite(Number(value)),
    'Valor numerico invalido.',
  );

const equipmentBodySchema = z.object({ idEquipamento: bodyNumberSchema });

const areaBodySchema = z.object({ idAreaCorporal: bodyNumberSchema });

const statusBodySchema = z.object({
  boInativo: z.union([z.boolean(), z.number(), z.string()]).nullish(),
});

function clampLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 1000, 1), 1000);
}

// ---------------------------------------------------------------------------
// Tenant isolation: Exercicio.idEmpresa -> Empresa.idCliente. Registros com
// idEmpresa nulo sao tratados como catalogo global (visiveis a todos).
// ---------------------------------------------------------------------------

function tenantCompanyWhere(idCliente: number) {
  return { OR: [{ idEmpresa: null }, { empresa: { idCliente } }] };
}

// Equipamento alcancavel pelo tenant: o proprio parque + os de idCliente nulo
// (catalogo global / legado). Mesmo escopo de leitura de equipment/routes.ts.
function equipmentVisibleWhere(idCliente: number) {
  return { OR: [{ idCliente: null }, { idCliente }] };
}

async function exerciseBelongsToTenant(db: PrismaClient, idCliente: number, idExercicio: number) {
  const exercise = await db.exercicio.findFirst({
    where: { id: idExercicio, ...tenantCompanyWhere(idCliente) },
    select: { id: true },
  });
  return Boolean(exercise);
}

// Mutacao exige posse pelo tenant — nao casa idEmpresa nulo (evita editar
// catalogo global/de outro tenant). Leitura continua usando exerciseBelongsToTenant.
//
// Excecao: exercicio com idEmpresa nulo e catalogo GLOBAL (uma linha e a mesma
// para todos os clientes), entao mante-lo e operacao cross-tenant e cabe so ao
// super-admin (SOLS) — mesmo criterio das tabelas de dominio globais em
// auxiliary/routes.ts (GLOBAL_DOMAIN_PATHS). Fora isso o super-admin continua
// preso ao proprio tenant: nao alcanca exercicio de empresa de outro cliente.
async function exerciseOwnedByTenant(db: PrismaClient, idCliente: number,
  idExercicio: number,
  isSuperAdmin = false,) {
  const exercise = await db.exercicio.findFirst({
    where: isSuperAdmin
      ? { id: idExercicio, OR: [{ idEmpresa: null }, { empresa: { idCliente } }] }
      : { id: idExercicio, empresa: { idCliente } },
    select: { id: true },
  });
  return Boolean(exercise);
}

async function assertCompanyInTenant(db: PrismaClient, idCliente: number, idEmpresa: number | null | undefined) {
  if (idEmpresa == null) return;
  const company = await db.empresa.findFirst({
    where: { id: idEmpresa, idCliente },
    select: { id: true },
  });
  if (!company) throw new Error('Empresa nao pertence ao cliente.');
}

async function attachExerciseCovers<T extends { id: number }>(db: PrismaClient, exercises: T[], idCliente: number) {
  if (exercises.length === 0) {
    return exercises.map((exercise) => ({
      ...exercise,
      coverImageUrl: null as string | null,
      areas: [] as Array<{ id: number; dsAreaCorporal: string; boInativo: number }>,
      equipamentos: [] as Array<{ id: number; nmEquipamento: string | null }>,
    }));
  }

  const exerciseIds = exercises.map((exercise) => exercise.id);

  const [files, areaLinks, equipmentLinks] = await Promise.all([
    db.exercicioArquivo.findMany({
      where: { idExercicio: { in: exerciseIds }, boInativo: false },
      orderBy: { dtCadastro: 'asc' },
    }),
    db.exercicioAreaCorporal.findMany({
      where: { idExercicio: { in: exerciseIds }, boInativo: false },
      include: { areaCorporal: true },
    }),
    // Equipamento vem junto (uma consulta para a pagina inteira) porque o card
    // e o painel de detalhe mostram a lista. Buscar por card seria 1 request
    // por exercicio na tela. O filtro de tenant e o mesmo do
    // GET /exercises/:id/equipment: exercicio de catalogo e visto por todos os
    // clientes e nao pode expor o parque de quem vinculou primeiro.
    db.exercicioEquipamento.findMany({
      where: {
        idExercicio: { in: exerciseIds },
        boInativo: false,
        equipamento: equipmentVisibleWhere(idCliente),
      },
      include: { equipamento: true },
      orderBy: { dtCadastro: 'asc' },
    }),
  ]);

  const coverPathByExercise = new Map<number, string>();
  for (const file of files) {
    if (
      file.idExercicio !== null &&
      !coverPathByExercise.has(file.idExercicio) &&
      IMAGE_EXTENSION_PATTERN.test(file.anCaminho)
    ) {
      coverPathByExercise.set(file.idExercicio, file.anCaminho);
    }
  }

  const paths = [...new Set(coverPathByExercise.values())];
  const signedUrlByPath = new Map<string, string>();

  if (paths.length > 0) {
    const { bucket } = getSupabaseConfig();
    const supabase = getSupabaseClient();
    const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 5);
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) signedUrlByPath.set(item.path, item.signedUrl);
    }
  }

  const areasByExercise = new Map<number, Array<{ id: number; dsAreaCorporal: string; boInativo: boolean }>>();
  for (const link of areaLinks) {
    if (link.idExercicio === null || !link.areaCorporal) continue;
    const list = areasByExercise.get(link.idExercicio) ?? [];
    list.push(link.areaCorporal);
    areasByExercise.set(link.idExercicio, list);
  }

  const equipmentByExercise = new Map<number, Array<{ id: number; nmEquipamento: string | null; dsEquipamento: string | null }>>();
  for (const link of equipmentLinks) {
    if (!link.equipamento) continue;
    const list = equipmentByExercise.get(link.idExercicio) ?? [];
    list.push({
      id: link.equipamento.id,
      nmEquipamento: link.equipamento.nmEquipamento,
      dsEquipamento: link.equipamento.dsEquipamento,
    });
    equipmentByExercise.set(link.idExercicio, list);
  }

  return exercises.map((exercise) => {
    const path = coverPathByExercise.get(exercise.id);
    return {
      ...exercise,
      coverImageUrl: path ? signedUrlByPath.get(path) ?? null : null,
      areas: areasByExercise.get(exercise.id) ?? [],
      equipamentos: equipmentByExercise.get(exercise.id) ?? [],
    };
  });
}

export async function registerExerciseRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { search?: string; limit?: string; offset?: string; includeCover?: string; ids?: string };
  }>('/exercises', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const parsedQuery = listQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ message: 'Parametros invalidos.' });
    }
    const search = parsedQuery.data.search?.trim();
    const includeCover = parsedQuery.data.includeCover === 'true';
    const includeInactive = parsedQuery.data.includeInactive === 'true';
    const ids = parsedQuery.data.ids
      ? parsedQuery.data.ids.split(',').map(Number).filter(Number.isFinite)
      : undefined;

    const exercises = await request.tenantDb.exercicio.findMany({
      where: {
        ...(search ? { dsExercicio: { contains: search, mode: 'insensitive' } } : {}),
        ...(ids ? { id: { in: ids } } : {}),
        ...(includeInactive ? {} : { boInativo: false }),
        ...tenantCompanyWhere(idCliente),
      },
      orderBy: { dsExercicio: 'asc' },
      take: clampLimit(parsedQuery.data.limit),
      skip: parsedQuery.data.offset,
    });

    return includeCover ? attachExerciseCovers(request.tenantDb, exercises, idCliente) : exercises;
  });

  app.post<{
    Body: ExercisePayload;
  }>('/exercises', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const data = normalizeExercisePayload(request.body);
      await assertCompanyInTenant(request.tenantDb, idCliente, data.idEmpresa);
      const exercise = await request.tenantDb.exercicio.create({ data });
      return reply.code(201).send(exercise);
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao criar exercicio.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: ExercisePayload;
  }>('/exercises/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Exercicio invalido.');
      if (!(await exerciseOwnedByTenant(request.tenantDb, idCliente, id, request.user.superAdmin === true))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const data = normalizeExercisePayload(request.body);
      await assertCompanyInTenant(request.tenantDb, idCliente, data.idEmpresa);
      return request.tenantDb.exercicio.update({ where: { id }, data });
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao atualizar exercicio.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/exercises/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Exercicio invalido.');
      const parsedBody = statusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      if (!(await exerciseOwnedByTenant(request.tenantDb, idCliente, id, request.user.superAdmin === true))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const boInativo = toBool(parsedBody.data.boInativo);
      return request.tenantDb.exercicio.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do exercicio.' });
    }
  });

  // Exercise files

  app.get<{
    Params: { id: string };
  }>('/exercises/:id/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      assertValidId(idExercicio, 'Exercicio invalido.');
      const parsedQuery = relatedListQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      if (!(await exerciseBelongsToTenant(request.tenantDb, idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return request.tenantDb.exercicioArquivo.findMany({
        where: { idExercicio, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
        take: clampLimit(parsedQuery.data.limit),
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar arquivos do exercicio.'),
      });
    }
  });

  app.post<{
    Params: { id: string };
  }>('/exercises/:id/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      assertValidId(idExercicio, 'Exercicio invalido.');

      if (!(await exerciseBelongsToTenant(request.tenantDb, idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }
      assertAllowedUploadType(file);

      const buffer = await file.toBuffer();
      const safeMime = await assertUploadBuffer(buffer);
      const path = getExerciseFilePath(idExercicio, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: safeMime, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const exerciseFile = await request.tenantDb.exercicioArquivo.create({
        data: {
          idExercicio,
          dsArquivo: file.filename,
          anCaminho: path,
          idTiposArquivos: null,
          cnChaveAcesso: 0,
          cnDistribuidor: 0,
        },
      });

      return reply.code(201).send(exerciseFile);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao enviar arquivo do exercicio.'),
      });
    }
  });

  app.get<{
    Params: { id: string; fileId: string };
  }>('/exercises/:id/files/:fileId/url', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      if (!(await exerciseBelongsToTenant(request.tenantDb, idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const exerciseFile = await request.tenantDb.exercicioArquivo.findFirst({
        where: { id: fileId, idExercicio, boInativo: false },
      });

      if (!exerciseFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(exerciseFile.anCaminho, 60 * 5);

      if (error) {
        throw new Error(error.message);
      }

      return { url: data.signedUrl, expiresIn: 60 * 5 };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao gerar link do arquivo.'),
      });
    }
  });

  app.delete<{
    Params: { id: string; fileId: string };
  }>('/exercises/:id/files/:fileId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      if (!(await exerciseOwnedByTenant(request.tenantDb, idCliente, idExercicio, request.user.superAdmin === true))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const existingFile = await request.tenantDb.exercicioArquivo.findFirst({
        where: { id: fileId, idExercicio, boInativo: false },
      });

      if (!existingFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      return request.tenantDb.exercicioArquivo.update({
        where: { id: fileId },
        data: { boInativo: true },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao remover arquivo do exercicio.'),
      });
    }
  });

  // Exercise equipment

  app.get<{
    Params: { id: string };
  }>('/exercises/:id/equipment', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      assertValidId(idExercicio, 'Exercicio invalido.');
      const parsedQuery = relatedListQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      if (!(await exerciseBelongsToTenant(request.tenantDb, idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return request.tenantDb.exercicioEquipamento.findMany({
        // O vinculo so e devolvido se o EQUIPAMENTO tambem for visivel ao
        // tenant. Sem este filtro, um exercicio de catalogo (idEmpresa nulo,
        // visivel a todos) exporia o parque de quem vinculou primeiro: o
        // cliente A ve "Leg Press Serie 3 - Unidade Centro" do cliente B so por
        // abrir o exercicio global. Equipamento de idCliente nulo (catalogo /
        // legado) segue visivel, que e o caso de uso legitimo.
        where: { idExercicio, boInativo: false, equipamento: equipmentVisibleWhere(idCliente) },
        include: { equipamento: true },
        orderBy: { dtCadastro: 'desc' },
        take: clampLimit(parsedQuery.data.limit),
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar equipamentos do exercicio.'),
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body: ExercicioEquipamentoPayload;
  }>('/exercises/:id/equipment', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      if (!equipmentBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const idExercicio = Number(request.params.id);
      const idEquipamento = Number(request.body.idEquipamento);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(idEquipamento, 'Equipamento invalido.');

      if (!(await exerciseBelongsToTenant(request.tenantDb, idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      // O equipamento tambem precisa ser alcancavel pelo tenant: sem isto da
      // para vincular equipamento de OUTRO cliente so chutando o id, e o nome
      // dele volta no 201 e na listagem.
      const equipment = await request.tenantDb.equipamento.findFirst({
        where: { id: idEquipamento, ...equipmentVisibleWhere(idCliente) },
        select: { id: true },
      });
      if (!equipment) {
        return reply.code(404).send({ message: 'Equipamento nao encontrado.' });
      }

      const existing = await request.tenantDb.exercicioEquipamento.findFirst({
        where: { idExercicio, idEquipamento, boInativo: false },
      });

      if (existing) {
        return reply.code(409).send({ message: 'Equipamento ja vinculado a este exercicio.' });
      }

      const link = await request.tenantDb.exercicioEquipamento.create({
        data: { idExercicio, idEquipamento },
        include: { equipamento: true },
      });

      return reply.code(201).send(link);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao vincular equipamento ao exercicio.'),
      });
    }
  });

  app.delete<{
    Params: { id: string; linkId: string };
  }>('/exercises/:id/equipment/:linkId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      const linkId = Number(request.params.linkId);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(linkId, 'Vinculo invalido.');

      if (!(await exerciseOwnedByTenant(request.tenantDb, idCliente, idExercicio, request.user.superAdmin === true))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const existing = await request.tenantDb.exercicioEquipamento.findFirst({
        where: { id: linkId, idExercicio },
      });

      if (!existing) {
        return reply.code(404).send({ message: 'Vinculo nao encontrado.' });
      }

      return request.tenantDb.exercicioEquipamento.update({
        where: { id: linkId },
        data: { boInativo: true },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao remover equipamento do exercicio.'),
      });
    }
  });

  // Exercise body areas

  app.get<{
    Params: { id: string };
  }>('/exercises/:id/areas', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      assertValidId(idExercicio, 'Exercicio invalido.');
      const parsedQuery = relatedListQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      if (!(await exerciseBelongsToTenant(request.tenantDb, idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return request.tenantDb.exercicioAreaCorporal.findMany({
        where: { idExercicio, boInativo: false },
        include: { areaCorporal: true },
        orderBy: { dtCadastro: 'desc' },
        take: clampLimit(parsedQuery.data.limit),
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar areas do exercicio.'),
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body: ExercicioAreaCorporalPayload;
  }>('/exercises/:id/areas', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      if (!areaBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const idExercicio = Number(request.params.id);
      const idAreaCorporal = Number(request.body.idAreaCorporal);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(idAreaCorporal, 'Area corporal invalida.');

      if (!(await exerciseBelongsToTenant(request.tenantDb, idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const existing = await request.tenantDb.exercicioAreaCorporal.findFirst({
        where: { idExercicio, idAreaCorporal, boInativo: false },
      });

      if (existing) {
        return reply.code(409).send({ message: 'Area ja vinculada a este exercicio.' });
      }

      const link = await request.tenantDb.exercicioAreaCorporal.create({
        data: { idExercicio, idAreaCorporal },
        include: { areaCorporal: true },
      });

      return reply.code(201).send(link);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao vincular area ao exercicio.'),
      });
    }
  });

  app.delete<{
    Params: { id: string; linkId: string };
  }>('/exercises/:id/areas/:linkId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      const linkId = Number(request.params.linkId);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(linkId, 'Vinculo invalido.');

      if (!(await exerciseOwnedByTenant(request.tenantDb, idCliente, idExercicio, request.user.superAdmin === true))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const existing = await request.tenantDb.exercicioAreaCorporal.findFirst({
        where: { id: linkId, idExercicio },
      });

      if (!existing) {
        return reply.code(404).send({ message: 'Vinculo nao encontrado.' });
      }

      return request.tenantDb.exercicioAreaCorporal.update({
        where: { id: linkId },
        data: { boInativo: true },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao remover area do exercicio.'),
      });
    }
  });
}
