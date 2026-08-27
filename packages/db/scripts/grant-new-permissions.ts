// Concede aos perfis PADRAO as permissoes que passaram a existir depois de eles
// terem sido criados.
//
// Por que um script e nao a semeadura: `ensureDefaultProfiles` so cria perfil
// que ainda nao existe — de proposito, para nunca reescrever o que o gerente
// ajustou a mao. Mas uma chave NOVA e outra historia: ninguem pode ter removido
// ontem uma permissao que so passou a existir hoje. Conceder as novas aos perfis
// padrao restaura a intencao original, nao sobrescreve decisao.
//
// So mexe em perfis com boPadrao = true e so ADICIONA. Perfil criado pelo
// cliente fica intacto — quem o criou decide se quer as caixas novas.
//
// GERENTE e tratado a parte: por definicao ele tem tudo, entao recebe o
// catalogo inteiro em vez de uma lista fixa que envelheceria a cada release.
//
// Idempotente: rodar de novo nao duplica (unique [idPerfilAcesso, cnPermissao]).
//
// Uso (na pasta packages/db):
//   pnpm exec tsx --env-file-if-exists .env --env-file-if-exists ../../.env scripts/grant-new-permissions.ts

import { PrismaClient } from '../src/index.js';
import { ALL_PERMISSIONS } from '../../../apps/api/src/plugins/permissions.js';

const prisma = new PrismaClient();

// Perfil padrao -> permissoes que ele deve ter alem das que ja possui.
// Gerente nao aparece aqui: recebe ALL_PERMISSIONS abaixo.
const GRANTS: Record<string, string[]> = {
  // O balcao e da recepcao: vende, cobra, resgata pontos, responde as
  // solicitacoes de cancelamento e dispara os avisos de cobranca.
  Recepcao: [
    'sales.read',
    'sales.write',
    'points.write',
    'notifications.read',
    'notifications.write',
  ],
  // O financeiro acompanha a receita de balcao junto com as mensalidades, e
  // precisa SABER por qual conta o dinheiro entra para conciliar. Recebe so a
  // LEITURA de contas de recebimento: trocar a conta que recebe e decisao do
  // dono da academia, nao de quem opera a cobranca do dia.
  Financeiro: ['sales.read', 'sales.write', 'billing.read'],
};

async function grant() {
  const perfis = await prisma.perfilAcesso.findMany({
    where: { boPadrao: true },
    include: {
      permissoes: { select: { cnPermissao: true } },
      cliente: { select: { dsCliente: true } },
    },
  });

  console.log(`Perfis padrao encontrados: ${perfis.length}`);
  let concedidas = 0;

  for (const perfil of perfis) {
    const desejadas = perfil.dsPerfil === 'Gerente' ? [...ALL_PERMISSIONS] : GRANTS[perfil.dsPerfil];
    if (!desejadas) continue;

    const atuais = new Set(perfil.permissoes.map((item) => item.cnPermissao));
    const faltando = desejadas.filter((chave) => !atuais.has(chave));
    if (faltando.length === 0) {
      console.log(`  [${perfil.cliente.dsCliente}] ${perfil.dsPerfil}: ja estava completo`);
      continue;
    }

    await prisma.perfilAcessoPermissao.createMany({
      data: faltando.map((cnPermissao) => ({ idPerfilAcesso: perfil.id, cnPermissao })),
      skipDuplicates: true,
    });
    concedidas += faltando.length;
    console.log(`  [${perfil.cliente.dsCliente}] ${perfil.dsPerfil}: +${faltando.join(', +')}`);
  }

  console.log(`\nPermissoes concedidas: ${concedidas}`);
}

grant()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
