import { z } from 'zod';
import { Prisma } from '@smartgym/db';
import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@smartgym/db';
import { prisma } from '../../shared/prisma.js';
import {
  normalizeCompanyPayload,
  assertValidId,
  corDoTema,
  fonteDoTema,
  numeroNaFaixa,
  optionalNumber,
  requiredText,
  requiredWithin,
  optionalText,
  optionalDate,
  trimmedWithin,
  getMultipartFieldValue,
} from '../../shared/normalize.js';
import { LIMITES } from '@smartgym/shared';
import { getSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import { getStudentAccessStatus } from '../../shared/studentAccess.js';
import { assertAllowedUploadType, assertUploadBuffer, getCompanyFilePath, getPromotionFilePath } from '../../shared/files.js';
import type { CompanyChildPayload, CompanyChildResource, CompanyPayload } from '../../shared/api-types.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { consumirBeneficioDeProduto } from '../../shared/planBenefitsDb.js';
import { getStatusIdByName } from '../../shared/payments.js';
import { creditCheckInPoints, registerPointsEntry } from '../../shared/loyalty.js';

// ---------------------------------------------------------------------------
// Company child resource config
// ---------------------------------------------------------------------------

type CrudDelegate = {
  findMany(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
};

type ChildResourceConfig = {
  delegate: (db: PrismaClient) => CrudDelegate;
  orderBy: Record<string, string>;
  companyField: string | null;
  include?: Record<string, unknown>;
  getWhere?(companyId: number): Record<string, unknown>;
  normalize(companyId: number, payload: CompanyChildPayload): Record<string, unknown>;
};

// O delegate nao pode ser resolvido no carregamento do modulo: com banco por
// tenant, o client certo so existe no request. A config guarda COMO chegar ao
// delegate, e nao o delegate.
function asCrudDelegate(delegate: unknown) {
  return delegate as CrudDelegate;
}

const childResourceConfig: Record<CompanyChildResource, ChildResourceConfig> = {
  promotions: {
    delegate: (db: PrismaClient) => asCrudDelegate(db.promocao),
    orderBy: { dsPromocao: 'asc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        dsPromocao: requiredWithin(payload.dsPromocao, LIMITES.promocao.dsPromocao, 'Informe a promocao.', 'O nome da promocao'),
        qtPeriodo: numeroNaFaixa(payload.qtPeriodo ?? 0, 'qtPeriodo', 'O periodo') ?? 0,
        idUnidadeTempo: optionalNumber(payload.idUnidadeTempo),
        vlDesconto: numeroNaFaixa(payload.vlDesconto ?? 0, 'vlDesconto', 'O valor de desconto') ?? 0,
        pcDesconto: numeroNaFaixa(payload.pcDesconto ?? 0, 'pcDesconto', 'O percentual de desconto') ?? 0,
        dtInicio: optionalDate(payload.dtInicio) ?? new Date(),
        dtEncerramento: optionalDate(payload.dtEncerramento) ?? null,
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'promotion-products': {
    delegate: (db: PrismaClient) => asCrudDelegate(db.promocaoProduto),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idPromocao: optionalNumber(payload.idPromocao),
        idProduto: optionalNumber(payload.idProduto),
        qtDisponivel: optionalNumber(payload.qtDisponivel),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'promotion-files': {
    delegate: (db: PrismaClient) => asCrudDelegate(db.promocaoArquivo),
    orderBy: { dtCadastro: 'desc' },
    companyField: null,
    getWhere(companyId: number) {
      return { promocao: { idEmpresa: companyId } };
    },
    normalize(_companyId: number, payload: CompanyChildPayload) {
      return {
        idPromocao: optionalNumber(payload.idPromocao),
        idTiposArquivos: optionalNumber(payload.idTiposArquivos),
        dsArquivo: requiredWithin(payload.dsArquivo, LIMITES.arquivo.dsArquivo, 'Informe o arquivo.', 'O nome do arquivo'),
        anCaminho: trimmedWithin(payload.anCaminho, LIMITES.arquivo.anCaminho, 'O caminho do arquivo') ?? '',
        cnChaveAcesso: optionalNumber(payload.cnChaveAcesso),
        cnDistribuidor: optionalNumber(payload.cnDistribuidor),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'student-plans': {
    delegate: (db: PrismaClient) => asCrudDelegate(db.alunoPlano),
    orderBy: { dtCadastro: 'desc' },
    companyField: null,
    getWhere(companyId: number) {
      // AlunoPlano nao tem mais idEmpresa: escopa via PlanoEmpresa (acesso multi-empresa)
      return { plano: { planoEmpresas: { some: { idEmpresa: companyId } } } };
    },
    include: {
      aluno: true,
      plano: true,
      promocaoPlano: {
        include: {
          promocao: true,
        },
      },
    },
    normalize(_companyId: number, payload: CompanyChildPayload) {
      const idAluno = optionalNumber(payload.idAluno);
      if (!idAluno) throw new Error('Selecione o aluno.');
      const idPlano = optionalNumber(payload.idPlano);
      if (!idPlano) throw new Error('Selecione o plano.');
      return {
        idAluno,
        idPlano,
        idPromocaoPlano: optionalNumber(payload.idPromocaoPlano),
        // Mesma trava que /students ja aplica: sem ela esta rota aceitava dia 99.
        nrDiaPagamento:
          numeroNaFaixa(payload.nrDiaPagamento ?? 1, 'nrDiaPagamento', 'O dia de pagamento') ?? 1,
        dtAdmissao: optionalDate(payload.dtAdmissao) ?? new Date(),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  payments: {
    delegate: (db: PrismaClient) => asCrudDelegate(db.pagamento),
    orderBy: { dtPagamento: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      const idStatusPagamento = optionalNumber(payload.idStatusPagamento);
      if (!idStatusPagamento) throw new Error('Informe o status do pagamento.');
      return {
        idEmpresa: companyId,
        idAlunoPlano: optionalNumber(payload.idAlunoPlano),
        idProdutoMovimentacao: optionalNumber(payload.idProdutoMovimentacao),
        vlPrevisto: numeroNaFaixa(payload.vlPrevisto ?? payload.vlPago ?? 0, 'vlPrevisto', 'O valor previsto') ?? 0,
        vlPago: numeroNaFaixa(payload.vlPago, 'vlPago', 'O valor pago'),
        idStatusPagamento,
        idFormaPagamento: optionalNumber(payload.idFormaPagamento),
        dtVencimento: optionalDate(payload.dtVencimento),
        dtCompetencia: optionalDate(payload.dtCompetencia),
        dtPagamento: optionalDate(payload.dtPagamento) ?? new Date(),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'product-movements': {
    delegate: (db: PrismaClient) => asCrudDelegate(db.produtoMovimentacao),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    include: {
      aluno: true,
      produto: true,
    },
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idProduto: optionalNumber(payload.idProduto),
        idAluno: optionalNumber(payload.idAluno),
        qtMovimentada: numeroNaFaixa(payload.qtMovimentada ?? 0, 'qtMovimentada', 'A quantidade') ?? 0,
        vlUnitario: numeroNaFaixa(payload.vlUnitario ?? 0, 'vlUnitario', 'O valor unitario') ?? 0,
        qtDisponivel: numeroNaFaixa(payload.qtDisponivel ?? 0, 'qtDisponivel', 'A quantidade disponivel') ?? 0,
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  purchases: {
    delegate: (db: PrismaClient) => asCrudDelegate(db.produtoMovimentacao),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    include: {
      produto: true,
      fornecedor: true,
    },
    getWhere(companyId: number) {
      return { idEmpresa: companyId, idFornecedor: { not: null } };
    },
    normalize(companyId: number, payload: CompanyChildPayload) {
      const idProduto = optionalNumber(payload.idProduto);
      if (!idProduto) throw new Error('Selecione o produto.');
      const idFornecedor = optionalNumber(payload.idFornecedor);
      if (!idFornecedor) throw new Error('Selecione o fornecedor.');
      const qtMovimentada = Number(payload.qtMovimentada ?? 0);
      if (qtMovimentada <= 0) throw new Error('Informe uma quantidade valida.');
      return {
        idEmpresa: companyId,
        idProduto,
        idFornecedor,
        idAluno: null,
        qtMovimentada,
        vlUnitario: numeroNaFaixa(payload.vlUnitario ?? 0, 'vlUnitario', 'O valor unitario') ?? 0,
        qtDisponivel: 0,
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  // Venda no balcao: o mesmo ProdutoMovimentacao das compras, do outro lado do
  // estoque. Compra tem idFornecedor e SOMA; venda tem idAluno e SUBTRAI — e e
  // assim que as duas listagens se separam (getWhere).
  sales: {
    delegate: (db: PrismaClient) => asCrudDelegate(db.produtoMovimentacao),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    include: {
      produto: true,
      aluno: { select: { id: true, nmAluno: true } },
      pagamentos: { select: { id: true, vlPrevisto: true, vlPago: true, idStatusPagamento: true } },
      alunoPontuacoes: { select: { id: true, qtPontos: true } },
    },
    getWhere(companyId: number) {
      return { idEmpresa: companyId, idAluno: { not: null } };
    },
    normalize(companyId: number, payload: CompanyChildPayload) {
      const idProduto = optionalNumber(payload.idProduto);
      if (!idProduto) throw new Error('Selecione o produto.');
      const idAluno = optionalNumber(payload.idAluno);
      if (!idAluno) throw new Error('Selecione o aluno.');
      const qtMovimentada = Number(payload.qtMovimentada ?? 0);
      if (!Number.isInteger(qtMovimentada) || qtMovimentada <= 0) {
        throw new Error('Informe uma quantidade valida.');
      }
      return {
        idEmpresa: companyId,
        idProduto,
        idAluno,
        idFornecedor: null,
        qtMovimentada,
        vlUnitario: numeroNaFaixa(payload.vlUnitario ?? 0, 'vlUnitario', 'O valor unitario') ?? 0,
        qtDisponivel: 0,
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'company-files': {
    delegate: (db: PrismaClient) => asCrudDelegate(db.empresaArquivo),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idTiposArquivos: optionalNumber(payload.idTiposArquivos),
        dsArquivo: requiredWithin(payload.dsArquivo, LIMITES.arquivo.dsArquivo, 'Informe o arquivo.', 'O nome do arquivo'),
        anCaminho: trimmedWithin(payload.anCaminho, LIMITES.arquivo.anCaminho, 'O caminho do arquivo') ?? '',
        cnChaveAcesso: optionalNumber(payload.cnChaveAcesso),
        cnDistribuidor: optionalNumber(payload.cnDistribuidor),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'student-check-ins': {
    delegate: (db: PrismaClient) => asCrudDelegate(db.alunoCheckIn),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idAlunoPlano: optionalNumber(payload.idAlunoPlano),
        idAlunoTreinosSequencia: optionalNumber(payload.idAlunoTreinosSequencia),
        idPontuacao: optionalNumber(payload.idPontuacao),
        idTipoCheckIn: optionalNumber(payload.idTipoCheckIn),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  points: {
    delegate: (db: PrismaClient) => asCrudDelegate(db.pontuacao),
    orderBy: { dsPontuacao: 'asc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        dsPontuacao: requiredWithin(payload.dsPontuacao, LIMITES.pontuacao.dsPontuacao, 'Informe a descricao da pontuacao.', 'A descricao da pontuacao'),
        qtPontos: numeroNaFaixa(payload.qtPontos ?? 0, 'qtPontos', 'Os pontos') ?? 0,
        boPadrao: toBool(payload.boPadrao),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  themes: {
    delegate: (db: PrismaClient) => asCrudDelegate(db.tema),
    orderBy: { dsTema: 'asc' },
    companyField: null,
    normalize(_companyId: number, payload: CompanyChildPayload) {
      return {
        dsTema: requiredWithin(payload.dsTema, LIMITES.tema.dsTema, 'Informe o tema.', 'O nome do tema'),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
};

function getChildResourceConfig(resource: string) {
  const config = childResourceConfig[resource as CompanyChildResource];
  if (!config) {
    throw new Error('Tabela filha invalida.');
  }
  return config;
}

// ---------------------------------------------------------------------------
// Validacao de entrada (zod)
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});

/** Valida a query de listagem; limit sofre clamp 1..1000 (default 1000). */
function parseListQuery(query: unknown) {
  const parsed = listQuerySchema.safeParse(query ?? {});
  if (!parsed.success) return null;
  const limit = Math.min(1000, Math.max(1, parsed.data.limit ?? 1000));
  return { search: parsed.data.search, limit };
}

// Body de status: aceita os mesmos tipos que toBool trata.
const statusBodySchema = z.object({
  boInativo: z.union([z.boolean(), z.number(), z.string()]).optional(),
});

// Bodies genericos (children/custom-theme): garante objeto antes do normalize.
const looseBodySchema = z.record(z.unknown());

// ---------------------------------------------------------------------------
// Company geo (PostGIS): geoEmpresa is an Unsupported geometry column, so it is
// read/written with raw SQL (same pattern as Localidade). Address scalars go
// through Prisma; only the point needs raw access.
// ---------------------------------------------------------------------------

// geoEmpresa is decomposed into latitude/longitude so the client can edit it.
const COMPANY_SELECT_COLUMNS = Prisma.sql`
  id, "idCliente", "idTema", "dsEmpresa", "caCNPJ",
  "anCEP", "anLogradouro", "nrEndereco", "anBairro", "anCidade", "anUF",
  "nrDDD", "nrContato",
  ST_Y("geoEmpresa") as latitude, ST_X("geoEmpresa") as longitude,
  "dtCadastro", "dtAlteracao", "idUsuarioCadastro", "idUsuarioAlteracao", "boInativo"
`;

/** Parses latitude/longitude from a company payload, validating ranges when present. */
function parseCompanyGeo(payload: CompanyPayload) {
  const latitude = optionalNumber(payload.latitude);
  const longitude = optionalNumber(payload.longitude);
  if (latitude === null && longitude === null) {
    return { hasGeo: false as const, latitude: null, longitude: null };
  }
  if (latitude === null || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Informe uma latitude valida.');
  }
  if (longitude === null || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Informe uma longitude valida.');
  }
  return { hasGeo: true as const, latitude, longitude };
}

/** Confere se a empresa pertence ao tenant (idCliente) do usuario autenticado. */
async function companyBelongsToTenant(db: PrismaClient, companyId: number, idCliente: number) {
  const company = await db.empresa.findFirst({
    where: { id: companyId, idCliente },
    select: { id: true },
  });
  return Boolean(company);
}

/**
 * Confere se o registro filho pertence a empresa informada. Recursos sem
 * escopo de empresa (themes) sao globais e passam direto.
 */
async function childBelongsToCompany(db: PrismaClient, config: ChildResourceConfig, companyId: number, childId: number) {
  const scope = config.getWhere
    ? config.getWhere(companyId)
    : config.companyField
      ? { [config.companyField]: companyId }
      : null;
  if (!scope) return true;
  const rows = (await config.delegate(db).findMany({
    where: { id: childId, ...scope },
    take: 1,
  })) as unknown[];
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Registra a venda de um produto para um aluno.
//
// Tudo numa transacao porque os tres efeitos so fazem sentido juntos: sai do
// estoque, gera a cobranca (ou debita os pontos) e fica rastreavel. Se a
// cobranca falhar depois do estoque baixado, o produto some do sistema sem
// ninguem dever nada por ele.
//
// Duas formas de pagar, decididas por `boResgatePontos`:
//   dinheiro -> cria um Pagamento ligado a movimentacao (quitado ou pendente);
//   pontos   -> debita o extrato de fidelidade e NAO cria cobranca.
// Regra padrao e uma so por filial: marcar uma desmarca a anterior. Duas
// regras padrao fariam o credito automatico depender de qual o banco devolve
// primeiro — comportamento que ninguem consegue explicar depois.
async function clearDefaultPointRule(db: PrismaClient, companyId: number, exceptId?: number) {
  await db.pontuacao.updateMany({
    where: {
      idEmpresa: companyId,
      boPadrao: true,
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    data: { boPadrao: false },
  });
}

async function createSale(db: PrismaClient, params: {
  companyId: number;
  idCliente: number;
  data: Record<string, unknown>;
  payload: CompanyChildPayload;
  include?: Record<string, unknown>;
  /** Quem esta no balcao — fica no registro de uso do beneficio. */
  idUsuario?: number | null;
}) {
  const { companyId, idCliente, data, payload, include } = params;
  const idProduto = Number(data.idProduto);
  const idAluno = Number(data.idAluno);
  const quantidade = Number(data.qtMovimentada);

  // Aluno e produto tem que ser deste cliente: ids sao sequenciais e adivinhar
  // o de outro tenant nao pode virar uma venda cruzada.
  const aluno = await db.aluno.findFirst({
    where: { id: idAluno, idCliente },
    select: { id: true },
  });
  if (!aluno) throw new Error('Aluno invalido.');

  const produto = await db.produto.findFirst({
    where: {
      id: idProduto,
      // idEmpresa nulo = produto compartilhado pela rede (convencao do projeto).
      OR: [{ empresa: { idCliente } }, { idEmpresa: null }],
    },
    select: { id: true, dsProduto: true, qtEstoque: true, vlVenda: true, qtPontosResgate: true },
  });
  if (!produto) throw new Error('Produto invalido.');

  if (produto.qtEstoque < quantidade) {
    throw new Error(
      `Estoque insuficiente: ha ${produto.qtEstoque} unidade(s) de ${produto.dsProduto}.`,
    );
  }

  const resgateEmPontos = toBool(payload.boResgatePontos);
  // Terceira forma de "pagar": o produto ja e direito da matricula. Explicita,
  // como o resgate por pontos — consumir o direito sozinho gastaria, sem
  // ninguem pedir, a camiseta que o aluno talvez quisesse guardar para depois.
  const peloBeneficio = toBool(payload.boBeneficioPlano);

  if (resgateEmPontos && peloBeneficio) {
    throw new Error('Escolha uma forma so: pontos ou beneficio do plano.');
  }

  if (resgateEmPontos && !produto.qtPontosResgate) {
    throw new Error('Este produto nao tem preco em pontos definido.');
  }

  // Preco: o que o operador digitou; na ausencia, o preco sugerido do cadastro.
  // Entrega por direito do plano nao tem preco: ja foi paga na mensalidade.
  const vlUnitario = peloBeneficio ? 0 : Number(data.vlUnitario) || Number(produto.vlVenda ?? 0);
  const total = vlUnitario * quantidade;

  const idStatusPagamento = resgateEmPontos
    ? null
    : optionalNumber(payload.idStatusPagamento);
  const pago = toBool(payload.boPago);

  return prisma.$transaction(async (transaction) => {
    const movimentacao = await transaction.produtoMovimentacao.create({
      data: { ...data, vlUnitario } as never,
    });

    const atualizado = await transaction.produto.update({
      where: { id: idProduto },
      data: { qtEstoque: { decrement: quantidade } },
    });

    // qtDisponivel guarda o estoque DEPOIS do movimento, como nas compras.
    await transaction.produtoMovimentacao.update({
      where: { id: movimentacao.id },
      data: { qtDisponivel: atualizado.qtEstoque },
    });

    if (peloBeneficio) {
      // Baixa do direito na MESMA transacao da baixa do estoque: sem direito
      // disponivel isto lanca, e o rollback devolve o produto ao estoque —
      // entregar de graca sem direito e decisao de gente, nao efeito colateral.
      await consumirBeneficioDeProduto(transaction, {
        idAluno,
        idCliente,
        idProduto,
        idEmpresa: companyId,
        quantidade,
        idProdutoMovimentacao: movimentacao.id,
        idUsuario: params.idUsuario ?? null,
      });
    } else if (resgateEmPontos) {
      await registerPointsEntry(transaction, {
        idAluno,
        idEmpresa: companyId,
        idProdutoMovimentacao: movimentacao.id,
        qtPontos: -(produto.qtPontosResgate ?? 0) * quantidade,
        dsHistorico: `Resgate: ${produto.dsProduto}`,
      });
    } else if (total > 0) {
      const status =
        idStatusPagamento ??
        (pago
          ? await getStatusIdByName(transaction, 'Pago')
          : await getStatusIdByName(transaction, 'Pendente'));
      if (!status) throw new Error('Status de pagamento nao configurado.');

      await transaction.pagamento.create({
        data: {
          idEmpresa: companyId,
          idProdutoMovimentacao: movimentacao.id,
          idStatusPagamento: status,
          idFormaPagamento: optionalNumber(payload.idFormaPagamento),
          vlPrevisto: total,
          // Venda fiada entra com valor pago zerado: o que ficou devendo
          // aparece junto das mensalidades em atraso, que e onde a recepcao
          // ja olha.
          vlPago: pago ? total : 0,
          dtVencimento: optionalDate(payload.dtVencimento) ?? new Date(),
          dtCompetencia: new Date(),
          dtPagamento: pago ? new Date() : null,
          boInativo: false,
        },
      });
    }

    return transaction.produtoMovimentacao.findUniqueOrThrow({
      where: { id: movimentacao.id },
      include: include as never,
    });
  });
}

export async function registerCompanyRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { search?: string };
  }>('/companies', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const query = parseListQuery(request.query);
    if (!query) return reply.code(400).send({ message: 'Parametros invalidos.' });
    const search = query.search?.trim();
    // Tenant sempre presente; search entra como condicao adicional.
    const conditions = [Prisma.sql`"idCliente" = ${idCliente}`];
    if (search) {
      const digits = search.replace(/\D/g, '');
      // Only match on CNPJ when the term actually has digits, otherwise a plain
      // text search would widen to every row via LIKE '%%'.
      if (digits) {
        conditions.push(
          Prisma.sql`("dsEmpresa" ILIKE ${`%${search}%`} OR "caCNPJ" LIKE ${`%${digits}%`})`,
        );
      } else {
        conditions.push(Prisma.sql`"dsEmpresa" ILIKE ${`%${search}%`}`);
      }
    }
    return request.tenantDb.$queryRaw`
      SELECT ${COMPANY_SELECT_COLUMNS} FROM "tb_Empresas"
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY "dsEmpresa" ASC
      LIMIT ${query.limit}`;
  });

  app.post<{
    Body: CompanyPayload;
  }>('/companies', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      // idCliente vem sempre do token: o body nunca define o tenant.
      const data = normalizeCompanyPayload({ ...request.body, idCliente });
      const geo = parseCompanyGeo(request.body);
      const company = await prisma.$transaction(async (tx) => {
        const created = await tx.empresa.create({ data });
        if (geo.hasGeo) {
          await tx.$executeRaw`UPDATE "tb_Empresas" SET "geoEmpresa" = ST_SetSRID(ST_MakePoint(${geo.longitude}, ${geo.latitude}), 4326) WHERE id = ${created.id}`;
        }
        return created;
      });
      return reply.code(201).send({ ...company, latitude: geo.latitude, longitude: geo.longitude });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao criar empresa.'),
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: CompanyPayload;
  }>('/companies/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Empresa invalida.');
      if (!(await companyBelongsToTenant(request.tenantDb, id, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      // idCliente vem sempre do token: o body nunca define o tenant.
      const data = normalizeCompanyPayload({ ...request.body, idCliente });
      const geo = parseCompanyGeo(request.body);
      const company = await prisma.$transaction(async (tx) => {
        const updated = await tx.empresa.update({ where: { id }, data });
        if (geo.hasGeo) {
          await tx.$executeRaw`UPDATE "tb_Empresas" SET "geoEmpresa" = ST_SetSRID(ST_MakePoint(${geo.longitude}, ${geo.latitude}), 4326) WHERE id = ${id}`;
        }
        return updated;
      });
      return { ...company, latitude: geo.latitude, longitude: geo.longitude };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao atualizar empresa.'),
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/companies/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Empresa invalida.');
      if (!(await companyBelongsToTenant(request.tenantDb, id, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const body = statusBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ message: 'Dados invalidos.' });
      const boInativo = toBool(body.data.boInativo);
      return request.tenantDb.empresa.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status da empresa.' });
    }
  });

  // Company files

  app.get<{
    Params: { id: string };
  }>('/companies/:id/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const query = parseListQuery(request.query);
    if (!query) return reply.code(400).send({ message: 'Parametros invalidos.' });
    try {
      const idEmpresa = Number(request.params.id);
      assertValidId(idEmpresa, 'Empresa invalida.');
      return request.tenantDb.empresaArquivo.findMany({
        where: { idEmpresa, boInativo: false, empresa: { idCliente } },
        orderBy: { dtCadastro: 'desc' },
        take: query.limit,
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar arquivos da empresa.'),
      });
    }
  });

  app.post<{
    Params: { id: string };
  }>('/companies/:id/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEmpresa = Number(request.params.id);
      assertValidId(idEmpresa, 'Empresa invalida.');

      if (!(await companyBelongsToTenant(request.tenantDb, idEmpresa, idCliente))) {
        return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }
      assertAllowedUploadType(file);

      const fields = file.fields as Record<string, unknown>;
      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const dsArquivo = file.filename;
      const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : null;

      const buffer = await file.toBuffer();
      const safeMime = await assertUploadBuffer(buffer);
      const path = getCompanyFilePath(idEmpresa, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: safeMime, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const companyFile = await request.tenantDb.empresaArquivo.create({
        data: { idEmpresa, idTiposArquivos, dsArquivo, anCaminho: path, cnChaveAcesso: 0, cnDistribuidor: 0 },
      });

      return reply.code(201).send(companyFile);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao enviar arquivo da empresa.'),
      });
    }
  });

  app.put<{
    Params: { id: string; fileId: string };
  }>('/companies/:id/files/:fileId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEmpresa = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idEmpresa, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');

      const existingFile = await request.tenantDb.empresaArquivo.findFirst({
        where: { id: fileId, idEmpresa, boInativo: false, empresa: { idCliente } },
      });

      if (!existingFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }
      assertAllowedUploadType(file);

      const fields = file.fields as Record<string, unknown>;
      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const dsArquivo = file.filename;
      const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : existingFile.idTiposArquivos;

      const buffer = await file.toBuffer();
      const safeMime = await assertUploadBuffer(buffer);
      const path = getCompanyFilePath(idEmpresa, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: safeMime, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      return request.tenantDb.empresaArquivo.update({
        where: { id: fileId },
        data: { idTiposArquivos, dsArquivo, anCaminho: path },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao alterar arquivo da empresa.'),
      });
    }
  });

  app.get<{
    Params: { id: string; fileId: string };
  }>('/companies/:id/files/:fileId/url', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEmpresa = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idEmpresa, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');

      const companyFile = await request.tenantDb.empresaArquivo.findFirst({
        where: { id: fileId, idEmpresa, boInativo: false, empresa: { idCliente } },
      });

      if (!companyFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(companyFile.anCaminho, 60 * 5);

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
  }>('/companies/:id/files/:fileId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEmpresa = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idEmpresa, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');

      const existingFile = await request.tenantDb.empresaArquivo.findFirst({
        where: { id: fileId, idEmpresa, boInativo: false, empresa: { idCliente } },
      });

      if (!existingFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      return request.tenantDb.empresaArquivo.update({ where: { id: fileId }, data: { boInativo: true } });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao remover arquivo da empresa.'),
      });
    }
  });

  // Company children (generic)

  app.get<{
    Params: { companyId: string };
  }>('/companies/:companyId/promotion-files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const query = parseListQuery(request.query);
    if (!query) return reply.code(400).send({ message: 'Parametros invalidos.' });
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      return request.tenantDb.promocaoArquivo.findMany({
        where: { promocao: { idEmpresa: companyId, empresa: { idCliente } } },
        orderBy: { dtCadastro: 'desc' },
        take: query.limit,
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar arquivos de promocao.'),
      });
    }
  });

  app.post<{
    Params: { companyId: string };
  }>('/companies/:companyId/promotion-files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      const file = await request.file();
      if (!file) return reply.code(400).send({ message: 'Envie um arquivo.' });
      assertAllowedUploadType(file);

      const fields = file.fields as Record<string, unknown>;
      const idPromocao = Number(getMultipartFieldValue(fields, 'idPromocao'));
      assertValidId(idPromocao, 'Promocao invalida.');
      const promotion = await request.tenantDb.promocao.findFirst({ where: { id: idPromocao, idEmpresa: companyId, empresa: { idCliente } }, select: { id: true } });
      if (!promotion) return reply.code(404).send({ message: 'Promocao nao encontrada.' });

      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : null;
      const buffer = await file.toBuffer();
      const safeMime = await assertUploadBuffer(buffer);
      const path = getPromotionFilePath(idPromocao, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: safeMime, upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      return reply.code(201).send(await request.tenantDb.promocaoArquivo.create({
        data: { idPromocao, idTiposArquivos, dsArquivo: file.filename, anCaminho: path, cnChaveAcesso: 0, cnDistribuidor: 0 },
      }));
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao enviar arquivo de promocao.'),
      });
    }
  });

  app.put<{
    Params: { companyId: string; fileId: string };
  }>('/companies/:companyId/promotion-files/:fileId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      const fileId = Number(request.params.fileId);
      assertValidId(companyId, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');
      const current = await request.tenantDb.promocaoArquivo.findFirst({
        where: { id: fileId, promocao: { idEmpresa: companyId, empresa: { idCliente } } },
      });
      if (!current) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });

      const file = await request.file();
      if (!file) return reply.code(400).send({ message: 'Envie um arquivo.' });
      assertAllowedUploadType(file);
      const fields = file.fields as Record<string, unknown>;
      const idPromocao = Number(getMultipartFieldValue(fields, 'idPromocao') || current.idPromocao);
      assertValidId(idPromocao, 'Promocao invalida.');
      const promotion = await request.tenantDb.promocao.findFirst({ where: { id: idPromocao, idEmpresa: companyId, empresa: { idCliente } }, select: { id: true } });
      if (!promotion) return reply.code(404).send({ message: 'Promocao nao encontrada.' });

      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const buffer = await file.toBuffer();
      const safeMime = await assertUploadBuffer(buffer);
      const path = getPromotionFilePath(idPromocao, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: safeMime, upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      return request.tenantDb.promocaoArquivo.update({
        where: { id: fileId },
        data: {
          idPromocao,
          idTiposArquivos: rawFileTypeId ? Number(rawFileTypeId) : current.idTiposArquivos,
          dsArquivo: file.filename,
          anCaminho: path,
        },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao alterar arquivo de promocao.'),
      });
    }
  });

  app.get<{
    Params: { companyId: string; fileId: string };
  }>('/companies/:companyId/promotion-files/:fileId/url', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      const fileId = Number(request.params.fileId);
      assertValidId(companyId, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');
      const promotionFile = await request.tenantDb.promocaoArquivo.findFirst({
        where: { id: fileId, promocao: { idEmpresa: companyId, empresa: { idCliente } }, boInativo: false },
      });
      if (!promotionFile) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(promotionFile.anCaminho, 60 * 5);
      if (error) throw new Error(error.message);
      return { url: data.signedUrl, expiresIn: 60 * 5 };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao gerar link do arquivo.'),
      });
    }
  });

  app.delete<{
    Params: { companyId: string; fileId: string };
  }>('/companies/:companyId/promotion-files/:fileId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      const fileId = Number(request.params.fileId);
      assertValidId(companyId, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');
      const current = await request.tenantDb.promocaoArquivo.findFirst({
        where: { id: fileId, promocao: { idEmpresa: companyId, empresa: { idCliente } } },
        select: { id: true },
      });
      if (!current) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      return request.tenantDb.promocaoArquivo.update({ where: { id: fileId }, data: { boInativo: true } });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao remover arquivo de promocao.'),
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Movimento do dia na filial: quem entrou, a que horas e por qual via.
  //
  // NAO e "quem esta na academia agora" — a catraca registra entrada e nao
  // saida, entao esse numero nao existe no banco. Chamar de "movimento de hoje"
  // e o que os dados sustentam; inventar uma contagem de presentes seria mostrar
  // um numero que ninguem consegue conferir.
  app.get<{
    Params: { companyId: string };
  }>('/companies/:companyId/reception', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      if (!(await companyBelongsToTenant(request.tenantDb, companyId, idCliente))) {
        return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }

      const inicioDoDia = new Date();
      inicioDoDia.setHours(0, 0, 0, 0);

      const checkIns = await request.tenantDb.alunoCheckIn.findMany({
        // Quem esta na academia agora. Sessao aberta pelo app nao entra: a
        // recepcao leria como pessoa presente alguem que so abriu o celular.
        where: {
          idEmpresa: companyId,
          boInativo: false,
          boPresencial: true,
          dtCadastro: { gte: inicioDoDia },
        },
        take: 500,
        include: {
          aluno: { select: { id: true, nmAluno: true } },
          tipoCheckIn: { select: { id: true, dsTipoCheckIn: true } },
          atividadeAgenda: { select: { id: true, atividade: { select: { dsAtividade: true } } } },
        },
        orderBy: { dtCadastro: 'desc' },
      });

      return {
        dia: inicioDoDia,
        total: checkIns.length,
        // Pessoas distintas: quem entrou, saiu e voltou conta uma vez.
        alunosDistintos: new Set(checkIns.map((item) => item.idAluno)).size,
        checkIns,
      };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao carregar o movimento do dia.'),
      });
    }
  });

  // Custom theme
  // ---------------------------------------------------------------------------

  app.get<{
    Params: { companyId: string };
  }>('/companies/:companyId/custom-theme', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      if (!(await companyBelongsToTenant(request.tenantDb, companyId, idCliente))) {
        return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }
      const tema = await request.tenantDb.temaCustomizado.findUnique({
        where: { idEmpresa: companyId },
        include: { arquivoLogo: true, arquivoFavicon: true },
      });
      if (!tema) return reply.code(204).send();
      return tema;
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao buscar tema.'),
      });
    }
  });

  app.put<{
    Params: { companyId: string };
    Body: Record<string, unknown>;
  }>('/companies/:companyId/custom-theme', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      if (!(await companyBelongsToTenant(request.tenantDb, companyId, idCliente))) {
        return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }
      if (!looseBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }
      const b = request.body;
      // Este bloco e a SEGUNDA copia do normalizador de tema (a outra esta em
      // clients/routes.ts, para o tema do cliente) e ja tinha divergido dela em
      // dois pontos:
      //
      //  - Sem conferencia de formato: "azul" era gravado literal na coluna
      //    VarChar(7), virava `--color-primary: azul` e derrubava o tema da
      //    empresa inteira, sem erro em camada nenhuma.
      //  - `?? '#000000'` nunca dispara. `optionalText` devolve STRING VAZIA
      //    quando o campo nao vem, nao null, e `??` so cobre null/undefined —
      //    entao cor ausente gravava '' em vez do padrao. A copia do cliente
      //    usava `|| '#000000'`, que funciona.
      //
      // As duas copias passam a chamar os mesmos helpers de @smartgym/shared.
      const data = {
        corPrimaria: corDoTema(b.corPrimaria, '#000000', 'A cor primaria'),
        corSecundaria: corDoTema(b.corSecundaria, '#FFFFFF', 'A cor secundaria'),
        corAcentuacao: corDoTema(b.corAcentuacao, '#FF0000', 'A cor de acentuacao'),
        corTexto: corDoTema(b.corTexto, '#000000', 'A cor do texto'),
        corFundo: corDoTema(b.corFundo, '#FFFFFF', 'A cor de fundo'),
        fontePrincipal: fonteDoTema(b.fontePrincipal, 'Inter', 'A fonte principal'),
        fonteSecundaria: fonteDoTema(b.fonteSecundaria, 'Open Sans', 'A fonte secundaria'),
        tamanhoBase: numeroNaFaixa(b.tamanhoBase ?? 14, 'tamanhoBase', 'O tamanho da fonte') ?? 14,
        espacamentoPadrao:
          numeroNaFaixa(b.espacamentoPadrao ?? 16, 'espacamentoPadrao', 'O espacamento') ?? 16,
        raioCardBorder:
          numeroNaFaixa(b.raioCardBorder ?? 8, 'raioCardBorder', 'O raio da borda') ?? 8,
        boModoEscuro: toBool(b.boModoEscuro ?? false),
        idArquivoLogo: optionalNumber(b.idArquivoLogo),
        idArquivoFavicon: optionalNumber(b.idArquivoFavicon),
      };
      const tema = await request.tenantDb.temaCustomizado.upsert({
        where: { idEmpresa: companyId },
        create: { idEmpresa: companyId, ...data },
        update: data,
        include: { arquivoLogo: true, arquivoFavicon: true },
      });
      return tema;
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao salvar tema.'),
      });
    }
  });

  app.get<{
    Params: { companyId: string; resource: string };
  }>('/companies/:companyId/children/:resource', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const query = parseListQuery(request.query);
    if (!query) return reply.code(400).send({ message: 'Parametros invalidos.' });
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      if (!(await companyBelongsToTenant(request.tenantDb, companyId, idCliente))) {
        return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }
      const config = getChildResourceConfig(request.params.resource);
      const where = config.getWhere
        ? config.getWhere(companyId)
        : config.companyField
          ? { [config.companyField]: companyId }
          : undefined;
      return await config.delegate(request.tenantDb).findMany({
        where,
        orderBy: config.orderBy,
        take: query.limit,
        ...(config.include ? { include: config.include } : {}),
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar registros filhos.'),
      });
    }
  });

  app.post<{
    Params: { companyId: string; resource: string };
    Body: CompanyChildPayload;
  }>('/companies/:companyId/children/:resource', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      if (!(await companyBelongsToTenant(request.tenantDb, companyId, idCliente))) {
        return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }
      const config = getChildResourceConfig(request.params.resource);
      if (!looseBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }
      const data = config.normalize(companyId, request.body) as Record<string, unknown>;
      if (request.params.resource === 'student-check-ins') {
        if (!data.idAluno && data.idAlunoPlano) {
          const plan = await request.tenantDb.alunoPlano.findUnique({
            where: { id: Number(data.idAlunoPlano) },
            select: { idAluno: true },
          });
          if (!plan) throw new Error('Plano do aluno invalido.');
          data.idAluno = plan.idAluno;
        }
        // Recepcao: a unidade e a da empresa da rota.
        const access = await getStudentAccessStatus(prisma, Number(data.idAluno), companyId);
        if (!access.canAccess) {
          throw new Error(access.reason ?? 'Aluno sem acesso liberado para check-in.');
        }

        // Mesmo par check-in + credito da ficha do aluno, na mesma transacao.
        const created = await prisma.$transaction(async (transaction) => {
          const checkIn = await transaction.alunoCheckIn.create({ data: data as never });
          await creditCheckInPoints(transaction, {
            idAluno: Number(data.idAluno),
            idEmpresa: companyId,
            idAlunoCheckIn: checkIn.id,
            idPontuacaoEscolhida: data.idPontuacao ? Number(data.idPontuacao) : null,
          });
          return checkIn;
        });
        return reply.code(201).send(created);
      }
      if (request.params.resource === 'purchases') {
        // Fornecedor e da rede (Fornecedor.idCliente): impede referenciar por
        // id um fornecedor de outro cliente.
        const supplier = await request.tenantDb.fornecedor.findFirst({
          where: { id: Number(data.idFornecedor), idCliente },
          select: { id: true },
        });
        if (!supplier) throw new Error('Fornecedor invalido.');
        const created = await prisma.$transaction(async (tx) => {
          const movement = await tx.produtoMovimentacao.create({ data: data as never });
          const product = await tx.produto.update({
            where: { id: Number(data.idProduto) },
            data: { qtEstoque: { increment: Number(data.qtMovimentada) } },
          });
          return tx.produtoMovimentacao.update({
            where: { id: movement.id },
            data: { qtDisponivel: product.qtEstoque },
            include: config.include,
          });
        });
        return reply.code(201).send(created);
      }
      if (request.params.resource === 'points' && data.boPadrao === true) {
        await clearDefaultPointRule(request.tenantDb, companyId);
      }
      if (request.params.resource === 'sales') {
        return reply.code(201).send(
          await createSale(request.tenantDb, {
            companyId,
            idCliente,
            data,
            payload: request.body,
            include: config.include,
            idUsuario: request.user.sub ?? null,
          }),
        );
      }
      return reply.code(201).send(await config.delegate(request.tenantDb).create({ data }));
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao criar registro filho.'),
      });
    }
  });

  app.put<{
    Params: { companyId: string; resource: string; childId: string };
    Body: CompanyChildPayload;
  }>('/companies/:companyId/children/:resource/:childId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      const childId = Number(request.params.childId);
      assertValidId(companyId, 'Empresa invalida.');
      assertValidId(childId, 'Registro invalido.');
      const config = getChildResourceConfig(request.params.resource);
      if (!(await companyBelongsToTenant(request.tenantDb, companyId, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      if (!(await childBelongsToCompany(request.tenantDb, config, companyId, childId))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      if (!looseBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }
      const data = config.normalize(companyId, request.body) as Record<string, unknown>;

      // Venda mexeu em tres lugares ao nascer (estoque, cobranca, pontos).
      // Editar exigiria desfazer e refazer os tres com o dinheiro possivelmente
      // ja recebido no meio. Cancelar e lancar de novo e a operacao correta —
      // e a que o cancelamento abaixo ja sabe reverter.
      if (request.params.resource === 'sales') {
        throw new Error(
          'Venda nao pode ser editada. Cancele a venda e registre uma nova.',
        );
      }

      if (request.params.resource === 'points' && data.boPadrao === true) {
        await clearDefaultPointRule(request.tenantDb, companyId, childId);
      }

      if (request.params.resource === 'purchases') {
        const existing = await request.tenantDb.produtoMovimentacao.findUnique({ where: { id: childId } });
        if (!existing) throw new Error('Compra nao encontrada.');
        // Fornecedor e da rede (Fornecedor.idCliente): impede referenciar por
        // id um fornecedor de outro cliente.
        const supplier = await request.tenantDb.fornecedor.findFirst({
          where: { id: Number(data.idFornecedor), idCliente },
          select: { id: true },
        });
        if (!supplier) throw new Error('Fornecedor invalido.');
        const updated = await prisma.$transaction(async (tx) => {
          if (existing.boInativo === false) {
            await tx.produto.update({
              where: { id: existing.idProduto },
              data: { qtEstoque: { decrement: existing.qtMovimentada } },
            });
          }
          let product = null;
          if (data.boInativo === false) {
            product = await tx.produto.update({
              where: { id: Number(data.idProduto) },
              data: { qtEstoque: { increment: Number(data.qtMovimentada) } },
            });
          } else {
            product = await tx.produto.findUnique({ where: { id: Number(data.idProduto) } });
          }
          return tx.produtoMovimentacao.update({
            where: { id: childId },
            data: { ...data, qtDisponivel: product?.qtEstoque ?? 0 },
            include: config.include,
          });
        });
        return updated;
      }
      return await config.delegate(request.tenantDb).update({ where: { id: childId }, data });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao atualizar registro filho.'),
      });
    }
  });

  app.patch<{
    Params: { companyId: string; resource: string; childId: string };
    Body: { boInativo?: number };
  }>('/companies/:companyId/children/:resource/:childId/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      const childId = Number(request.params.childId);
      assertValidId(companyId, 'Empresa invalida.');
      assertValidId(childId, 'Registro invalido.');
      const config = getChildResourceConfig(request.params.resource);
      if (!(await companyBelongsToTenant(request.tenantDb, companyId, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      if (!(await childBelongsToCompany(request.tenantDb, config, companyId, childId))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const body = statusBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ message: 'Dados invalidos.' });
      const nextInativo = toBool(body.data.boInativo);

      // Cancelar a venda desfaz os tres efeitos: produto volta para o estoque,
      // a cobranca e inativada e os pontos resgatados voltam para o aluno. Sem
      // isso, cancelar deixaria o aluno sem o produto E sem os pontos.
      if (request.params.resource === 'sales') {
        const existing = await request.tenantDb.produtoMovimentacao.findUnique({
          where: { id: childId },
          include: { alunoPontuacoes: { where: { boInativo: false } } },
        });
        if (!existing) throw new Error('Venda nao encontrada.');
        if (existing.boInativo === nextInativo) {
          return await config.delegate(request.tenantDb).update({
            where: { id: childId },
            data: { boInativo: nextInativo },
          });
        }

        const produto = await request.tenantDb.produto.findUnique({
          where: { id: existing.idProduto },
          select: { qtEstoque: true, dsProduto: true },
        });
        if (!produto) throw new Error('Produto da venda nao encontrado.');

        // Reativar so e possivel se o estoque comportar a saida de novo.
        if (!nextInativo && produto.qtEstoque < existing.qtMovimentada) {
          throw new Error(
            `Estoque insuficiente para reativar: ha ${produto.qtEstoque} unidade(s) de ${produto.dsProduto}.`,
          );
        }

        return await prisma.$transaction(async (tx) => {
          await tx.produto.update({
            where: { id: existing.idProduto },
            // Cancelar devolve ao estoque; reativar tira de novo.
            data: { qtEstoque: { increment: nextInativo ? existing.qtMovimentada : -existing.qtMovimentada } },
          });

          await tx.pagamento.updateMany({
            where: { idProdutoMovimentacao: childId },
            data: { boInativo: nextInativo },
          });

          // Estorno dos pontos: um lancamento novo de sinal contrario, nunca
          // apagando o original — o extrato e append-only (ver loyalty.ts).
          for (const lancamento of existing.alunoPontuacoes) {
            if (!nextInativo) continue;
            await registerPointsEntry(tx, {
              idAluno: existing.idAluno as number,
              idEmpresa: existing.idEmpresa,
              idProdutoMovimentacao: childId,
              qtPontos: -lancamento.qtPontos,
              dsHistorico: `Estorno de resgate: ${produto.dsProduto}`,
            });
          }

          return tx.produtoMovimentacao.update({
            where: { id: childId },
            data: { boInativo: nextInativo },
            include: config.include,
          });
        });
      }

      if (request.params.resource === 'purchases') {
        const existing = await request.tenantDb.produtoMovimentacao.findUnique({ where: { id: childId } });
        if (!existing) throw new Error('Compra nao encontrada.');
        return await prisma.$transaction(async (tx) => {
          if (existing.boInativo !== nextInativo) {
            const delta = nextInativo ? -existing.qtMovimentada : existing.qtMovimentada;
            await tx.produto.update({
              where: { id: existing.idProduto },
              data: { qtEstoque: { increment: delta } },
            });
          }
          return tx.produtoMovimentacao.update({
            where: { id: childId },
            data: { boInativo: nextInativo },
            include: config.include,
          });
        });
      }
      return await config.delegate(request.tenantDb).update({
        where: { id: childId },
        data: { boInativo: nextInativo },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao alterar status do registro filho.'),
      });
    }
  });
}
