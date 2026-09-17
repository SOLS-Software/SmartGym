// Classificação das tabelas por NÍVEL de tenancy (multi-tenancy de dados —
// docs/multi-tenancy-dados.md). É a fonte de verdade que o rollout consome:
//   - roteamento: control-plane -> `prisma` central; application/catalog ->
//     getTenantDb(idCliente);
//   - migrations por tenant: o banco de um cliente contém application + catalog
//     (catalog é semeado igual em todos); control-plane migra à parte, central.
//
// Um teste de cobertura (tenantTables.test.ts) afirma que TODO model do schema
// está aqui — se nascer tabela nova sem classificação, o build quebra antes do
// merge (no espírito do routeCoverage do M-2). Chaves = nome do MODEL Prisma.

export type TenantTier = 'control-plane' | 'application' | 'catalog';

// 🔒 PROVEDOR — ficam sempre no banco central. Tenancy/infra, logs e a
// identidade enxuta (login+hash+idCliente+ponteiro do perfil; o perfil rico e o
// RBAC vivem no banco do cliente — ver "Identidade enxuta central" no doc).
const CONTROL_PLANE: readonly string[] = [
  'Cliente',
  'DominioCorporativo',
  'Auditoria',
  'Usuario',
  'Senha',
  'RecuperacaoSenha',
  'UsuarioDispositivo',
  // Identidade de quem administra a PLATAFORMA (painel do provedor, repositorio
  // separado). Control-plane pela definicao do nivel: continua existindo num
  // lugar so depois que os clientes forem siloados — e teria de continuar, ja
  // que nao pertence a academia nenhuma. Esta API nao le esta tabela; ela esta
  // aqui porque o schema e um so e todo model precisa de nivel.
  'OperadorSols',
  // A RELACAO COMERCIAL entre a SOLS e o cliente: o catalogo do que vendemos e
  // o que cada um contratou. Control-plane por dois motivos, e o segundo e o
  // que decide: (a) e dado da SOLS, nao da academia; (b) o SmartGym precisa
  // consultar "este cliente tem direito a X?" ANTES e INDEPENDENTE de abrir o
  // banco de aplicacao dele — se morasse no banco do cliente, um cliente
  // siloado poderia editar os proprios direitos.
  'ProdutoSols',
  'ClienteProduto',
];

// 📚 CATÁLOGO GLOBAL — referência igual para todos; semeado dentro de CADA banco
// de aplicação (as tabelas do negócio têm FK para ele). Não fica no central.
const CATALOG: readonly string[] = [
  'AreaCorporal',
  'Esporte',
  'Exercicio',
  'ExercicioAreaCorporal',
  'ExercicioArquivo',
  'ExercicioEquipamento',
  'FormaPagamento',
  'Localidade',
  'MetodoTreino',
  'Nivel',
  'StatusPagamento',
  'Tema', // tema base global; a customizacao por-tenant e o TemaCustomizado (application)
  'TipoArquivo',
  'UnidadeMedida',
  'UnidadeTempo',
  'Cargo', // decisao do dono: lista padrao (nao config por-tenant)
  'Frequencia', // decisao do dono: lista padrao (nao config por-tenant)
];

// 🏢 APLICAÇÃO — dados do cliente; vão para o banco dele. Inclui o negócio todo e
// as configs por-tenant que estavam modeladas como "catálogo" mas são do cliente
// (TipoCheckIn, Pontuacao, MotivoCancelamento).
const APPLICATION: readonly string[] = [
  'Aluno', 'AlunoArquivo', 'AlunoAtividadeAgenda', 'AlunoBeneficioUso',
  'AlunoBiometriaFacial', 'AlunoCheckIn', 'AlunoEvolucao', 'AlunoIntegracao',
  'AlunoPlano', 'AlunoPlanoTrancamento', 'AlunoPontuacao', 'AlunoTreino',
  'AlunoTreinoSequencia',
  'Atividade', 'AtividadeAgenda',
  'Catraca', 'CatracaEvento',
  'ClienteArquivo', 'Consentimento', 'ContaRecebimento',
  'Empresa', 'EmpresaArquivo',
  'Equipamento', 'EquipamentoArquivo', 'EquipamentoManutencao',
  'Fornecedor',
  'Funcionario', 'FuncionarioArquivo', 'FuncionarioAtividadeAgenda', 'FuncionarioPonto',
  'Lead', 'Notificacao', 'Pagamento',
  'PerfilAcesso', 'PerfilAcessoPermissao',
  'Plano', 'PlanoAtividade', 'PlanoBeneficio', 'PlanoEmpresa', 'PlanoProduto', 'PlanoValor',
  'Produto', 'ProdutoArquivo', 'ProdutoMovimentacao',
  'Promocao', 'PromocaoArquivo', 'PromocaoPlano', 'PromocaoProduto',
  'SolicitacaoPlano', 'TemaCustomizado',
  'Treino', 'TreinoExecucao', 'TreinoExercicio',
  // Config por-tenant (estavam sem idCliente, mas são do cliente):
  'TipoCheckIn', 'Pontuacao', 'MotivoCancelamento',
  // Categoria: tem idEmpresa (escopo por-tenant). WebhookEvento: FK para
  // ContaRecebimento/Pagamento (dados do cliente) — nao pode ficar no central.
  'Categoria', 'WebhookEvento',
];

// Classificações que dependiam de decisão de domínio. RESOLVIDO 2026-09-15:
// WebhookEvento e Categoria -> application (têm vínculo por-tenant); MetodoTreino,
// Nivel, Tema, Cargo, Frequencia -> catalog (listas padrão, decisão do dono).
// Vazio = nenhuma pendência de categorização.
export const TIER_REVIEW: ReadonlySet<string> = new Set<string>([]);

export const TABLE_TIERS: Readonly<Record<string, TenantTier>> = Object.freeze({
  ...Object.fromEntries(CONTROL_PLANE.map((m) => [m, 'control-plane' as const])),
  ...Object.fromEntries(CATALOG.map((m) => [m, 'catalog' as const])),
  ...Object.fromEntries(APPLICATION.map((m) => [m, 'application' as const])),
});

export function tierOf(model: string): TenantTier | undefined {
  return TABLE_TIERS[model];
}

// Tabelas que existem no banco de um cliente (siloado): negócio + catálogo
// semeado. As de control-plane NÃO — ficam só no central.
export function tenantAppModels(): string[] {
  return Object.keys(TABLE_TIERS).filter((m) => TABLE_TIERS[m] !== 'control-plane');
}
