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
  'WebhookEvento', // REVISAR: se o webhook for tratado por-cliente, vira application
  'Usuario',
  'Senha',
  'RecuperacaoSenha',
  'UsuarioDispositivo',
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
  'MetodoTreino', // REVISAR
  'Nivel', // REVISAR
  'StatusPagamento',
  'Tema', // REVISAR (tema base global vs TemaCustomizado por-tenant)
  'TipoArquivo',
  'UnidadeMedida',
  'UnidadeTempo',
  'Cargo', // REVISAR (pode ser config por-tenant)
  'Categoria', // REVISAR (pode ser config por-tenant)
  'Frequencia', // REVISAR (pode ser config por-tenant)
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
];

// Classificações que dependem de decisão de domínio ainda a confirmar. Não muda o
// comportamento; sinaliza o que revisar na "passada fina" antes do rollout.
export const TIER_REVIEW: ReadonlySet<string> = new Set([
  'WebhookEvento', 'MetodoTreino', 'Nivel', 'Tema', 'Cargo', 'Categoria', 'Frequencia',
]);

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
