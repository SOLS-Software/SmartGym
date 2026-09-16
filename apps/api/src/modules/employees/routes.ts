import { toBool } from '../../shared/normalize.js';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@smartgym/db';
import { prisma } from '../../shared/prisma.js';
import { assertValidId, getMultipartFieldValue, normalizeEmployeePayload } from '../../shared/normalize.js';
import { assertAllowedUploadType, assertUploadBuffer, getEmployeeFilePath } from '../../shared/files.js';
import {
  cpfHash,
  encryptCpfFields,
  withDecryptedCpf,
  withDecryptedCpfList,
} from '../../shared/pii.js';
import { getSupabaseClient, getSupabaseConfig } from '../../shared/supabase.js';
import type { CompanyChildPayload, EmployeePayload } from '../../shared/api-types.js';
import { clientErrorMessage } from '../../shared/errors.js';

const limitQuerySchema = z.object({ limit: z.coerce.number().int().optional() });
const listEmployeesQuerySchema = limitQuerySchema.extend({ search: z.string().optional() });

// Paginacao das listagens top-level: clamp 1..1000, default 1000.
function clampLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) return 1000;
  return Math.min(1000, Math.max(1, Math.trunc(limit)));
}

export async function registerEmployeeRoutes(app: FastifyInstance) {
  // Isolamento de tenant: Funcionario pertence ao cliente via Empresa.idCliente.
  async function findTenantEmployee(db: PrismaClient, id: number, idCliente: number) {
    return db.funcionario.findFirst({
      where: { id, empresa: { idCliente } },
      select: { id: true },
    });
  }

  // Garante que a empresa informada no payload pertence ao tenant (400 se nao).
  async function assertCompanyInTenant(db: PrismaClient, idEmpresa: number, idCliente: number) {
    const company = await db.empresa.findFirst({
      where: { id: idEmpresa, idCliente },
      select: { id: true },
    });
    if (!company) throw new Error('Empresa nao pertence ao cliente.');
  }

  // Mesma conferencia para o perfil de acesso. Aqui o risco e maior do que um
  // vinculo torto: o perfil E a permissao. Sem esta trava, um id de perfil de
  // OUTRO cliente (adivinhado, sao sequenciais) entraria no funcionario e o
  // RBAC leria as permissoes desse perfil alheio a cada request.
  async function assertProfileInTenant(db: PrismaClient, idPerfilAcesso: number, idCliente: number) {
    const profile = await db.perfilAcesso.findFirst({
      where: { id: idPerfilAcesso, idCliente },
      select: { id: true },
    });
    if (!profile) throw new Error('Perfil de acesso invalido.');
  }

  app.get<{
    Querystring: { search?: string };
  }>('/employees', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const parsedQuery = listEmployeesQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) return reply.code(400).send({ message: 'Parametros invalidos.' });
    const search = parsedQuery.data.search?.trim();
    // CPF criptografado: busca parcial por CPF nao e possivel; CPF completo
    // (11 digitos) e resolvido por igualdade via caCPFHash.
    const searchDigits = search?.replace(/\D/g, '') ?? '';
    const employees = await request.tenantDb.funcionario.findMany({
      where: search
        ? {
            empresa: { idCliente },
            OR: [
              { nmFuncionario: { contains: search, mode: 'insensitive' } },
              { anEmail: { contains: search, mode: 'insensitive' } },
              ...(searchDigits.length === 11 ? [{ caCPFHash: cpfHash(searchDigits) }] : []),
            ],
          }
        : { empresa: { idCliente } },
      orderBy: { nmFuncionario: 'asc' },
      take: clampLimit(parsedQuery.data.limit),
      include: { perfilAcesso: { select: { id: true, dsPerfil: true } } },
    });
    return withDecryptedCpfList(employees);
  });

  app.post<{
    Body: EmployeePayload;
  }>('/employees', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const data = normalizeEmployeePayload(request.body);
      // Sem empresa o funcionario fica orfao de tenant (invisivel na listagem e
      // sem idCliente no login, que deriva de empresa): vinculo obrigatorio.
      if (!data.idEmpresa) throw new Error('Informe a empresa do funcionario.');
      await assertCompanyInTenant(request.tenantDb, data.idEmpresa, idCliente);
      if (data.idPerfilAcesso) await assertProfileInTenant(request.tenantDb, data.idPerfilAcesso, idCliente);
      // PII: grava o CPF criptografado + hash de lookup.
      const storedData = { ...data, ...encryptCpfFields(String(data.caCPF ?? '')) };
      const employee = await request.tenantDb.funcionario.create({
        data: storedData as unknown as Parameters<typeof request.tenantDb.funcionario.create>[0]['data'],
      });
      return reply.code(201).send(withDecryptedCpf(employee));
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao criar funcionario.'),
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: EmployeePayload;
  }>('/employees/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Funcionario invalido.');
      const current = await findTenantEmployee(request.tenantDb, id, idCliente);
      if (!current) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const data = normalizeEmployeePayload(request.body);
      if (!data.idEmpresa) throw new Error('Informe a empresa do funcionario.');
      await assertCompanyInTenant(request.tenantDb, data.idEmpresa, idCliente);
      if (data.idPerfilAcesso) await assertProfileInTenant(request.tenantDb, data.idPerfilAcesso, idCliente);
      const storedData = { ...data, ...encryptCpfFields(String(data.caCPF ?? '')) };
      const updated = await request.tenantDb.funcionario.update({
        where: { id },
        data: storedData as unknown as Parameters<typeof request.tenantDb.funcionario.update>[0]['data'],
      });
      return withDecryptedCpf(updated);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao atualizar funcionario.'),
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/employees/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Funcionario invalido.');
      const current = await findTenantEmployee(request.tenantDb, id, idCliente);
      if (!current) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const boInativo = toBool(request.body.boInativo);
      return request.tenantDb.funcionario.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do funcionario.' });
    }
  });

  app.get<{ Params: { id: string } }>('/employees/:id/related/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idFuncionario = Number(request.params.id);
      assertValidId(idFuncionario, 'Funcionario invalido.');
      const parsedQuery = limitQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) return reply.code(400).send({ message: 'Parametros invalidos.' });
      const employee = await findTenantEmployee(request.tenantDb, idFuncionario, idCliente);
      if (!employee) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      return request.tenantDb.funcionarioArquivo.findMany({
        where: { idFuncionario },
        orderBy: { dtCadastro: 'desc' },
        take: clampLimit(parsedQuery.data.limit),
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar arquivos do funcionario.'),
      });
    }
  });

  app.post<{ Params: { id: string }; Body: CompanyChildPayload }>('/employees/:id/related/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idFuncionario = Number(request.params.id);
      assertValidId(idFuncionario, 'Funcionario invalido.');
      const employee = await findTenantEmployee(request.tenantDb, idFuncionario, idCliente);
      if (!employee) return reply.code(404).send({ message: 'Registro nao encontrado.' });

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }
      assertAllowedUploadType(file);

      const fields = file.fields as Record<string, unknown>;
      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : null;
      if (idTiposArquivos !== null) assertValidId(idTiposArquivos, 'Tipo de arquivo invalido.');
      const buffer = await file.toBuffer();
      const safeMime = await assertUploadBuffer(buffer);
      const path = getEmployeeFilePath(idFuncionario, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: safeMime, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      return reply.code(201).send(await request.tenantDb.funcionarioArquivo.create({
        data: {
          idFuncionario,
          idTiposArquivos,
          dsArquivo: file.filename,
          anCaminho: path,
          cnChaveAcesso: 0,
          cnDistribuidor: 0,
        },
      }));
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao criar arquivo do funcionario.'),
      });
    }
  });

  app.put<{ Params: { id: string; childId: string }; Body: CompanyChildPayload }>('/employees/:id/related/files/:childId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idFuncionario = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idFuncionario, 'Funcionario invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const employee = await findTenantEmployee(request.tenantDb, idFuncionario, idCliente);
      if (!employee) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const current = await request.tenantDb.funcionarioArquivo.findFirst({ where: { id: childId, idFuncionario }, select: { id: true } });
      if (!current) throw new Error('Arquivo do funcionario invalido.');

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }
      assertAllowedUploadType(file);

      const fields = file.fields as Record<string, unknown>;
      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : undefined;
      if (idTiposArquivos !== undefined) assertValidId(idTiposArquivos, 'Tipo de arquivo invalido.');
      const buffer = await file.toBuffer();
      const safeMime = await assertUploadBuffer(buffer);
      const path = getEmployeeFilePath(idFuncionario, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: safeMime, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      return request.tenantDb.funcionarioArquivo.update({
        where: { id: childId },
        data: {
          idTiposArquivos,
          dsArquivo: file.filename,
          anCaminho: path,
        },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao atualizar arquivo do funcionario.'),
      });
    }
  });

  app.patch<{ Params: { id: string; childId: string }; Body: { boInativo?: number } }>('/employees/:id/related/files/:childId/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idFuncionario = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idFuncionario, 'Funcionario invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const employee = await findTenantEmployee(request.tenantDb, idFuncionario, idCliente);
      if (!employee) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const current = await request.tenantDb.funcionarioArquivo.findFirst({ where: { id: childId, idFuncionario }, select: { id: true } });
      if (!current) throw new Error('Arquivo do funcionario invalido.');
      return request.tenantDb.funcionarioArquivo.update({
        where: { id: childId },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao alterar status do arquivo do funcionario.'),
      });
    }
  });

  app.get<{ Params: { id: string; childId: string } }>('/employees/:id/related/files/:childId/url', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idFuncionario = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idFuncionario, 'Funcionario invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const employee = await findTenantEmployee(request.tenantDb, idFuncionario, idCliente);
      if (!employee) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const employeeFile = await request.tenantDb.funcionarioArquivo.findFirst({ where: { id: childId, idFuncionario, boInativo: false } });
      if (!employeeFile) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(employeeFile.anCaminho, 60 * 5);
      if (error) throw new Error(error.message);
      return { url: data.signedUrl, expiresIn: 60 * 5 };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao gerar link do arquivo.'),
      });
    }
  });

  app.delete<{ Params: { id: string; childId: string } }>('/employees/:id/related/files/:childId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idFuncionario = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idFuncionario, 'Funcionario invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const employee = await findTenantEmployee(request.tenantDb, idFuncionario, idCliente);
      if (!employee) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const current = await request.tenantDb.funcionarioArquivo.findFirst({ where: { id: childId, idFuncionario }, select: { id: true } });
      if (!current) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      return request.tenantDb.funcionarioArquivo.update({ where: { id: childId }, data: { boInativo: true } });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao remover arquivo do funcionario.'),
      });
    }
  });

  // GET /employees/:id/calendar — sessions the employee is assigned to in the month
  app.get<{
    Params: { id: string };
    Querystring: { month?: string };
  }>('/employees/:id/calendar', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idFuncionario = Number(request.params.id);
      assertValidId(idFuncionario, 'Funcionário inválido.');
      const employee = await findTenantEmployee(request.tenantDb, idFuncionario, idCliente);
      if (!employee) return reply.code(404).send({ message: 'Registro nao encontrado.' });

      const month = request.query.month ?? new Date().toISOString().slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Informe o mês no formato YYYY-MM.');

      const year = Number(month.slice(0, 4));
      const monthNumber = Number(month.slice(5, 7));
      const startsAt = new Date(year, monthNumber - 1, 1);
      const endsAt = new Date(year, monthNumber, 1);

      const sessions = await request.tenantDb.funcionarioAtividadeAgenda.findMany({
        where: {
          idFuncionario,
          boInativo: false,
          atividadeAgenda: {
            boInativo: false,
            dtInicial: { gte: startsAt, lt: endsAt },
          },
        },
        include: {
          atividadeAgenda: {
            include: {
              atividade: true,
              categoria: true,
              empresa: true,
              alunoAtividadeAgendas: { where: { boInativo: false }, select: { id: true } },
            },
          },
        },
        orderBy: { dtCadastro: 'asc' },
      });

      return { sessions };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao carregar calendário do funcionário.'),
      });
    }
  });
}
