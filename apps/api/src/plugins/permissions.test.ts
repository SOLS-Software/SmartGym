// Testes do RBAC de funcionario (lacuna 1 das jornadas).
//
// Alem dos casos de regra, aqui mora o teste de COBERTURA: ele sobe o Fastify,
// varre a tabela de rotas real e exige que toda rota autenticada case com
// alguma regra do mapa. E o que impede o modo de falha silencioso desta
// feature — alguem adiciona /nova-tela, ninguem mapeia, e a rota fica
// inalcancavel para todo funcionario (403) sem nenhum erro de compilacao.
import { describe, expect, it, beforeAll } from 'vitest';
import {
  ALL_PERMISSIONS,
  PERMISSION_DOMAINS,
  isEmployeeAllowed,
  isPermissionKey,
  requiredPermission,
} from './permissions.js';

const gerente = new Set<string>(ALL_PERMISSIONS);
const recepcao = new Set<string>([
  'students.read',
  'students.write',
  'checkins.read',
  'checkins.write',
  'activities.read',
  'activities.write',
  'plans.read',
  'payments.read',
]);
const professor = new Set<string>([
  'students.read',
  'evaluations.read',
  'evaluations.write',
  'trainings.read',
  'trainings.write',
  'activities.read',
  'activities.write',
]);
const semPerfil = new Set<string>();

describe('catalogo de permissoes', () => {
  it('gera duas chaves por dominio', () => {
    expect(ALL_PERMISSIONS).toHaveLength(PERMISSION_DOMAINS.length * 2);
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('reconhece so as chaves do catalogo', () => {
    expect(isPermissionKey('students.read')).toBe(true);
    expect(isPermissionKey('financeiro.total')).toBe(false);
    expect(isPermissionKey('students.delete')).toBe(false);
  });
});

describe('leitura x escrita', () => {
  it('deriva a acao do metodo HTTP', () => {
    expect(requiredPermission('GET', '/students')).toEqual({
      kind: 'permission',
      permission: 'students.read',
    });
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(requiredPermission(method, '/students/7')).toEqual({
        kind: 'permission',
        permission: 'students.write',
      });
    }
  });

  it('nao concede leitura de brinde a quem so tem escrita', () => {
    expect(isEmployeeAllowed('GET', '/students', new Set(['students.write']))).toBe(false);
  });
});

describe('sub-recursos do aluno caem no dominio certo', () => {
  const casos: Array<[string, string]> = [
    ['/students/7/related/evolutions', 'evaluations.read'],
    ['/students/7/related/points', 'points.read'],
    ['/students/7/related/executions', 'trainings.read'],
    ['/students/7/related/payments', 'payments.read'],
    ['/students/7/related/check-ins', 'checkins.read'],
    ['/students/7/related/trainings', 'trainings.read'],
    // Matricular no plano e trabalho de matricula, nao de financeiro.
    ['/students/7/related/plans', 'students.read'],
    ['/students/7/calendar', 'activities.read'],
  ];

  for (const [pathname, esperado] of casos) {
    it(`${pathname} -> ${esperado}`, () => {
      expect(requiredPermission('GET', pathname)).toEqual({
        kind: 'permission',
        permission: esperado,
      });
    });
  }

  it('o professor le a ficha e grava avaliacao, mas nao mexe em pagamento', () => {
    expect(isEmployeeAllowed('GET', '/students/7', professor)).toBe(true);
    expect(isEmployeeAllowed('POST', '/students/7/related/evolutions', professor)).toBe(true);
    expect(isEmployeeAllowed('POST', '/students/7/related/payments', professor)).toBe(false);
    expect(isEmployeeAllowed('PUT', '/students/7', professor)).toBe(false);
  });

  it('vender no balcao e permissao separada de gerir o catalogo de produtos', () => {
    // Quem so cadastra produto nao vende, e quem so vende nao mexe em preco.
    const balcao = new Set(['sales.read', 'sales.write']);
    const catalogo = new Set(['products.read', 'products.write']);

    expect(isEmployeeAllowed('POST', '/companies/1/children/sales', balcao)).toBe(true);
    expect(isEmployeeAllowed('POST', '/companies/1/children/sales', catalogo)).toBe(false);
    expect(isEmployeeAllowed('PUT', '/products/3', balcao)).toBe(false);
    expect(isEmployeeAllowed('PUT', '/products/3', catalogo)).toBe(true);
    // Compra de fornecedor continua sendo estoque, nao balcao.
    expect(isEmployeeAllowed('POST', '/companies/1/children/purchases', balcao)).toBe(false);
    expect(isEmployeeAllowed('POST', '/companies/1/children/purchases', catalogo)).toBe(true);
  });

  it('avisos e solicitacoes de plano tem dominio proprio', () => {
    // Nao caem em students: quem atende o balcao cuida da fila de cancelamento
    // sem precisar de permissao para editar cadastro de aluno.
    expect(requiredPermission('GET', '/students/7/notifications')).toEqual({
      kind: 'permission',
      permission: 'notifications.read',
    });
    expect(requiredPermission('POST', '/plan-requests/3')).toEqual({
      kind: 'permission',
      permission: 'notifications.write',
    });
    expect(requiredPermission('POST', '/notifications/dispatch')).toEqual({
      kind: 'permission',
      permission: 'notifications.write',
    });

    const soCadastro = new Set(['students.read', 'students.write']);
    expect(isEmployeeAllowed('GET', '/plan-requests', soCadastro)).toBe(false);
    expect(isEmployeeAllowed('GET', '/plan-requests', new Set(['notifications.read']))).toBe(true);
  });

  it('relatorios e movimento do dia caem nos dominios certos', () => {
    expect(requiredPermission('GET', '/reports/financial')).toEqual({
      kind: 'permission',
      permission: 'reports.read',
    });
    expect(requiredPermission('GET', '/companies/1/reception')).toEqual({
      kind: 'permission',
      permission: 'checkins.read',
    });
    // Recepcao ve o movimento do dia; quem so tem relatorio, nao.
    expect(isEmployeeAllowed('GET', '/companies/1/reception', recepcao)).toBe(true);
    expect(isEmployeeAllowed('GET', '/reports/financial', recepcao)).toBe(false);
  });

  it('a propria conta e alcancavel por qualquer autenticado', () => {
    // Um funcionario sem nenhuma permissao ainda precisa ver quem ele e e
    // trocar a propria senha — senao o RBAC o tranca fora da propria conta.
    expect(isEmployeeAllowed('GET', '/auth/me', semPerfil)).toBe(true);
    expect(isEmployeeAllowed('POST', '/auth/change-password', semPerfil)).toBe(true);
  });

  it('motivo de cancelamento: leitura livre, alteracao so com domains.write', () => {
    // O formulario de cancelamento precisa da lista para qualquer perfil que
    // cancele matricula; mexer na taxonomia e outra coisa.
    expect(isEmployeeAllowed('GET', '/cancellation-reasons', semPerfil)).toBe(true);
    expect(isEmployeeAllowed('POST', '/cancellation-reasons', semPerfil)).toBe(false);
    expect(isEmployeeAllowed('POST', '/cancellation-reasons', new Set(['domains.write']))).toBe(true);
  });

  it('extrato de pontos do aluno cai em points, nao em students', () => {
    const semPontos = new Set(['students.read', 'students.write']);
    expect(isEmployeeAllowed('GET', '/students/7/related/points', semPontos)).toBe(false);
    expect(isEmployeeAllowed('GET', '/students/7/related/points', new Set(['points.read']))).toBe(true);
    expect(isEmployeeAllowed('POST', '/students/7/related/points', new Set(['points.read']))).toBe(false);
    expect(isEmployeeAllowed('POST', '/students/7/related/points', new Set(['points.write']))).toBe(true);
  });

  it('a recepcao matricula e faz check-in, mas nao monta treino nem mexe em preco', () => {
    expect(isEmployeeAllowed('POST', '/students', recepcao)).toBe(true);
    expect(isEmployeeAllowed('POST', '/students/7/related/check-ins', recepcao)).toBe(true);
    expect(isEmployeeAllowed('POST', '/trainings', recepcao)).toBe(false);
    expect(isEmployeeAllowed('PUT', '/plans/3', recepcao)).toBe(false);
    expect(isEmployeeAllowed('GET', '/plans', recepcao)).toBe(true);
  });
});

describe('deny-by-default', () => {
  it('funcionario sem perfil nao alcanca nada de negocio', () => {
    const rotas = ['/students', '/plans', '/employees', '/companies', '/trainings', '/points'];
    for (const rota of rotas) {
      expect(isEmployeeAllowed('GET', rota, semPerfil)).toBe(false);
    }
  });

  it('mas continua conseguindo verificar e encerrar a propria sessao', () => {
    expect(isEmployeeAllowed('GET', '/auth/verify', semPerfil)).toBe(true);
    expect(isEmployeeAllowed('POST', '/auth/logout', semPerfil)).toBe(true);
  });

  it('le tabelas de dominio (todo formulario precisa) mas nao as altera', () => {
    expect(isEmployeeAllowed('GET', '/payment-statuses', semPerfil)).toBe(true);
    expect(isEmployeeAllowed('GET', '/measurement-units', semPerfil)).toBe(true);
    expect(isEmployeeAllowed('PUT', '/payment-statuses/1', semPerfil)).toBe(false);
    expect(isEmployeeAllowed('PUT', '/payment-statuses/1', new Set(['domains.write']))).toBe(true);
  });

  it('rota desconhecida e negada, nao liberada', () => {
    expect(requiredPermission('GET', '/rota-que-nao-existe')).toEqual({ kind: 'unmapped' });
    expect(isEmployeeAllowed('GET', '/rota-que-nao-existe', gerente)).toBe(false);
  });
});

describe('ponto, interessados e push', () => {
  it('o proprio ponto nao depende de perfil, o da equipe sim', () => {
    // Um funcionario recem contratado ainda nao tem perfil nenhum e precisa
    // bater ponto no primeiro dia.
    expect(requiredPermission('POST', '/time-clock/me')).toEqual({ kind: 'always' });
    expect(requiredPermission('GET', '/time-clock/me')).toEqual({ kind: 'always' });
    expect(isEmployeeAllowed('POST', '/time-clock/me', semPerfil)).toBe(true);

    // O espelho de TODO MUNDO e a correcao de batida sao trabalho de RH.
    expect(requiredPermission('GET', '/time-clock')).toEqual({
      kind: 'permission',
      permission: 'employees.read',
    });
    expect(requiredPermission('POST', '/time-clock')).toEqual({
      kind: 'permission',
      permission: 'employees.write',
    });
    expect(isEmployeeAllowed('GET', '/time-clock', semPerfil)).toBe(false);
    expect(isEmployeeAllowed('GET', '/time-clock', recepcao)).toBe(false);
    expect(isEmployeeAllowed('POST', '/time-clock', new Set(['employees.write']))).toBe(true);
    // Anular batida alheia e escrita, nao leitura.
    expect(isEmployeeAllowed('DELETE', '/time-clock/9', new Set(['employees.read']))).toBe(false);
  });

  it('registrar o aparelho de push e da sessao, nao de um modulo', () => {
    expect(requiredPermission('POST', '/auth/push-token')).toEqual({ kind: 'always' });
    expect(requiredPermission('DELETE', '/auth/push-token')).toEqual({ kind: 'always' });
    expect(isEmployeeAllowed('POST', '/auth/push-token', semPerfil)).toBe(true);
  });

  it('interessado e trabalho de quem faz matricula', () => {
    expect(requiredPermission('GET', '/leads')).toEqual({
      kind: 'permission',
      permission: 'students.read',
    });
    expect(requiredPermission('PATCH', '/leads/3')).toEqual({
      kind: 'permission',
      permission: 'students.write',
    });
    expect(isEmployeeAllowed('GET', '/leads', recepcao)).toBe(true);
    expect(isEmployeeAllowed('GET', '/leads', professor)).toBe(true);
    expect(isEmployeeAllowed('PATCH', '/leads/3', professor)).toBe(false);
  });

  it('trancar matricula e trabalho de matricula, nao de financeiro', () => {
    // As rotas de trancamento caem no prefixo /students, que e o dominio
    // `students`. O teste trava isso: suspender cobranca e efeito COLATERAL do
    // trancamento, e nao motivo para exigir permissao de financeiro de quem so
    // faz matricula — nem para deixar o financeiro trancar plano.
    for (const rota of [
      '/students/7/related/plans/3/lock',
      '/students/7/related/plans/3/unlock',
    ]) {
      expect(requiredPermission('POST', rota)).toEqual({
        kind: 'permission',
        permission: 'students.write',
      });
      expect(isEmployeeAllowed('POST', rota, new Set(['students.read']))).toBe(false);
      expect(isEmployeeAllowed('POST', rota, new Set(['payments.write']))).toBe(false);
      expect(isEmployeeAllowed('POST', rota, new Set(['students.write']))).toBe(true);
    }
    // O historico e leitura de matricula.
    expect(requiredPermission('GET', '/students/7/related/plans/3/locks')).toEqual({
      kind: 'permission',
      permission: 'students.read',
    });
  });

  it('a lista de evasao e relatorio', () => {
    expect(requiredPermission('GET', '/reports/inactive-students')).toEqual({
      kind: 'permission',
      permission: 'reports.read',
    });
  });

  it('o panorama agregado e relatorio, nao cadastro de aluno', () => {
    // /reports/overview devolve base, retencao e serie de check-in de uma vez.
    // Como e a mesma informacao que a tela de Relatorios exibia montando no
    // browser, ele cai no dominio de relatorio — quem nao via os graficos antes
    // nao passa a ver por causa da rota nova.
    expect(requiredPermission('GET', '/reports/overview')).toEqual({
      kind: 'permission',
      permission: 'reports.read',
    });
    expect(isEmployeeAllowed('GET', '/reports/overview', recepcao)).toBe(false);
    expect(isEmployeeAllowed('GET', '/reports/overview', new Set(['reports.read']))).toBe(true);
  });

  it('os paineis analiticos entram pelo mesmo padrao, sem cadastro novo', () => {
    // O padrao /reports(/|$) cobre a aba Dashboards inteira. O teste existe
    // para travar isso: uma rota de relatorio criada fora de /reports cairia no
    // deny-by-default e ninguem descobriria ate um gerente reclamar de 403.
    for (const rota of [
      '/reports/retention',
      '/reports/receivables',
      '/reports/funnel',
      '/reports/occupancy',
    ]) {
      expect(requiredPermission('GET', rota)).toEqual({
        kind: 'permission',
        permission: 'reports.read',
      });
      expect(isEmployeeAllowed('GET', rota, recepcao)).toBe(false);
      expect(isEmployeeAllowed('GET', rota, new Set(['reports.read']))).toBe(true);
    }
  });
});

describe('cobranca da parcela', () => {
  it('emitir cobranca e ESCRITA de financeiro', () => {
    // POST porque cria cobranca no provedor. `payments.read` nao basta.
    expect(requiredPermission('POST', '/students/7/related/payments/5/charge')).toEqual({
      kind: 'permission',
      permission: 'payments.write',
    });
  });

  it('quem so ve o cadastro do aluno nao emite cobranca', () => {
    // A cobranca carrega a chave da academia e o valor devido, e no gateway
    // cria registro no provedor. Nao e dado de ficha.
    const soCadastro = new Set(['students.read', 'students.write']);
    expect(
      isEmployeeAllowed('POST', '/students/7/related/payments/5/charge', soCadastro),
    ).toBe(false);
    expect(
      isEmployeeAllowed(
        'POST',
        '/students/7/related/payments/5/charge',
        new Set(['payments.write']),
      ),
    ).toBe(true);
  });
});

describe('webhook de pagamento', () => {
  it('a listagem de eventos segue a permissao das contas', () => {
    // Os eventos contam por onde o dinheiro entrou e de quem. Ficam com
    // billing, junto da conta que os recebeu.
    expect(requiredPermission('GET', '/payment-accounts/events')).toEqual({
      kind: 'permission',
      permission: 'billing.read',
    });
    expect(isEmployeeAllowed('GET', '/payment-accounts/events', new Set(['payments.read']))).toBe(
      false,
    );
  });

  it('a rota do webhook NAO e alcancavel por permissao nenhuma', () => {
    // Ela e publica pelo padrao de PUBLIC_ROUTE_PATTERNS (auth.ts), nao pelo
    // mapa de permissoes. Se um dia alguem a mapear aqui por engano, o token da
    // URL deixaria de ser a unica porta e este teste avisa.
    expect(requiredPermission('POST', '/webhooks/payments/abc123')).toEqual({ kind: 'unmapped' });
    expect(isEmployeeAllowed('POST', '/webhooks/payments/abc123', gerente)).toBe(false);
  });
});

describe('caixa', () => {
  it('dar baixa e trabalho de financeiro', () => {
    expect(requiredPermission('GET', '/payments/open')).toEqual({
      kind: 'permission',
      permission: 'payments.read',
    });
    expect(requiredPermission('POST', '/payments/9/settle')).toEqual({
      kind: 'permission',
      permission: 'payments.write',
    });
    expect(requiredPermission('POST', '/payments/9/unsettle')).toEqual({
      kind: 'permission',
      permission: 'payments.write',
    });
  });

  it('quem so LE o financeiro nao confirma recebimento', () => {
    const leitura = new Set(['payments.read']);
    expect(isEmployeeAllowed('GET', '/payments/open', leitura)).toBe(true);
    expect(isEmployeeAllowed('POST', '/payments/9/settle', leitura)).toBe(false);
  });

  it('a regra de /payments NAO alcanca /payment-accounts', () => {
    // As duas rotas comecam com "payment". Se o regex do caixa vazasse para as
    // contas de recebimento, quem da baixa numa parcela passaria a poder trocar
    // a conta que recebe — exatamente a separacao que billing existe para
    // manter. O sufixo "-accounts" nao casa porque a regra exige "/" ou fim.
    expect(requiredPermission('GET', '/payment-accounts')).toEqual({
      kind: 'permission',
      permission: 'billing.read',
    });
    expect(
      isEmployeeAllowed('PUT', '/payment-accounts/1', new Set(['payments.read', 'payments.write'])),
    ).toBe(false);
  });
});

describe('contas de recebimento', () => {
  it('trocar a conta que recebe nao vem junto com dar baixa em parcela', () => {
    // Quem tem payments.write da baixa numa mensalidade. Se isso tambem
    // permitisse editar a conta de recebimento, essa pessoa poderia apontar a
    // chave Pix para si e desviar o pagamento dos alunos. Mesmo racional que
    // separa 'profiles' de 'employees'.
    const financeiroOperacional = new Set(['payments.read', 'payments.write']);
    expect(isEmployeeAllowed('GET', '/payment-accounts', financeiroOperacional)).toBe(false);
    expect(isEmployeeAllowed('PUT', '/payment-accounts/1', financeiroOperacional)).toBe(false);

    expect(requiredPermission('GET', '/payment-accounts')).toEqual({
      kind: 'permission',
      permission: 'billing.read',
    });
    expect(requiredPermission('POST', '/payment-accounts')).toEqual({
      kind: 'permission',
      permission: 'billing.write',
    });
  });

  it('ler a conta nao permite trocar a conta', () => {
    const soLeitura = new Set(['billing.read']);
    expect(isEmployeeAllowed('GET', '/payment-accounts', soLeitura)).toBe(true);
    expect(isEmployeeAllowed('PUT', '/payment-accounts/1', soLeitura)).toBe(false);
    expect(isEmployeeAllowed('PATCH', '/payment-accounts/1/status', soLeitura)).toBe(false);
  });

  it('o aluno nao alcanca a rota de forma alguma', () => {
    // Reforco do outro lado: o RBAC do aluno e allowlist, entao /payment-accounts
    // nao esta la — mas vale travar, porque e a rota que guarda credencial.
    expect(isEmployeeAllowed('GET', '/payment-accounts', semPerfil)).toBe(false);
  });
});

describe('escalada de privilegio', () => {
  it('mexer em perfil de acesso exige a permissao propria, nao a de RH', () => {
    const rh = new Set(['employees.read', 'employees.write']);
    expect(isEmployeeAllowed('GET', '/employees', rh)).toBe(true);
    expect(isEmployeeAllowed('PUT', '/access-profiles/2', rh)).toBe(false);
    expect(isEmployeeAllowed('PUT', '/access-profiles/2', new Set(['profiles.write']))).toBe(true);
  });

  it('o perfil Gerente alcanca tudo que o mapa protege', () => {
    const amostra = [
      ['GET', '/students'],
      ['POST', '/access-profiles'],
      ['PUT', '/companies/1'],
      ['DELETE', '/exercises/1/areas/2'],
      ['PATCH', '/controlid/catracas/1/status'],
    ] as const;
    for (const [method, pathname] of amostra) {
      expect(isEmployeeAllowed(method, pathname, gerente)).toBe(true);
    }
  });
});

// --- cobertura contra a tabela de rotas real -------------------------------

// Rotas publicas (allowlist do plugin de auth): nao passam pelo RBAC.
const PUBLIC_ROUTES = new Set([
  '/health',
  '/auth/login',
  '/auth/gestor-login',
  '/auth/register',
  '/auth/register-lookup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/theme',
  '/public/leads',
  // Token na URL; a defesa esta no modulo (ver plugins/auth.ts).
  '/webhooks/payments/:token',
  '/controlid',
  '/controlid/push',
  '/controlid/push/push',
  '/controlid/result',
  '/controlid/push/result',
  '/controlid/new_user_identified.fcgi',
  '/controlid/new_card.fcgi',
  '/controlid/new_rex_log.fcgi',
  '/new_user_identified.fcgi',
  '/controlid/health',
]);

// Valores concretos para os parametros de rota. `:resource` e `:childId` viram
// cada recurso realmente aceito, porque o dominio da permissao depende DELE.
const STUDENT_RESOURCES = [
  'plans',
  'payments',
  'check-ins',
  'trainings',
  'evolutions',
  'points',
  'executions',
  'plan-requests',
];
const COMPANY_CHILDREN = [
  'promotions',
  'promotion-products',
  'promotion-files',
  'student-plans',
  'payments',
  'product-movements',
  'purchases',
  'company-files',
  'student-check-ins',
  'sales',
  'points',
  'themes',
];
const PLAN_RESOURCES = ['values', 'products', 'companies', 'activities'];
const PROMOTION_RESOURCES = ['promotion-plans', 'promotion-products', 'promotion-files'];

function expandRoute(template: string): string[] {
  // Fastify imprime alternativas como /:id|:companyId — a primeira basta.
  const normalized = template.replace(/:(\w+)\|:(\w+)/g, ':$1');

  let variants = [normalized];
  if (normalized.includes('/students/:id/related/:resource')) {
    variants = STUDENT_RESOURCES.map((resource) => normalized.replace(':resource', resource));
  } else if (normalized.includes('/companies/:companyId/children/:resource')) {
    variants = COMPANY_CHILDREN.map((resource) => normalized.replace(':resource', resource));
  } else if (normalized.includes('/plans/:id/related/:resource')) {
    variants = PLAN_RESOURCES.map((resource) => normalized.replace(':resource', resource));
  } else if (normalized.includes('/promotions/:id/related/:resource')) {
    variants = PROMOTION_RESOURCES.map((resource) => normalized.replace(':resource', resource));
  }

  return variants.map((variant) => variant.replace(/:[A-Za-z0-9_]+/g, '1'));
}

// Reconstroi os caminhos a partir da arvore impressa pelo Fastify. O
// printRoutes concatena segmentos por nivel (/auth/register + -lookup), entao a
// remontagem acompanha a indentacao.
function parseRouteTree(tree: string): Array<{ path: string; methods: string[] }> {
  const routes: Array<{ path: string; methods: string[] }> = [];
  const prefixByDepth: string[] = [];

  for (const rawLine of tree.split('\n')) {
    if (!rawLine.trim()) continue;
    const marker = rawLine.search(/[├└]/);
    if (marker < 0) continue;

    const depth = Math.floor(marker / 4);
    const content = rawLine.slice(marker + 4);
    const match = content.match(/^(.*?)(?:\s+\(([^)]*)\))?\s*$/);
    if (!match) continue;

    const segment = match[1] ?? '';
    const methods = match[2]?.split(',').map((method) => method.trim()) ?? [];
    const prefix = depth === 0 ? '' : (prefixByDepth[depth - 1] ?? '');
    const full = prefix + segment;
    prefixByDepth[depth] = full;

    if (methods.length > 0) routes.push({ path: full, methods });
  }

  return routes;
}

describe('cobertura do mapa de rotas', () => {
  let routes: Array<{ path: string; methods: string[] }> = [];

  beforeAll(async () => {
    // Valores de fachada: subir o Fastify so monta a tabela de rotas — nada
    // aqui conecta em banco, Supabase ou SMTP.
    process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/db';
    process.env.API_PORT ??= '3333';
    process.env.SUPABASE_URL ??= 'http://localhost';
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';
    process.env.JWT_SECRET ??= 'x'.repeat(48);
    process.env.PII_ENCRYPTION_KEY ??= 'y'.repeat(48);

    const { app } = await import('../app.js');
    await app.ready();
    routes = parseRouteTree(app.printRoutes({ commonPrefix: false }));
    // Timeout generoso de proposito: este hook importa a API INTEIRA (todos os
    // modulos, Prisma, nodemailer, Supabase) so para montar a tabela de rotas.
    // Com os 10s padrao do vitest ele falhava de forma intermitente em maquina
    // ocupada — e um teste que falha as vezes vira teste que todo mundo ignora,
    // justamente o que guarda contra rota inalcancavel. O custo real do hook e
    // de segundos; o teto alto so evita o falso negativo.
  }, 60_000);

  it('leu a tabela de rotas de verdade', () => {
    // Trava de sanidade: se o formato do printRoutes mudar, o teste de
    // cobertura passaria vazio e nao protegeria nada.
    const paths = routes.map((route) => route.path);
    expect(paths).toContain('/students');
    expect(paths).toContain('/auth/login');
    expect(paths).toContain('/access-profiles');
    expect(paths.length).toBeGreaterThan(80);
  });

  it('toda rota autenticada tem permissao mapeada', () => {
    const semMapa: string[] = [];

    for (const route of routes) {
      if (PUBLIC_ROUTES.has(route.path)) continue;
      // O curinga de OPTIONS do CORS nao e rota de negocio.
      if (route.path === '*') continue;

      for (const method of route.methods) {
        if (method === 'HEAD' || method === 'OPTIONS') continue;
        for (const pathname of expandRoute(route.path)) {
          if (requiredPermission(method, pathname).kind === 'unmapped') {
            semMapa.push(`${method} ${pathname}`);
          }
        }
      }
    }

    expect(semMapa).toEqual([]);
  });
});
