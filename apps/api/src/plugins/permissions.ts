// Catalogo de permissoes e mapa rota -> permissao do papel FUNCIONARIO.
//
// Modulo puro (sem prisma/jwt/fastify) pelo mesmo motivo de studentRbac.ts:
// e a regra que decide quem entra onde, e regra assim precisa de teste
// unitario rodando sem banco. O registro do hook fica em auth.ts.
//
// POR QUE O CATALOGO E CODIGO E NAO TABELA: cada permissao so significa algo
// junto do mapa de rotas abaixo. Se o catalogo morasse no banco e alguem
// inserisse 'financeiro.total', nenhuma rota passaria a exigi-la — viraria uma
// permissao decorativa. O que o cliente configura e QUAIS destas chaves cada
// perfil recebe (tb_PerfilAcessoPermissoes), nao quais chaves existem.
//
// MODELO: deny-by-default. Um funcionario so alcanca uma rota se o perfil dele
// concede a permissao daquela rota. Sem perfil = sem nada (fora do que e
// liberado a qualquer autenticado). Gestor e super admin passam direto.

export type PermissionAction = 'read' | 'write';

// Dominios de permissao. Um dominio agrupa as rotas de uma mesma area de
// trabalho; cada um rende duas chaves (<dominio>.read e <dominio>.write).
// `label`/`description` sao consumidos pela tela de perfis no web — o texto
// mora aqui para a tela nunca listar uma permissao que o servidor nao aplica.
export const PERMISSION_DOMAINS = [
  {
    key: 'students',
    label: 'Alunos e matriculas',
    description: 'Ficha do aluno, arquivos, biometria facial e vinculo de plano.',
  },
  {
    key: 'evaluations',
    label: 'Avaliacao fisica',
    description: 'Medidas, composicao corporal e historico de evolucao do aluno.',
  },
  {
    key: 'checkins',
    label: 'Check-in e acesso',
    description: 'Entrada do aluno na academia e reconhecimento facial.',
  },
  {
    key: 'payments',
    label: 'Financeiro',
    description: 'Pagamentos, baixas e situacao de inadimplencia.',
  },
  {
    key: 'plans',
    label: 'Planos e promocoes',
    description: 'Catalogo de planos, precos e campanhas promocionais.',
  },
  {
    key: 'trainings',
    label: 'Treinos e exercicios',
    description: 'Catalogo de exercicios, montagem e atribuicao de treinos.',
  },
  {
    key: 'activities',
    label: 'Atividades e agendas',
    description: 'Aulas, horarios, inscricao de alunos e chamada de presenca.',
  },
  {
    key: 'products',
    label: 'Produtos e estoque',
    description: 'Produtos, fornecedores, compras e movimentacao de estoque.',
  },
  {
    key: 'equipment',
    label: 'Equipamentos e localidades',
    description: 'Aparelhos, manutencoes e locais da academia.',
  },
  {
    key: 'turnstiles',
    label: 'Catracas',
    description: 'Equipamentos de acesso, eventos e cadastro de biometria na catraca.',
  },
  {
    key: 'points',
    label: 'Pontuacoes',
    description:
      'Regras de pontos, extrato do aluno e lancamento manual de credito ou resgate.',
  },
  {
    key: 'sales',
    label: 'Vendas no balcao',
    description:
      'Venda de produto ao aluno, cobranca da venda e resgate por pontos. Separado do catalogo de produtos: vender e trabalho de balcao, cadastrar preco nao.',
  },
  {
    key: 'employees',
    label: 'Profissionais',
    description: 'Cadastro de funcionarios e documentos de RH.',
  },
  {
    key: 'profiles',
    label: 'Perfis de acesso',
    description:
      'Quem pode fazer o que no sistema. Conceder isto permite ampliar o proprio acesso.',
  },
  {
    key: 'companies',
    label: 'Empresas e clientes',
    description: 'Filiais, dados cadastrais, tema e dominios.',
  },
  {
    key: 'billing',
    label: 'Contas de recebimento',
    description:
      'Onde o dinheiro do aluno cai: chave Pix e credencial de gateway da academia. Separado de "Financeiro" de proposito — quem da baixa numa parcela nao deve poder trocar a conta que recebe.',
  },
  {
    key: 'reports',
    label: 'Relatorios',
    description: 'Indicadores consolidados da operacao.',
  },
  {
    key: 'notifications',
    label: 'Avisos aos alunos',
    description:
      'Disparo dos avisos de cobranca e vencimento por email, e a fila de solicitacoes de cancelamento e renovacao.',
  },
  {
    key: 'domains',
    label: 'Cadastros de dominio',
    description:
      'Tabelas auxiliares (cargos, frequencias, status). A leitura e liberada a todos; so a alteracao depende desta permissao.',
  },
] as const;

export type PermissionDomain = (typeof PERMISSION_DOMAINS)[number]['key'];
export type PermissionKey = `${PermissionDomain}.${PermissionAction}`;

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_DOMAINS.flatMap((domain) => [
  `${domain.key}.read` as PermissionKey,
  `${domain.key}.write` as PermissionKey,
]);

/**
 * O que um acesso de IMPLANTACAO da SOLS alcanca no sistema do cliente.
 *
 * Perante a academia a SOLS e OPERADORA. Este conjunto existe para que entrar
 * no sistema dela nao signifique entrar no dado pessoal dos alunos dela: da
 * para montar a operacao — unidades, equipe, perfis, planos, aulas,
 * equipamento, catraca, conta de recebimento, dominio — e nao da para abrir uma
 * ficha de aluno.
 *
 * FICAM DE FORA, e cada um por um motivo:
 *   students     ficha do aluno: nome, CPF, contato
 *   evaluations  avaliacao fisica — dado de SAUDE, a categoria mais sensivel
 *   trainings    treino prescrito, que e dado de saude por tabela
 *   checkins     quando cada aluno entrou e saiu da academia
 *   payments     o que cada aluno deve e pagou
 *   sales, points  consumo e fidelidade, que perfilam a pessoa
 *   reports      agregam tudo isso, e agregado de dado pessoal continua sendo
 *                dado pessoal quando da para chegar na pessoa
 *   notifications os modelos de aviso carregam nome e contato de aluno
 *
 * E UMA LISTA FIXA NO CODIGO, de proposito. Se viesse de um PerfilAcesso
 * gravado no banco do cliente, qualquer pessoa com acesso aquele banco poderia
 * ampliar silenciosamente o que a SOLS enxerga — inclusive a propria SOLS.
 */
export const PROVIDER_SETUP_PERMISSIONS: PermissionKey[] = [
  'companies.read', 'companies.write',
  'employees.read', 'employees.write',
  'profiles.read', 'profiles.write',
  'plans.read', 'plans.write',
  'activities.read', 'activities.write',
  'products.read', 'products.write',
  'equipment.read', 'equipment.write',
  'turnstiles.read', 'turnstiles.write',
  'billing.read', 'billing.write',
  'domains.read', 'domains.write',
];

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_SET.has(value);
}

// Rotas liberadas a QUALQUER autenticado, independente de perfil: sao a
// propria sessao do usuario. Bloquear /auth/logout por permissao criaria o
// absurdo de um funcionario sem perfil nao conseguir sair do sistema.
const ALWAYS_ALLOWED: RegExp[] = [
  /^\/auth\/verify$/,
  /^\/auth\/logout$/,
  // Dados e senha da PROPRIA conta. Sao da sessao, nao de um modulo de negocio:
  // um funcionario sem nenhuma permissao ainda precisa ver quem ele e e trocar
  // a propria senha.
  /^\/auth\/me$/,
  /^\/auth\/change-password$/,
  // Registro do aparelho para push: identifica o telefone de quem ja esta
  // logado. Negar por permissao deixaria o usuario sem aviso nenhum.
  /^\/auth\/push-token$/,
  // O PROPRIO ponto. Mesmo racional de /auth/me: exigir permissao para o
  // funcionario registrar que chegou criaria o absurdo de alguem recem
  // contratado nao conseguir bater ponto no primeiro dia. Ver /time-clock
  // (sem /me) mais abaixo — o espelho da EQUIPE segue exigindo employees.
  /^\/time-clock\/me$/,
];

// Leituras liberadas a qualquer FUNCIONARIO autenticado, sem permissao
// especifica. Sao as tabelas de dominio: todo formulario do sistema carrega
// pelo menos uma delas (status de pagamento, unidade de medida, tipo de
// arquivo...). Exigir permissao aqui significaria dar 'domains.read' a todo
// perfil — uma permissao que ninguem poderia negar, ou seja, ruido. A
// ALTERACAO dessas tabelas continua exigindo domains.write (e, nas globais, o
// super admin conferido dentro do proprio handler).
const SHARED_LOOKUP_READS: RegExp[] = [
  /^\/roles$/,
  /^\/frequencies$/,
  /^\/levels$/,
  /^\/categories$/,
  /^\/sports$/,
  /^\/file-types$/,
  /^\/payment-statuses$/,
  /^\/payment-methods$/,
  /^\/training-methods$/,
  /^\/time-units$/,
  /^\/check-in-types$/,
  /^\/cancellation-reasons$/,
  /^\/body-areas$/,
  /^\/measurement-units$/,
  /^\/themes$/,
  /^\/student-training-sequences$/,
];

type RouteRule = {
  pattern: RegExp;
  // 'any' = qualquer funcionario autenticado (ver SHARED_LOOKUP_READS).
  domain: PermissionDomain | 'any';
};

// A PRIMEIRA regra que casa vence — as especificas vem antes das genericas.
// Regra pratica ao mexer aqui: se a rota nova cai sob um prefixo que ja existe
// (ex.: /students/...), coloque-a ACIMA da regra do prefixo, senao ela herda a
// permissao do prefixo em silencio.
const ROUTE_RULES: RouteRule[] = [
  // --- sub-recursos do aluno que NAO sao "dados cadastrais do aluno" -------
  { pattern: /^\/students\/\d+\/related\/evolutions(\/|$)/, domain: 'evaluations' },
  { pattern: /^\/students\/\d+\/related\/points(\/|$)/, domain: 'points' },
  { pattern: /^\/students\/\d+\/related\/executions(\/|$)/, domain: 'trainings' },
  { pattern: /^\/students\/\d+\/related\/plan-requests(\/|$)/, domain: 'notifications' },
  { pattern: /^\/students\/\d+\/notifications(\/|$)/, domain: 'notifications' },
  { pattern: /^\/students\/\d+\/related\/payments(\/|$)/, domain: 'payments' },
  { pattern: /^\/students\/\d+\/related\/check-ins(\/|$)/, domain: 'checkins' },
  { pattern: /^\/students\/\d+\/related\/trainings(\/|$)/, domain: 'trainings' },
  { pattern: /^\/students\/\d+\/usuario-catraca$/, domain: 'turnstiles' },
  { pattern: /^\/students\/\d+\/activity-schedules\/enroll$/, domain: 'activities' },
  { pattern: /^\/students\/\d+\/calendar$/, domain: 'activities' },
  // POST /students/:id/related/:resource e PUT/PATCH em /:childId: a rota e
  // generica no Fastify, mas o RBAC enxerga a URL CONCRETA — o nome do recurso
  // esta no caminho e cai nas regras acima. O que sobra aqui e o recurso
  // 'plans' (matricular o aluno num plano), que e trabalho de matricula e
  // segue com o dominio students.
  { pattern: /^\/students(\/|$)/, domain: 'students' },

  // --- financeiro / operacao pela tela de empresa -------------------------
  { pattern: /^\/companies\/\d+\/children\/payments(\/|$)/, domain: 'payments' },
  { pattern: /^\/companies\/\d+\/children\/student-plans(\/|$)/, domain: 'students' },
  { pattern: /^\/companies\/\d+\/children\/student-check-ins(\/|$)/, domain: 'checkins' },
  { pattern: /^\/companies\/\d+\/reception$/, domain: 'checkins' },
  {
    pattern: /^\/companies\/\d+\/children\/(purchases|product-movements)(\/|$)/,
    domain: 'products',
  },
  { pattern: /^\/companies\/\d+\/children\/points(\/|$)/, domain: 'points' },
  { pattern: /^\/companies\/\d+\/children\/sales(\/|$)/, domain: 'sales' },
  {
    pattern: /^\/companies\/\d+\/children\/(promotions|promotion-products|promotion-files)(\/|$)/,
    domain: 'plans',
  },
  { pattern: /^\/companies(\/|$)/, domain: 'companies' },
  { pattern: /^\/clients(\/|$)/, domain: 'companies' },

  // --- acesso fisico -------------------------------------------------------
  { pattern: /^\/access\/facial\/recognize$/, domain: 'checkins' },
  {
    pattern: /^\/controlid\/(catracas|alertas|usuarios-nao-vinculados|events|cadastro-digital|endereco)(\/|$)/,
    domain: 'turnstiles',
  },

  { pattern: /^\/reports(\/|$)/, domain: 'reports' },
  { pattern: /^\/notifications(\/|$)/, domain: 'notifications' },
  { pattern: /^\/plan-requests(\/|$)/, domain: 'notifications' },

  // --- treino --------------------------------------------------------------
  { pattern: /^\/trainings(\/|$)/, domain: 'trainings' },
  { pattern: /^\/exercises(\/|$)/, domain: 'trainings' },

  // --- atividades ----------------------------------------------------------
  { pattern: /^\/activities(\/|$)/, domain: 'activities' },
  { pattern: /^\/agenda-sessions(\/|$)/, domain: 'activities' },

  // --- comercial -----------------------------------------------------------
  { pattern: /^\/plans(\/|$)/, domain: 'plans' },
  { pattern: /^\/promotions(\/|$)/, domain: 'plans' },
  { pattern: /^\/promotion-plans$/, domain: 'plans' },

  // --- estoque -------------------------------------------------------------
  { pattern: /^\/products(\/|$)/, domain: 'products' },
  { pattern: /^\/suppliers(\/|$)/, domain: 'products' },

  // --- estrutura fisica ----------------------------------------------------
  { pattern: /^\/equipments(\/|$)/, domain: 'equipment' },
  // Geocodificacao de endereco: nao le nem grava dado do cliente, e o mesmo
  // componente de endereco e usado no cadastro de localidade E no de empresa.
  // Amarrar a um dominio quebraria um dos dois; fica liberado ao autenticado.
  { pattern: /^\/localities\/geocode$/, domain: 'any' },
  { pattern: /^\/localities(\/|$)/, domain: 'equipment' },

  // --- pessoas -------------------------------------------------------------
  { pattern: /^\/access-profiles(\/|$)/, domain: 'profiles' },
  // Espelho de ponto da equipe e correcao de batida: trabalho de RH, mesmo
  // dominio do cadastro de funcionario. Um dominio proprio so para isto
  // partiria o RH em dois sem que ninguem precisasse conceder um sem o outro.
  { pattern: /^\/time-clock(\/|$)/, domain: 'employees' },
  { pattern: /^\/employees(\/|$)/, domain: 'employees' },

  // --- interessados --------------------------------------------------------
  // Atender quem ainda nao e aluno e trabalho de quem faz matricula: o proximo
  // passo do lead E a matricula. (POST /public/leads nao passa por aqui — e
  // rota aberta, na allowlist do plugin de auth.)
  { pattern: /^\/leads(\/|$)/, domain: 'students' },

  // --- fidelidade ----------------------------------------------------------
  { pattern: /^\/points$/, domain: 'points' },

  // --- contas de recebimento -----------------------------------------------
  // Nao cai em 'payments': dar baixa numa parcela e trabalho de balcao, trocar
  // a conta que recebe o dinheiro dos alunos nao. Mesmo racional que separa
  // 'profiles' de 'employees'.
  { pattern: /^\/payment-accounts(\/|$)/, domain: 'billing' },

  // --- caixa ---------------------------------------------------------------
  // Confirmar recebimento e desfazer baixa. Vem DEPOIS de payment-accounts de
  // proposito: o regex abaixo exige `/` ou fim logo apos "payments", entao ele
  // nao alcanca "/payment-accounts" — mas a ordem deixa a leitura sem duvida.
  { pattern: /^\/payments(\/|$)/, domain: 'payments' },

  // --- tabelas de dominio (leitura cai em SHARED_LOOKUP_READS antes daqui) --
  {
    pattern:
      /^\/(roles|frequencies|levels|categories|sports|file-types|payment-statuses|payment-methods|training-methods|time-units|check-in-types|cancellation-reasons|body-areas|measurement-units)(\/|$)/,
    domain: 'domains',
  },
];

function isReadMethod(method: string) {
  const upper = method.toUpperCase();
  return upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS';
}

export type PermissionRequirement =
  | { kind: 'always' }
  | { kind: 'any' }
  | { kind: 'permission'; permission: PermissionKey }
  // Nenhuma regra casou. E deny na pratica, mas com nome proprio para o teste
  // de cobertura distinguir "negado de proposito" de "rota que ninguem mapeou".
  | { kind: 'unmapped' };

export function requiredPermission(method: string, pathname: string): PermissionRequirement {
  if (ALWAYS_ALLOWED.some((re) => re.test(pathname))) return { kind: 'always' };

  const read = isReadMethod(method);
  if (read && SHARED_LOOKUP_READS.some((re) => re.test(pathname))) return { kind: 'any' };

  const rule = ROUTE_RULES.find((candidate) => candidate.pattern.test(pathname));
  if (!rule) return { kind: 'unmapped' };
  if (rule.domain === 'any') return { kind: 'any' };

  return {
    kind: 'permission',
    permission: `${rule.domain}.${read ? 'read' : 'write'}` as PermissionKey,
  };
}

// Regra final do papel funcionario. `granted` sao as permissoes do perfil.
//
// Nota sobre write x read: quem tem <dominio>.write NAO ganha .read de brinde.
// Um perfil que grava sem enxergar a lista nao e caso de uso real, e a tela de
// perfis marca os dois juntos — mas a regra fica explicita para o servidor nao
// depender de como a tela monta a selecao.
export function isEmployeeAllowed(
  method: string,
  pathname: string,
  granted: ReadonlySet<string>,
): boolean {
  const requirement = requiredPermission(method, pathname);
  if (requirement.kind === 'always' || requirement.kind === 'any') return true;
  if (requirement.kind === 'unmapped') return false;
  return granted.has(requirement.permission);
}
