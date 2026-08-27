// Perfis de acesso padrao e semeadura por cliente.
//
// Todo cliente nasce com estes quatro perfis. Eles NAO sao especiais para o
// RBAC: sao linhas comuns em tb_PerfisAcesso, com permissoes editaveis pela
// tela de Perfis. A marca boPadrao existe para (a) a semeadura ser idempotente
// e (b) a tela impedir que o cliente fique sem nenhum perfil.
//
// As listas abaixo sao um PONTO DE PARTIDA opinado para academia pequena, nao
// uma regra: a expectativa e que cada cliente ajuste. Onde houve duvida, a
// escolha foi pelo menor acesso — e mais facil o gerente marcar uma caixa do
// que descobrir que a recepcao andava mexendo em preco de plano.
import type { PermissionKey } from '../plugins/permissions.js';
import { ALL_PERMISSIONS } from '../plugins/permissions.js';
import type { PrismaLike } from './payments.js';

export type DefaultProfile = {
  name: string;
  permissions: PermissionKey[];
};

export const DEFAULT_ACCESS_PROFILES: DefaultProfile[] = [
  {
    name: 'Recepcao',
    permissions: [
      // O balcao: matricula, atende e poe o aluno na aula.
      'students.read',
      'students.write',
      'checkins.read',
      'checkins.write',
      'activities.read',
      'activities.write',
      'turnstiles.read',
      // Enxerga o que precisa para orientar o aluno, sem poder alterar:
      // avaliacao e treino sao do professor, preco e do financeiro, e
      // inadimplencia a recepcao so informa ("passa no financeiro").
      'evaluations.read',
      'trainings.read',
      'plans.read',
      'payments.read',
      'companies.read',
      // O balcao e da recepcao: vende produto, cobra e resgata pontos. Mexer no
      // catalogo e no preco continua fora (products.write nao entra aqui).
      'sales.read',
      'sales.write',
      'points.read',
      'points.write',
      // Avisos e a fila de cancelamento/renovacao caem no balcao.
      'notifications.read',
      'notifications.write',
    ],
  },
  {
    name: 'Professor',
    permissions: [
      // O treino e a avaliacao sao dele; o aluno ele le, nao cadastra.
      'students.read',
      'evaluations.read',
      'evaluations.write',
      'trainings.read',
      'trainings.write',
      'activities.read',
      'activities.write',
      'checkins.read',
      'equipment.read',
      'points.read',
    ],
  },
  {
    name: 'Financeiro',
    permissions: [
      // Dinheiro entrando e saindo, e o catalogo que define os valores.
      'payments.read',
      'payments.write',
      'plans.read',
      'plans.write',
      'products.read',
      'products.write',
      'points.read',
      'points.write',
      'sales.read',
      'sales.write',
      'reports.read',
      // Le a ficha para saber de quem e a cobranca; nao edita cadastro.
      'students.read',
      'companies.read',
    ],
  },
  {
    name: 'Gerente',
    // Tudo. E o perfil que os funcionarios existentes receberam na migracao,
    // para o sistema nao trancar ninguem para fora no dia da virada.
    permissions: [...ALL_PERMISSIONS],
  },
];

// Cria os perfis padrao que ainda nao existem para o cliente. Idempotente: e
// chamada na criacao do cliente e tambem pela listagem de perfis, para clientes
// anteriores a esta feature nao ficarem com a tela vazia.
export async function ensureDefaultProfiles(db: PrismaLike, idCliente: number) {
  const existing = await db.perfilAcesso.findMany({
    where: { idCliente },
    select: { id: true, dsPerfil: true },
  });
  const existingNames = new Set(existing.map((profile) => profile.dsPerfil));

  for (const profile of DEFAULT_ACCESS_PROFILES) {
    if (existingNames.has(profile.name)) continue;
    await db.perfilAcesso.create({
      data: {
        idCliente,
        dsPerfil: profile.name,
        boPadrao: true,
        permissoes: {
          create: profile.permissions.map((permission) => ({ cnPermissao: permission })),
        },
      },
    });
  }
}
