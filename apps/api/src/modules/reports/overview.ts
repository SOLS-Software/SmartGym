// GET /reports/overview — os numeros da tela de Relatorios somados NO BANCO.
//
// POR QUE ESTA ROTA EXISTE
//
// A tela montava tudo no browser: buscava a lista de alunos e, para cada um,
// duas requisicoes (check-ins e matriculas). Para nao derrubar o navegador,
// parava nos 120 primeiros alunos ativos. Numa rede de 800 alunos o grafico de
// check-ins descrevia 15% da casa — e era apresentado ao gestor como o
// movimento da academia. O aviso de amostra parcial existia, mas o numero
// grande na tela nao carrega ressalva.
//
// O mesmo problema tinha um segundo efeito: como nao havia agregacao de
// check-in em lugar nenhum, o painel de entrada nao conseguia dizer quantas
// pessoas treinaram hoje. O card existia, marcava zero todo dia e acabou
// removido. Ele volta aqui.
//
// Uma resposta, base inteira, sem teto: cada numero abaixo e uma agregacao no
// Postgres. O que trafega e o resultado.
//
// ESCOPO DE FILIAL
//
// `idEmpresa` filtra o que TEM filial: check-ins. Aluno e matricula pertencem
// ao CLIENTE (a rede) e nao carregam idEmpresa — filtra-las por filial exigiria
// inferir a unidade pelo historico de acesso, que e chute. Mesma decisao ja
// tomada em /reports/inactive-students.
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@smartgym/db';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { matriculaAtivaWhere, matriculaVigenteWhere } from './vigencia.js';
import {
  encaixar,
  limitesDe,
  ultimasSemanas,
  ultimosMeses,
  type Janela,
  type LinhaAgregada,
} from './janelas.js';

const SEMANAS_NO_GRAFICO = 12;
const MESES_NO_GRAFICO = 6;

const overviewQuerySchema = z.object({
  idEmpresa: z.coerce.number().int().optional(),
});

/**
 * Fuso do processo, para o Postgres truncar no MESMO fuso em que as janelas
 * foram montadas.
 *
 * Sem isto, `date_trunc` agruparia sobre o valor guardado (UTC) e um check-in
 * das 22h no Brasil cairia no dia seguinte — no fim de mes, no mes seguinte.
 * O nome vai como parametro ligado (`AT TIME ZONE $n`), mas so depois de passar
 * pelo formato de zona IANA: nada de string arbitraria chegando ao banco.
 */
function fusoDoServidor(): string {
  const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return fuso && /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(fuso) ? fuso : 'UTC';
}

/**
 * Chave YYYY-MM-DD do balde, ja formatada pelo Postgres.
 *
 * A dupla conversao de fuso e o idioma do Postgres para "guardado em UTC, lido
 * no fuso do servidor": a primeira diz em que fuso o valor foi gravado, a
 * segunda em qual queremos le-lo. O `to_char` no fim e o que impede o valor de
 * voltar a ser um `Date` — ver o comentario de LinhaAgregada em ./janelas.ts.
 */
function chaveDoBalde(coluna: Prisma.Sql, unidade: 'week' | 'month', fuso: string) {
  return Prisma.sql`to_char(
    date_trunc(${unidade}, ${coluna} AT TIME ZONE 'UTC' AT TIME ZONE ${fuso}),
    'YYYY-MM-DD'
  )`;
}

function inicioDoDia(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function inicioDoMes(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), 1);
}

export async function registerOverviewRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { idEmpresa?: string } }>(
    '/reports/overview',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      const parsed = overviewQuerySchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

      try {
        const idEmpresa = parsed.data.idEmpresa ?? null;
        if (idEmpresa) {
          const empresa = await prisma.empresa.findFirst({
            where: { id: idEmpresa, idCliente },
            select: { id: true },
          });
          if (!empresa) return reply.code(404).send({ message: 'Empresa nao encontrada.' });
        }

        const agora = new Date();
        const fuso = fusoDoServidor();
        const semanas = ultimasSemanas(SEMANAS_NO_GRAFICO, agora);
        const meses = ultimosMeses(MESES_NO_GRAFICO, agora);
        const limiteSemanas = limitesDe(semanas);
        const limiteMeses = limitesDe(meses);
        const comecoDoDia = inicioDoDia(agora);
        const comecoDoMes = inicioDoMes(agora);

        // Filtro de check-in reaproveitado pelas contagens e pelas series.
        const escopoCheckIn = idEmpresa
          ? Prisma.sql`AND c."idEmpresa" = ${idEmpresa}`
          : Prisma.empty;

        const serieDeCheckIns = (
          unidade: 'week' | 'month',
          janelas: Janela[],
        ): Promise<LinhaAgregada[]> => {
          const limites = limitesDe(janelas);
          if (!limites) return Promise.resolve([]);
          return prisma.$queryRaw<LinhaAgregada[]>(Prisma.sql`
            SELECT
              ${chaveDoBalde(Prisma.sql`c."dtCadastro"`, unidade, fuso)} AS bucket,
              COUNT(*)::int AS total
            FROM "tb_AlunoCheckIns" c
            JOIN "tb_Empresas" e ON e.id = c."idEmpresa"
            WHERE c."boInativo" = false
              -- Sessao aberta pelo app nao e frequencia (ver boPresencial).
              AND c."boPresencial" = true
              AND e."idCliente" = ${idCliente}
              ${escopoCheckIn}
              AND c."dtCadastro" >= ${limites.inicio}
              AND c."dtCadastro" <= ${limites.fim}
            GROUP BY 1
          `);
        };

        const [
          alunosPorStatus,
          matriculasVigentes,
          matriculasTrancadas,
          matriculasNoInicioDoMes,
          encerradasNoMes,
          novasNoMes,
          planosNoCatalogo,
          checkInsHoje,
          checkInsNoPeriodo,
          porPlanoBruto,
          semanalBruto,
          mensalBruto,
          novosAlunosBruto,
        ] = await Promise.all([
          // Cadastro: a flag do aluno. Fica ao lado da matricula vigente, e nao
          // no lugar dela, justamente porque sao perguntas diferentes.
          prisma.aluno.groupBy({
            by: ['boInativo'],
            where: { idCliente },
            _count: { _all: true },
          }),

          prisma.alunoPlano.count({ where: matriculaVigenteWhere(idCliente, agora) }),

          // Trancadas: contrato em vigor, pausado hoje. Sai separado porque
          // somar com as ativas esconderia justamente o que o trancamento veio
          // tornar visivel — e subtrair viraria evasao, que e o erro antigo.
          prisma.alunoPlano.count({
            where: {
              AND: [
                matriculaVigenteWhere(idCliente, agora),
                { NOT: matriculaAtivaWhere(idCliente, agora) },
              ],
            },
          }),

          // Denominador da retencao: quem estava vigente no primeiro instante
          // do mes. Sem ele, "retencao" viraria de novo uma razao de cadastro.
          prisma.alunoPlano.count({ where: matriculaVigenteWhere(idCliente, comecoDoMes) }),

          prisma.alunoPlano.count({
            where: {
              boInativo: false,
              aluno: { idCliente },
              dtEncerramento: { gte: comecoDoMes, lte: agora },
            },
          }),

          prisma.alunoPlano.count({
            where: {
              boInativo: false,
              aluno: { idCliente },
              dtAdmissao: { gte: comecoDoMes, lte: agora },
            },
          }),

          // Catalogo de planos da rede (inclui os globais, sem filial vinculada
          // — mesma regra de /plans).
          prisma.plano.count({
            where: {
              boInativo: false,
              OR: [
                { planoEmpresas: { some: { empresa: { idCliente } } } },
                { planoEmpresas: { none: {} } },
              ],
            },
          }),

          prisma.alunoCheckIn.count({
            where: {
              boInativo: false,
              boPresencial: true,
              empresa: { idCliente },
              ...(idEmpresa ? { idEmpresa } : {}),
              dtCadastro: { gte: comecoDoDia, lte: agora },
            },
          }),

          // Total do MESMO periodo do grafico logo abaixo. O card antigo somava
          // "todos os check-ins de sempre" dos alunos amostrados: um numero que
          // so cresce, nao compara com nada e ainda dependia da amostra.
          prisma.alunoCheckIn.count({
            where: {
              boInativo: false,
              boPresencial: true,
              empresa: { idCliente },
              ...(idEmpresa ? { idEmpresa } : {}),
              ...(limiteSemanas
                ? { dtCadastro: { gte: limiteSemanas.inicio, lte: limiteSemanas.fim } }
                : {}),
            },
          }),

          prisma.alunoPlano.groupBy({
            by: ['idPlano'],
            where: matriculaVigenteWhere(idCliente, agora),
            _count: { _all: true },
          }),

          serieDeCheckIns('week', semanas),
          serieDeCheckIns('month', meses),

          limiteMeses
            ? prisma.$queryRaw<LinhaAgregada[]>(Prisma.sql`
                SELECT
                  ${chaveDoBalde(Prisma.sql`a."dtCadastro"`, 'month', fuso)} AS bucket,
                  COUNT(*)::int AS total
                FROM "tb_Alunos" a
                WHERE a."idCliente" = ${idCliente}
                  AND a."dtCadastro" >= ${limiteMeses.inicio}
                  AND a."dtCadastro" <= ${limiteMeses.fim}
                GROUP BY 1
              `)
            : Promise.resolve<LinhaAgregada[]>([]),
        ]);

        // Nomes dos planos so dos que aparecem: a distribuicao ja veio agregada,
        // aqui e apenas a traducao de id para rotulo.
        const idsDePlano = porPlanoBruto.map((linha) => linha.idPlano);
        const planos = idsDePlano.length
          ? await prisma.plano.findMany({
              where: { id: { in: idsDePlano } },
              select: { id: true, dsPlano: true },
            })
          : [];
        const nomePorPlano = new Map(planos.map((plano) => [plano.id, plano.dsPlano]));

        const cadastroAtivo =
          alunosPorStatus.find((linha) => linha.boInativo === false)?._count._all ?? 0;
        const cadastroInativo =
          alunosPorStatus.find((linha) => linha.boInativo === true)?._count._all ?? 0;

        // Retencao de verdade: da base que existia no comeco do mes, quanto
        // continua. A tela calculava `ativos ÷ total cadastrado`, que mede
        // quanto da HISTORIA da academia ainda esta ativa — uma casa de dez anos
        // saudavel marcava 40% e parecia em colapso.
        //
        // Sem base no inicio do mes a taxa e NULA, nao 100%: mes sem denominador
        // nao tem retencao, e inventar um numero redondo e pior que o traco.
        const taxaRetencao =
          matriculasNoInicioDoMes > 0
            ? (matriculasNoInicioDoMes - encerradasNoMes) / matriculasNoInicioDoMes
            : null;

        return {
          geradoEm: agora,
          escopo: { idEmpresa },
          periodo: {
            inicioDoMes: comecoDoMes,
            semanas: limiteSemanas,
            meses: limiteMeses,
          },
          alunos: {
            cadastrados: cadastroAtivo + cadastroInativo,
            ativos: cadastroAtivo,
            inativos: cadastroInativo,
          },
          matriculas: {
            vigentes: matriculasVigentes,
            // vigentes = ativas + trancadas, sempre.
            ativas: matriculasVigentes - matriculasTrancadas,
            trancadas: matriculasTrancadas,
            novasNoMes,
            encerradasNoMes,
          },
          planosNoCatalogo,
          checkIns: {
            hoje: checkInsHoje,
            noPeriodo: checkInsNoPeriodo,
            semanasNoPeriodo: SEMANAS_NO_GRAFICO,
          },
          retencao: {
            baseInicial: matriculasNoInicioDoMes,
            encerradas: encerradasNoMes,
            taxa: taxaRetencao,
          },
          series: {
            checkInsSemanal: encaixar(semanas, semanalBruto),
            checkInsMensal: encaixar(meses, mensalBruto),
            novosAlunosMensal: encaixar(meses, novosAlunosBruto),
          },
          porPlano: porPlanoBruto
            .map((linha) => ({
              id: linha.idPlano,
              dsPlano: nomePorPlano.get(linha.idPlano) ?? 'Plano removido',
              quantidade: linha._count._all,
            }))
            .sort((a, b) => b.quantidade - a.quantidade),
        };
      } catch (error) {
        request.log.error(error);
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao montar o panorama.'),
        });
      }
    },
  );
}
