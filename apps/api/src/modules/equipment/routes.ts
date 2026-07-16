import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import {
  normalizeEquipamentoPayload,
  normalizeEquipamentoManutencaoPayload,
  assertValidId,
} from '../../shared/normalize.js';
import { getSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import { getEquipamentoFilePath } from '../../shared/files.js';
import type { EquipamentoPayload, EquipamentoManutencaoPayload } from '../../shared/api-types.js';

export async function registerEquipmentRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { search?: string };
  }>('/equipments', async (request) => {
    const search = request.query.search?.trim();
    return prisma.equipamento.findMany({
      where: search
        ? {
          OR: [
            { nmEquipamento: { contains: search, mode: 'insensitive' } },
            { dsEquipamento: { contains: search, mode: 'insensitive' } },
          ],
        }
        : undefined,
      orderBy: { nmEquipamento: 'asc' },
    });
  });

  app.post<{
    Body: EquipamentoPayload;
  }>('/equipments', async (request, reply) => {
    try {
      const data = normalizeEquipamentoPayload(request.body);
      const equipment = await prisma.equipamento.create({ data });
      return reply.code(201).send(equipment);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar equipamento.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: EquipamentoPayload;
  }>('/equipments/:id', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const data = normalizeEquipamentoPayload(request.body);
      return prisma.equipamento.update({ where: { id }, data });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar equipamento.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/equipments/:id/status', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const boInativo = toBool(request.body.boInativo);
      return prisma.equipamento.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do equipamento.' });
    }
  });

  // Equipment files

  app.get<{
    Params: { id: string };
  }>('/equipments/:id/files', async (request, reply) => {
    try {
      const idEquipamento = Number(request.params.id);
      assertValidId(idEquipamento, 'Equipamento invalido.');
      return prisma.equipamentoArquivo.findMany({
        where: { idEquipamento, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar arquivos do equipamento.',
      });
    }
  });

  app.post<{
    Params: { id: string };
  }>('/equipments/:id/files', async (request, reply) => {
    try {
      const idEquipamento = Number(request.params.id);
      assertValidId(idEquipamento, 'Equipamento invalido.');

      const equipment = await prisma.equipamento.findUnique({
        where: { id: idEquipamento },
        select: { id: true },
      });

      if (!equipment) {
        return reply.code(404).send({ message: 'Equipamento nao encontrado.' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }

      const buffer = await file.toBuffer();
      const path = getEquipamentoFilePath(idEquipamento, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const equipmentFile = await prisma.equipamentoArquivo.create({
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
        message: error instanceof Error ? error.message : 'Erro ao enviar arquivo do equipamento.',
      });
    }
  });

  app.get<{
    Params: { id: string; fileId: string };
  }>('/equipments/:id/files/:fileId/url', async (request, reply) => {
    try {
      const idEquipamento = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idEquipamento, 'Equipamento invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      const equipmentFile = await prisma.equipamentoArquivo.findFirst({
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
        message: error instanceof Error ? error.message : 'Erro ao gerar link do arquivo.',
      });
    }
  });

  app.delete<{
    Params: { id: string; fileId: string };
  }>('/equipments/:id/files/:fileId', async (request, reply) => {
    try {
      const idEquipamento = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idEquipamento, 'Equipamento invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      const existingFile = await prisma.equipamentoArquivo.findFirst({
        where: { id: fileId, idEquipamento, boInativo: false },
      });

      if (!existingFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      return prisma.equipamentoArquivo.update({
        where: { id: fileId },
        data: { boInativo: true },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao remover arquivo do equipamento.',
      });
    }
  });

  // Equipment maintenances

  app.get<{
    Params: { id: string };
  }>('/equipments/:id/maintenances', async (request, reply) => {
    try {
      const idEquipamento = Number(request.params.id);
      assertValidId(idEquipamento, 'Equipamento invalido.');
      return prisma.equipamentoManutencao.findMany({
        where: { idEquipamento, boInativo: false },
        orderBy: { dtExecucao: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar manutencoes do equipamento.',
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body: EquipamentoManutencaoPayload;
  }>('/equipments/:id/maintenances', async (request, reply) => {
    try {
      const idEquipamento = Number(request.params.id);
      assertValidId(idEquipamento, 'Equipamento invalido.');
      const data = normalizeEquipamentoManutencaoPayload(request.body);
      const maintenance = await prisma.equipamentoManutencao.create({
        data: { ...data, idEquipamento },
      });
      return reply.code(201).send(maintenance);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar manutencao.',
      });
    }
  });

  app.put<{
    Params: { id: string; maintenanceId: string };
    Body: EquipamentoManutencaoPayload;
  }>('/equipments/:id/maintenances/:maintenanceId', async (request, reply) => {
    try {
      const idEquipamento = Number(request.params.id);
      const maintenanceId = Number(request.params.maintenanceId);
      assertValidId(idEquipamento, 'Equipamento invalido.');
      assertValidId(maintenanceId, 'Manutencao invalida.');

      const existing = await prisma.equipamentoManutencao.findFirst({
        where: { id: maintenanceId, idEquipamento },
      });

      if (!existing) {
        return reply.code(404).send({ message: 'Manutencao nao encontrada.' });
      }

      const data = normalizeEquipamentoManutencaoPayload(request.body);
      return prisma.equipamentoManutencao.update({ where: { id: maintenanceId }, data });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar manutencao.',
      });
    }
  });

  app.patch<{
    Params: { id: string; maintenanceId: string };
    Body: { boInativo?: number };
  }>('/equipments/:id/maintenances/:maintenanceId/status', async (request, reply) => {
    try {
      const maintenanceId = Number(request.params.maintenanceId);
      const boInativo = toBool(request.body.boInativo);
      return prisma.equipamentoManutencao.update({
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
    try {
      const idEquipamento = Number(request.params.id);
      const maintenanceId = Number(request.params.maintenanceId);
      assertValidId(idEquipamento, 'Equipamento invalido.');
      assertValidId(maintenanceId, 'Manutencao invalida.');

      const existing = await prisma.equipamentoManutencao.findFirst({
        where: { id: maintenanceId, idEquipamento },
      });

      if (!existing) {
        return reply.code(404).send({ message: 'Manutencao nao encontrada.' });
      }

      return prisma.equipamentoManutencao.update({
        where: { id: maintenanceId },
        data: { boInativo: true },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao remover manutencao.',
      });
    }
  });
}
