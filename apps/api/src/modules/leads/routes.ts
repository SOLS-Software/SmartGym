// Interessados que ainda nao sao alunos.
//
// Duas metades com publicos opostos:
//
//  - POST /public/leads e ABERTO (sem token). E a unica rota de negocio sem
//    autenticacao no sistema, porque quem a usa por definicao ainda nao tem
//    conta. Por isso ela e a mais defendida: rate limit proprio, tenant
//    resolvido pelo DOMINIO e nunca pelo corpo, e deduplicacao por contato.
//
//  - GET/PATCH /leads sao da equipe e seguem o RBAC normal (dominio students:
//    atender interessado e trabalho de quem faz matricula).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { assertValidId, optionalNumber } from '../../shared/normalize.js';
import { clientErrorMessage } from '../../shared/errors.js';

const STATUS = ['novo', 'em_contato', 'convertido', 'perdido'] as const;

/** Janela de deduplicacao do formulario publico. */
const HORAS_DEDUPE = 24;

const publicSchema = z.object({
  // Dominio de onde o formulario foi aberto. E ele que decide o tenant.
  caDominio: z.string().min(1).max(255),
  nmLead: z.string().min(2).max(255),
  nrDDD: z.union([z.number(), z.string()]).nullish(),
  nrContato: z.string().max(20).nullish(),
  anEmail: z.string().max(100).nullish(),
  dsMensagem: z.string().max(500).nullish(),
  idEmpresa: z.union([z.number(), z.string()]).nullish(),
  idPlano: z.union([z.number(), z.string()]).nullish(),
});

const updateSchema = z.object({
  cnStatus: z.enum(STATUS).optional(),
  dsObservacao: z.string().max(500).nullish(),
  idAluno: z.union([z.number(), z.string()]).nullish(),
  idEmpresa: z.union([z.number(), z.string()]).nullish(),
});

const listQuerySchema = z.object({
  cnStatus: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** So digitos, limitado ao tamanho da coluna. */
function digits(value: unknown, max: number): string | null {
  const cleaned = String(value ?? '').replace(/\D/g, '');
  return cleaned ? cleaned.slice(0, max) : null;
}

export async function registerLeadRoutes(app: FastifyInstance) {
  // Rota publica: qualquer um na internet alcanca. 5/min por IP — um
  // interessado real preenche o formulario uma vez, e o limite global de
  // 300/min seria generoso demais para um endpoint que GRAVA sem login.
  const publicRateLimit = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } };

  app.post<{ Body: unknown }>('/public/leads', publicRateLimit, async (request, reply) => {
    const parsed = publicSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: 'Dados invalidos.' });

    try {
      // O TENANT VEM DO DOMINIO, nao do corpo. Se o formulario mandasse
      // idCliente, qualquer um na internet escolheria em qual academia
      // despejar leads falsos so trocando um numero. Pelo dominio, o atacante
      // precisa de um dominio ja cadastrado — que e publico de qualquer forma,
      // porque e o endereco do site.
      const dominio = await prisma.dominioCorporativo.findFirst({
        where: { urlDominio: parsed.data.caDominio.trim().toLowerCase(), boAtivo: true },
        select: { idCliente: true },
      });
      if (!dominio) return reply.code(404).send({ message: 'Academia nao encontrada.' });

      const idCliente = dominio.idCliente;
      const nrContato = digits(parsed.data.nrContato, 9);
      const anEmail = (parsed.data.anEmail ?? '').trim().toLowerCase().slice(0, 100);

      // A empresa e o plano informados precisam ser DESTE cliente: sao os
      // unicos ids que o formulario envia, e um id de outro tenant criaria um
      // lead apontando para fora da academia.
      const idEmpresa = optionalNumber(parsed.data.idEmpresa);
      if (idEmpresa) {
        const empresa = await prisma.empresa.findFirst({
          where: { id: idEmpresa, idCliente },
          select: { id: true },
        });
        if (!empresa) return reply.code(404).send({ message: 'Unidade nao encontrada.' });
      }

      const idPlano = optionalNumber(parsed.data.idPlano);
      if (idPlano) {
        const plano = await prisma.plano.findFirst({
          where: { id: idPlano, idCliente },
          select: { id: true },
        });
        if (!plano) return reply.code(404).send({ message: 'Plano nao encontrado.' });
      }

      // Deduplicacao: quem clica "enviar" tres vezes por nervosismo nao pode
      // virar tres pessoas na fila da recepcao. Reenviar dentro da janela
      // responde 201 do mesmo jeito — dizer "voce ja mandou" entregaria a
      // quem esta sondando que aquele telefone existe na base.
      const desde = new Date(Date.now() - HORAS_DEDUPE * 60 * 60 * 1000);
      const contato = [
        ...(nrContato ? [{ nrContato }] : []),
        ...(anEmail ? [{ anEmail }] : []),
      ];

      if (contato.length > 0) {
        const jaExiste = await prisma.lead.findFirst({
          where: { idCliente, boInativo: false, dtCadastro: { gte: desde }, OR: contato },
          select: { id: true },
        });
        if (jaExiste) return reply.code(201).send({ id: jaExiste.id, duplicado: true });
      }

      const lead = await prisma.lead.create({
        data: {
          idCliente,
          idEmpresa,
          idPlano,
          nmLead: parsed.data.nmLead.trim().slice(0, 255),
          nrDDD: optionalNumber(digits(parsed.data.nrDDD, 2)),
          nrContato,
          anEmail,
          dsMensagem: parsed.data.dsMensagem?.trim().slice(0, 500) || null,
          caOrigem: 'site',
        },
        select: { id: true },
      });

      // Resposta minima de proposito: o formulario publico so precisa saber
      // que chegou. Devolver o registro inteiro exporia idCliente e idEmpresa
      // a quem nao esta autenticado.
      return reply.code(201).send({ id: lead.id, duplicado: false });
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send({ message: 'Nao foi possivel registrar seu interesse.' });
    }
  });

  // --- fila da equipe --------------------------------------------------------

  app.get<{ Querystring: { cnStatus?: string; limit?: string } }>(
    '/leads',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

      try {
        return prisma.lead.findMany({
          where: {
            idCliente,
            boInativo: false,
            ...(parsed.data.cnStatus ? { cnStatus: parsed.data.cnStatus } : {}),
          },
          take: parsed.data.limit ?? 200,
          include: {
            empresa: { select: { id: true, dsEmpresa: true } },
            plano: { select: { id: true, dsPlano: true } },
            aluno: { select: { id: true, nmAluno: true } },
          },
          orderBy: { dtCadastro: 'desc' },
        });
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao listar interessados.'),
        });
      }
    },
  );

  // Cadastro pelo balcao: alguem ligou ou entrou perguntando. Mesmo registro
  // do formulario, com caOrigem diferente para o funil separar os dois.
  app.post<{ Body: unknown }>('/leads', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    const parsed = publicSchema.omit({ caDominio: true }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: 'Dados invalidos.' });

    try {
      const idEmpresa = optionalNumber(parsed.data.idEmpresa);
      if (idEmpresa) {
        const empresa = await prisma.empresa.findFirst({
          where: { id: idEmpresa, idCliente },
          select: { id: true },
        });
        if (!empresa) return reply.code(404).send({ message: 'Unidade nao encontrada.' });
      }

      const lead = await prisma.lead.create({
        data: {
          idCliente,
          idEmpresa,
          idPlano: optionalNumber(parsed.data.idPlano),
          nmLead: parsed.data.nmLead.trim().slice(0, 255),
          nrDDD: optionalNumber(digits(parsed.data.nrDDD, 2)),
          nrContato: digits(parsed.data.nrContato, 9),
          anEmail: (parsed.data.anEmail ?? '').trim().toLowerCase().slice(0, 100),
          dsMensagem: parsed.data.dsMensagem?.trim().slice(0, 500) || null,
          caOrigem: 'balcao',
          idFuncionario: request.user.idFuncionario,
        },
      });

      return reply.code(201).send(lead);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao registrar interessado.'),
      });
    }
  });

  app.patch<{ Params: { id: string }; Body: unknown }>('/leads/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: 'Dados invalidos.' });

    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Interessado invalido.');

      const lead = await prisma.lead.findFirst({
        where: { id, idCliente },
        select: { id: true, cnStatus: true },
      });
      if (!lead) return reply.code(404).send({ message: 'Registro nao encontrado.' });

      // Vincular ao aluno e o que fecha o funil, entao o aluno tem que ser
      // deste cliente — senao "convertido" apontaria para gente de fora.
      const idAluno = optionalNumber(parsed.data.idAluno);
      if (idAluno) {
        const aluno = await prisma.aluno.findFirst({
          where: { id: idAluno, idCliente },
          select: { id: true },
        });
        if (!aluno) return reply.code(404).send({ message: 'Aluno nao encontrado.' });
      }

      const idEmpresa = optionalNumber(parsed.data.idEmpresa);
      if (idEmpresa) {
        const empresa = await prisma.empresa.findFirst({
          where: { id: idEmpresa, idCliente },
          select: { id: true },
        });
        if (!empresa) return reply.code(404).send({ message: 'Unidade nao encontrada.' });
      }

      const mudouStatus =
        parsed.data.cnStatus !== undefined && parsed.data.cnStatus !== lead.cnStatus;

      return await prisma.lead.update({
        where: { id },
        data: {
          ...(parsed.data.cnStatus !== undefined ? { cnStatus: parsed.data.cnStatus } : {}),
          ...(parsed.data.dsObservacao !== undefined
            ? { dsObservacao: parsed.data.dsObservacao?.trim() || null }
            : {}),
          ...(idAluno ? { idAluno } : {}),
          ...(idEmpresa ? { idEmpresa } : {}),
          // Quem mexeu no lead passa a ser o responsavel por ele, e a data de
          // contato marca quando alguem de fato o atendeu.
          idFuncionario: request.user.idFuncionario,
          ...(mudouStatus ? { dtContato: new Date() } : {}),
        },
        include: {
          empresa: { select: { id: true, dsEmpresa: true } },
          plano: { select: { id: true, dsPlano: true } },
          aluno: { select: { id: true, nmAluno: true } },
        },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao atualizar interessado.'),
      });
    }
  });
}
