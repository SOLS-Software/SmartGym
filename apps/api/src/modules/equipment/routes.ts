import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@solsfit/db';
import { z } from 'zod';
import {
  normalizeEquipamentoPayload,
  normalizeEquipamentoManutencaoPayload,
  assertValidId,
} from '../../shared/normalize.js';
import { getSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import { assertAllowedUploadType, assertUploadBuffer, getEquipamentoFilePath } from '../../shared/files.js';
import type { EquipamentoPayload, EquipamentoManutencaoPayload } from '../../shared/api-types.js';
import { clientErrorMessage } from '../../shared/errors.js';

const listQuerySchema = z.object({
  search: z.string().max(200).optional(),
  limit: z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    z.coerce.number().int().optional(),
  ),
});

// Isolamento de tenant: Equipamento pertence ao CLIENTE (Equipamento.idCliente,
// mesmo modelo de Fornecedor). Antes o model nao tinha coluna de posse e TODA a
// arvore /equipments (listagem, edicao, status, arquivos com URL assinada e
// manutencoes) era compartilhada entre todos os clientes da instalacao.
//
// Regras:
// - Leitura: registros do proprio cliente + os de idCliente nulo — que sao os
//   LEGADOS (criados antes da migration, sem dono deduzivel) e o CATALOGO
//   GLOBAL (equipamento generico dos exercicios de catalogo, ver abaixo).
// - Escrita: SOMENTE registros do proprio cliente. Linha sem dono nao e
//   editavel/apagavel pelo tenant, justamente porque pode ser de outro.
// - Criacao: idCliente vem sempre do token, nunca do body.
//
// Excecao do CATALOGO GLOBAL: o exercicio de catalogo (Exercicio.idEmpresa
// nulo) e o mesmo para todos os clientes, entao o equipamento generico que ele
// referencia ("Banco Reto", "Barra Olimpica") tambem precisa ser global — senao
// o vinculo exercicio->equipamento vaza o parque de um cliente para os outros
// na leitura de /exercises/:id/equipment. Esse equipamento fica com idCliente
// nulo e so o super-admin (SOLS) o cria/edita, mesmo criterio do catalogo de
// exercicios e das tabelas de dominio globais em auxiliary/routes.ts.
const visibleScope = (idCliente: number) => ({
  OR: [{ idCliente: null }, { idCliente }],
});

export async function registerEquipmentRoutes(app: FastifyInstance) {
  // Equipamento visivel (proprio + legado sem dono) — usado nas leituras.
  async function findVisibleEquipment(db: PrismaClient, id: number, idCliente: number) {
    return db.equipamento.findFirst({
      where: { id, ...visibleScope(idCliente) },
      select: { id: true },
    });
  }

  // Equipamento do proprio tenant — exigido em qualquer escrita. O super-admin
  // alcanca tambem o catalogo global (idCliente nulo), que e ele quem mantem.
  async function findOwnedEquipment(db: PrismaClient, id: number, idCliente: number, isSuperAdmin = false) {
    return db.equipamento.findFirst({
      where: isSuperAdmin ? { id, OR: [{ idCliente: null }, { idCliente }] } : { id, idCliente },
      select: { id: true },
    });
  }

  app.get<{
    Querystring: { search?: string };
  }>('/equipments', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const parsedQuery = listQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) return reply.code(400).send({ message: 'Parametros invalidos.' });
    const search = parsedQuery.data.search?.trim();
    const take = Math.min(Math.max(parsedQuery.data.limit ?? 1000, 1), 1000);
    return request.tenantDb.equipamento.findMany({
      // O escopo de tenant vai em AND para nao ser sobrescrito pelo OR da busca:
      // dois `OR` no mesmo objeto sao a MESMA chave e o ultimo vence, o que
      // reabriria a listagem para todos os clientes sempre que houvesse ?search=.
      where: {
        AND: [visibleScope(idCliente)],
        ...(search
          ? {
              OR: [
                { nmEquipamento: { contains: search, mode: 'insensitive' } },
                { dsEquipamento: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { nmEquipamento: 'asc' },
      take,
    });
  });

  app.post<{
    Body: EquipamentoPayload;
  }>('/equipments', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      // Tenant sempre do token; idCliente vindo do body e ignorado. A unica
      // saida do tenant e boCatalogoGlobal, restrito ao super-admin.
      const data = normalizeEquipamentoPayload(request.body);
      const catalogoGlobal = request.body.boCatalogoGlobal === true;
      if (catalogoGlobal && !request.user.superAdmin) {
        return reply
          .code(403)
          .send({ message: 'Catalogo global: alteracao restrita ao administrador do sistema.' });
      }
      const equipment = await request.tenantDb.equipamento.create({
        data: { ...data, idCliente: catalogoGlobal ? null : idCliente },
      });
      return reply.code(201).send(equipment);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao criar equipamento.'),
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: EquipamentoPayload;
  }>('/equipments/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Equipamento invalido.');
      const isSuperAdmin = request.user.superAdmin === true;
      if (!(await findOwnedEquipment(request.tenantDb, id, idCliente, isSuperAdmin))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const data = normalizeEquipamentoPayload(request.body);
      // Sem boCatalogoGlobal no body a posse fica como esta — so o super-admin
      // move a linha entre o catalogo global e o proprio tenant.
      const catalogoGlobal = request.body.boCatalogoGlobal;
      if (typeof catalogoGlobal === 'boolean' && !isSuperAdmin) {
        return reply
          .code(403)
          .send({ message: 'Catalogo global: alteracao restrita ao administrador do sistema.' });
      }
      return request.tenantDb.equipamento.update({
        where: { id },
        data:
          typeof catalogoGlobal === 'boolean'
            ? { ...data, idCliente: catalogoGlobal ? null : idCliente }
            : data,
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao atualizar equipamento.'),
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/equipments/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Equipamento invalido.');
      if (!(await findOwnedEquipment(request.tenantDb, id, idCliente, request.user.superAdmin === true))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const boInativo = toBool(request.body.boInativo);
      return request.tenantDb.equipamento.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do equipamento.' });
    }
  });

  // Equipment files

  app.get<{
    Params: { id: string };
  }>('/equipments/:id/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEquipamento = Number(request.params.id);
      assertValidId(idEquipamento, 'Equipamento invalido.');
      if (!(await findVisibleEquipment(request.tenantDb, idEquipamento, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return request.tenantDb.equipamentoArquivo.findMany({
        where: { idEquipamento, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar arquivos do equipamento.'),
      });
    }
  });

  app.post<{
    Params: { id: string };
  }>('/equipments/:id/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEquipamento = Number(request.params.id);
      assertValidId(idEquipamento, 'Equipamento invalido.');

      // Anexar arquivo e escrita: exige posse, nao basta ser visivel.
      const equipment = await findOwnedEquipment(request.tenantDb, idEquipamento, idCliente);

      if (!equipment) {
        return reply.code(404).send({ message: 'Equipamento nao encontrado.' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }
      assertAllowedUploadType(file);

      const buffer = await file.toBuffer();
      const safeMime = await assertUploadBuffer(buffer);
      const path = getEquipamentoFilePath(idEquipamento, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: safeMime, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const equipmentFile = await request.tenantDb.equipamentoArquivo.create({
        data: {
          idEquipamento,
          dsArquivo: file.filename,
          anCaminho: path,
          idTiposArquivos: null,
          cnChaveAcesso: 0,
          cnDistribuidor: 0,
        },
      });

      return reply.code(201).send(equipmentFile);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao enviar arquivo do equipamento.'),
      });
    }
  });

  app.get<{
    Params: { id: string; fileId: string };
  }>('/equipments/:id/files/:fileId/url', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEquipamento = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idEquipamento, 'Equipamento invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      if (!(await findVisibleEquipment(request.tenantDb, idEquipamento, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const equipmentFile = await request.tenantDb.equipamentoArquivo.findFirst({
        where: { id: fileId, idEquipamento, boInativo: false },
      });

      if (!equipmentFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(equipmentFile.anCaminho, 60 * 5);

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
  }>('/equipments/:id/files/:fileId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEquipamento = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idEquipamento, 'Equipamento invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      if (!(await findOwnedEquipment(request.tenantDb, idEquipamento, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const existingFile = await request.tenantDb.equipamentoArquivo.findFirst({
        where: { id: fileId, idEquipamento, boInativo: false },
      });

      if (!existingFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      return request.tenantDb.equipamentoArquivo.update({
        where: { id: fileId },
        data: { boInativo: true },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao remover arquivo do equipamento.'),
      });
    }
  });

  // Equipment maintenances

  app.get<{
    Params: { id: string };
  }>('/equipments/:id/maintenances', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEquipamento = Number(request.params.id);
      assertValidId(idEquipamento, 'Equipamento invalido.');
      if (!(await findVisibleEquipment(request.tenantDb, idEquipamento, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return request.tenantDb.equipamentoManutencao.findMany({
        where: { idEquipamento, boInativo: false },
        orderBy: { dtExecucao: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar manutencoes do equipamento.'),
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body: EquipamentoManutencaoPayload;
  }>('/equipments/:id/maintenances', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEquipamento = Number(request.params.id);
      assertValidId(idEquipamento, 'Equipamento invalido.');
      if (!(await findOwnedEquipment(request.tenantDb, idEquipamento, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const data = normalizeEquipamentoManutencaoPayload(request.body);
      const maintenance = await request.tenantDb.equipamentoManutencao.create({
        data: { ...data, idEquipamento },
      });
      return reply.code(201).send(maintenance);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao criar manutencao.'),
      });
    }
  });

  app.put<{
    Params: { id: string; maintenanceId: string };
    Body: EquipamentoManutencaoPayload;
  }>('/equipments/:id/maintenances/:maintenanceId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEquipamento = Number(request.params.id);
      const maintenanceId = Number(request.params.maintenanceId);
      assertValidId(idEquipamento, 'Equipamento invalido.');
      assertValidId(maintenanceId, 'Manutencao invalida.');

      if (!(await findOwnedEquipment(request.tenantDb, idEquipamento, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const existing = await request.tenantDb.equipamentoManutencao.findFirst({
        where: { id: maintenanceId, idEquipamento },
      });

      if (!existing) {
        return reply.code(404).send({ message: 'Manutencao nao encontrada.' });
      }

      const data = normalizeEquipamentoManutencaoPayload(request.body);
      return request.tenantDb.equipamentoManutencao.update({ where: { id: maintenanceId }, data });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao atualizar manutencao.'),
      });
    }
  });

  app.patch<{
    Params: { id: string; maintenanceId: string };
    Body: { boInativo?: number };
  }>('/equipments/:id/maintenances/:maintenanceId/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEquipamento = Number(request.params.id);
      const maintenanceId = Number(request.params.maintenanceId);
      assertValidId(idEquipamento, 'Equipamento invalido.');
      assertValidId(maintenanceId, 'Manutencao invalida.');

      // Alem do tenant, confere o vinculo manutencao->equipamento: antes o
      // :maintenanceId ia direto para o update, entao qualquer id de manutencao
      // (de qualquer equipamento, de qualquer cliente) podia ser desativado.
      if (!(await findOwnedEquipment(request.tenantDb, idEquipamento, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const existing = await request.tenantDb.equipamentoManutencao.findFirst({
        where: { id: maintenanceId, idEquipamento },
        select: { id: true },
      });
      if (!existing) {
        return reply.code(404).send({ message: 'Manutencao nao encontrada.' });
      }

      const boInativo = toBool(request.body.boInativo);
      return request.tenantDb.equipamentoManutencao.update({
        where: { id: maintenanceId },
        data: { boInativo },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status da manutencao.' });
    }
  });

  app.delete<{
    Params: { id: string; maintenanceId: string };
  }>('/equipments/:id/maintenances/:maintenanceId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEquipamento = Number(request.params.id);
      const maintenanceId = Number(request.params.maintenanceId);
      assertValidId(idEquipamento, 'Equipamento invalido.');
      assertValidId(maintenanceId, 'Manutencao invalida.');

      if (!(await findOwnedEquipment(request.tenantDb, idEquipamento, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const existing = await request.tenantDb.equipamentoManutencao.findFirst({
        where: { id: maintenanceId, idEquipamento },
      });

      if (!existing) {
        return reply.code(404).send({ message: 'Manutencao nao encontrada.' });
      }

      return request.tenantDb.equipamentoManutencao.update({
        where: { id: maintenanceId },
        data: { boInativo: true },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao remover manutencao.'),
      });
    }
  });
}
