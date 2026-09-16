// Registro de ponto do funcionario.
//
// Duas metades com permissoes diferentes de proposito:
//
//  - /time-clock/me e a PROPRIA jornada. Liberado a qualquer funcionario
//    autenticado (ver ALWAYS_ALLOWED em plugins/permissions.ts), pelo mesmo
//    motivo de /auth/me: exigir permissao para bater o proprio ponto criaria o
//    absurdo de um funcionario novo nao conseguir registrar que chegou.
//
//  - /time-clock (sem /me) e o espelho de TODO MUNDO e a correcao manual. Isso
//    e trabalho de gerente e exige employees.read / employees.write.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { assertValidId, optionalNumber } from '../../shared/normalize.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { buildTimeSheet, formatMinutes, nextPunchType } from '../../shared/timeclock.js';

const punchSchema = z.object({
  idEmpresa: z.union([z.number(), z.string()]).nullish(),
});

const manualSchema = z.object({
  idFuncionario: z.union([z.number(), z.string()]),
  cnTipo: z.enum(['entrada', 'saida']),
  dtRegistro: z.string().min(1),
  // Obrigatoria: uma batida lancada por outra pessoa sem justificativa e
  // indistinguivel de adulteracao do espelho.
  dsObservacao: z.string().min(3).max(255),
  idEmpresa: z.union([z.number(), z.string()]).nullish(),
});

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  idFuncionario: z.coerce.number().int().optional(),
});

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function resolveRange(from?: string, to?: string) {
  const hoje = new Date();
  return {
    inicio: from ? new Date(`${from}T00:00:00`) : startOfMonth(hoje),
    fim: to ? new Date(`${to}T23:59:59.999`) : endOfMonth(hoje),
  };
}

/** Funcionarios do tenant. O ponto nao tem coluna de cliente: o vinculo e
 *  Funcionario -> Empresa -> Cliente, e e por ele que o escopo se fecha. */
function tenantScope(idCliente: number) {
  return { funcionario: { empresa: { idCliente } } };
}

export async function registerTimeClockRoutes(app: FastifyInstance) {
  // --- a propria jornada -----------------------------------------------------

  app.post<{ Body: unknown }>('/time-clock/me', async (request, reply) => {
    const idFuncionario = request.user.idFuncionario;
    if (!idFuncionario) {
      return reply.code(403).send({ message: 'Somente funcionario registra ponto.' });
    }

    const parsed = punchSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ message: 'Dados invalidos.' });

    try {
      const funcionario = await request.tenantDb.funcionario.findUnique({
        where: { id: idFuncionario },
        select: { id: true, idEmpresa: true, empresa: { select: { idCliente: true } } },
      });
      if (!funcionario) return reply.code(404).send({ message: 'Funcionario nao encontrado.' });

      // A filial informada tem que ser do mesmo cliente: quem trabalha em duas
      // unidades bate em cada uma, mas nao em unidade de outra academia.
      let idEmpresa = optionalNumber(parsed.data.idEmpresa) ?? funcionario.idEmpresa;
      if (idEmpresa && funcionario.empresa?.idCliente) {
        const empresa = await request.tenantDb.empresa.findFirst({
          where: { id: idEmpresa, idCliente: funcionario.empresa.idCliente },
          select: { id: true },
        });
        if (!empresa) idEmpresa = funcionario.idEmpresa;
      }

      const inicioDoDia = new Date();
      inicioDoDia.setHours(0, 0, 0, 0);

      const ultima = await request.tenantDb.funcionarioPonto.findFirst({
        where: { idFuncionario, boInativo: false, dtRegistro: { gte: inicioDoDia } },
        orderBy: { dtRegistro: 'desc' },
        select: { id: true, cnTipo: true, dtRegistro: true },
      });

      // Duas batidas no mesmo minuto sao clique duplo, nao jornada de um
      // minuto. Devolver a batida anterior deixa a tela consistente sem gravar
      // um par que teria de ser corrigido depois.
      if (ultima && Date.now() - new Date(ultima.dtRegistro).getTime() < 60_000) {
        return reply.code(200).send({ ...ultima, repetida: true });
      }

      const registro = await request.tenantDb.funcionarioPonto.create({
        data: {
          idFuncionario,
          idEmpresa,
          cnTipo: nextPunchType(ultima),
          idUsuarioCadastro: request.user.sub,
        },
      });

      return reply.code(201).send({ ...registro, repetida: false });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao registrar ponto.'),
      });
    }
  });

  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/time-clock/me',
    async (request, reply) => {
      const idFuncionario = request.user.idFuncionario;
      if (!idFuncionario) {
        return reply.code(403).send({ message: 'Somente funcionario tem espelho de ponto.' });
      }

      const parsed = rangeSchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

      try {
        const { inicio, fim } = resolveRange(parsed.data.from, parsed.data.to);

        const batidas = await request.tenantDb.funcionarioPonto.findMany({
          where: { idFuncionario, boInativo: false, dtRegistro: { gte: inicio, lte: fim } },
          orderBy: { dtRegistro: 'asc' },
        });

        const espelho = buildTimeSheet(batidas);

        // A tela precisa saber o que o botao vai gravar ANTES do clique, senao
        // o funcionario nao sabe se esta chegando ou saindo.
        const inicioDoDia = new Date();
        inicioDoDia.setHours(0, 0, 0, 0);
        const ultimaHoje = await request.tenantDb.funcionarioPonto.findFirst({
          where: { idFuncionario, boInativo: false, dtRegistro: { gte: inicioDoDia } },
          orderBy: { dtRegistro: 'desc' },
          select: { id: true, cnTipo: true, dtRegistro: true },
        });

        return {
          periodo: { inicio, fim },
          proximaBatida: nextPunchType(ultimaHoje),
          ultimaBatida: ultimaHoje,
          totalFormatado: formatMinutes(espelho.totalMinutos),
          ...espelho,
        };
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao carregar o espelho de ponto.'),
        });
      }
    },
  );

  // --- espelho da equipe (gerente) ------------------------------------------

  app.get<{ Querystring: { from?: string; to?: string; idFuncionario?: string } }>(
    '/time-clock',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      const parsed = rangeSchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

      try {
        const { inicio, fim } = resolveRange(parsed.data.from, parsed.data.to);

        const batidas = await request.tenantDb.funcionarioPonto.findMany({
          where: {
            boInativo: false,
            dtRegistro: { gte: inicio, lte: fim },
            ...tenantScope(idCliente),
            ...(parsed.data.idFuncionario
              ? { idFuncionario: parsed.data.idFuncionario }
              : {}),
          },
          orderBy: { dtRegistro: 'asc' },
          include: {
            funcionario: { select: { id: true, nmFuncionario: true } },
            empresa: { select: { id: true, dsEmpresa: true } },
          },
        });

        // Um espelho por pessoa: o gerente compara funcionarios, nao batidas
        // soltas de todo mundo numa lista so.
        const porFuncionario = new Map<number, typeof batidas>();
        for (const batida of batidas) {
          const lista = porFuncionario.get(batida.idFuncionario);
          if (lista) lista.push(batida);
          else porFuncionario.set(batida.idFuncionario, [batida]);
        }

        const funcionarios = [...porFuncionario.entries()].map(([id, lista]) => {
          const espelho = buildTimeSheet(lista);
          return {
            idFuncionario: id,
            nmFuncionario: lista[0]?.funcionario?.nmFuncionario ?? 'Funcionario',
            totalMinutos: espelho.totalMinutos,
            totalFormatado: formatMinutes(espelho.totalMinutos),
            diasTrabalhados: espelho.diasTrabalhados,
            // Dia com batida faltando: e a lista de correcoes que o gerente
            // tem que fazer antes de fechar o mes.
            diasInconsistentes: espelho.dias.filter((dia) => dia.inconsistente).length,
            dias: espelho.dias,
          };
        });

        funcionarios.sort((a, b) => a.nmFuncionario.localeCompare(b.nmFuncionario, 'pt-BR'));

        return { periodo: { inicio, fim }, funcionarios };
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao carregar o espelho de ponto.'),
        });
      }
    },
  );

  // Correcao: batida esquecida lancada pelo gerente. Fica marcada com boManual
  // para o espelho nunca confundir o que a pessoa bateu com o que alguem
  // lancou por ela.
  app.post<{ Body: unknown }>('/time-clock', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    const parsed = manualSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: 'Dados invalidos. A justificativa da correcao e obrigatoria.',
      });
    }

    try {
      const idFuncionario = Number(parsed.data.idFuncionario);
      assertValidId(idFuncionario, 'Funcionario invalido.');

      const funcionario = await request.tenantDb.funcionario.findFirst({
        where: { id: idFuncionario, empresa: { idCliente } },
        select: { id: true, idEmpresa: true },
      });
      if (!funcionario) return reply.code(404).send({ message: 'Funcionario nao encontrado.' });

      const dtRegistro = new Date(parsed.data.dtRegistro);
      if (Number.isNaN(dtRegistro.getTime())) {
        return reply.code(400).send({ message: 'Data e hora invalidas.' });
      }
      // Ponto no futuro nao e correcao, e agendamento — e nao existe agendar
      // uma hora que ainda nao foi trabalhada.
      if (dtRegistro.getTime() > Date.now()) {
        return reply.code(400).send({ message: 'Nao e possivel lancar ponto no futuro.' });
      }

      let idEmpresa = optionalNumber(parsed.data.idEmpresa) ?? funcionario.idEmpresa;
      if (idEmpresa) {
        const empresa = await request.tenantDb.empresa.findFirst({
          where: { id: idEmpresa, idCliente },
          select: { id: true },
        });
        if (!empresa) idEmpresa = funcionario.idEmpresa;
      }

      const registro = await request.tenantDb.funcionarioPonto.create({
        data: {
          idFuncionario,
          idEmpresa,
          cnTipo: parsed.data.cnTipo,
          dtRegistro,
          boManual: true,
          dsObservacao: parsed.data.dsObservacao.trim(),
          idUsuarioCadastro: request.user.sub,
        },
      });

      return reply.code(201).send(registro);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao lancar a correcao de ponto.'),
      });
    }
  });

  // Anular uma batida errada. INATIVA, nao apaga: o espelho de ponto e
  // documento de jornada, e documento nao perde linha — a linha anulada
  // continua no banco com boInativo, fora da conta e disponivel para auditoria.
  app.delete<{ Params: { id: string } }>('/time-clock/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Batida invalida.');

      const batida = await request.tenantDb.funcionarioPonto.findFirst({
        where: { id, ...tenantScope(idCliente) },
        select: { id: true },
      });
      if (!batida) return reply.code(404).send({ message: 'Registro nao encontrado.' });

      return await request.tenantDb.funcionarioPonto.update({
        where: { id },
        data: { boInativo: true, idUsuarioAlteracao: request.user.sub },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao anular a batida.'),
      });
    }
  });
}
