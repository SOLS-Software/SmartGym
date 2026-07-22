import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { getComprefaceConfig, recognizeComprefaceFace } from '../../shared/compreface.js';
import { assertAllowedUploadType } from '../../shared/files.js';

export async function registerAccessRoutes(app: FastifyInstance) {
  app.post('/access/facial/recognize', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const file = await request.file();

      if (!file) {
        return reply.code(400).send({ message: 'Envie uma imagem para reconhecimento facial.' });
      }
      assertAllowedUploadType(file);

      const buffer = await file.toBuffer();
      const recognition = await recognizeComprefaceFace(buffer, file.filename);
      const prediction = recognition.result?.[0]?.subjects?.[0];
      const subject = prediction?.subject;
      const similarity = Number(prediction?.similarity ?? 0);

      if (!subject) {
        return { match: false, access: 'denied', similarity, message: 'Nenhum aluno reconhecido.' };
      }

      // Isolamento de tenant: so considera biometrias de alunos do cliente do
      // usuario autenticado; subject de outro tenant cai no fluxo de mismatch.
      const biometric = await prisma.alunoBiometriaFacial.findFirst({
        where: {
          dsProvider: 'compreface',
          dsSubject: subject,
          boInativo: false,
          aluno: { idCliente },
        },
        select: {
          idAluno: true,
          nrThreshold: true,
          aluno: { select: { id: true, nmAluno: true } },
        },
        orderBy: { dtCadastro: 'desc' },
      });

      if (!biometric) {
        return {
          match: false,
          access: 'denied',
          subject,
          similarity,
          message: 'Biometria facial nao vinculada a um aluno ativo.',
        };
      }

      const threshold = Math.max(
        Number(biometric.nrThreshold),
        getComprefaceConfig().similarityThreshold,
      );
      const match = similarity >= threshold;

      return {
        match,
        access: match ? 'granted' : 'denied',
        idAluno: match ? biometric.idAluno : null,
        aluno: match ? biometric.aluno : null,
        subject,
        similarity,
        threshold,
      };
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao reconhecer biometria facial.',
      });
    }
  });
}
