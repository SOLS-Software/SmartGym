// Backfill dos perfis de acesso (lacuna 1 das jornadas).
//
// Antes desta feature o sistema so conhecia "funcionario": todo mundo alcancava
// tudo. Com o RBAC ligado, funcionario sem perfil nao alcanca NADA — entao a
// virada precisa colocar quem ja existia em algum perfil, ou a academia abre na
// segunda-feira sem sistema.
//
// O que faz:
//   1. Semeia os 4 perfis padrao (Recepcao, Professor, Financeiro, Gerente) em
//      todo cliente que ainda nao os tem.
//   2. Poe todo funcionario SEM perfil no perfil Gerente do proprio cliente.
//
// Por que Gerente e nao um perfil menor: o acesso que essas pessoas tinham
// ontem era total. Reduzir em massa, sem saber quem faz o que em cada
// academia, trancaria gente para fora do proprio trabalho no dia da virada. O
// gerente ajusta cada um depois pela tela de Perfis — que e exatamente a
// decisao que o sistema nao permitia tomar antes.
//
// Idempotente: rodar de novo nao cria perfil repetido nem mexe em quem ja tem
// perfil.
//
// Uso (na pasta packages/db):
//   pnpm exec tsx --env-file-if-exists .env --env-file-if-exists ../../.env scripts/backfill-access-profiles.ts

import { PrismaClient } from '../src/index.js';
import { ensureDefaultProfiles } from '../../../apps/api/src/shared/accessProfiles.js';

const prisma = new PrismaClient();

const DEFAULT_PROFILE_FOR_EXISTING = 'Gerente';

async function backfill() {
  const clientes = await prisma.cliente.findMany({ select: { id: true, dsCliente: true } });
  console.log(`Clientes encontrados: ${clientes.length}`);

  let perfisCriados = 0;
  let funcionariosVinculados = 0;

  for (const cliente of clientes) {
    const antes = await prisma.perfilAcesso.count({ where: { idCliente: cliente.id } });
    await ensureDefaultProfiles(prisma, cliente.id);
    const depois = await prisma.perfilAcesso.count({ where: { idCliente: cliente.id } });
    perfisCriados += depois - antes;

    const gerente = await prisma.perfilAcesso.findFirst({
      where: { idCliente: cliente.id, dsPerfil: DEFAULT_PROFILE_FOR_EXISTING },
      select: { id: true },
    });
    if (!gerente) {
      console.warn(`  [${cliente.dsCliente}] perfil ${DEFAULT_PROFILE_FOR_EXISTING} nao encontrado; pulando.`);
      continue;
    }

    // Funcionario e do cliente via Empresa.idCliente; os sem empresa ficam de
    // fora de proposito (sao orfaos de tenant e nem logam — o idCliente do
    // token deriva da empresa).
    const { count } = await prisma.funcionario.updateMany({
      where: { idPerfilAcesso: null, empresa: { idCliente: cliente.id } },
      data: { idPerfilAcesso: gerente.id },
    });
    funcionariosVinculados += count;
    console.log(
      `  [${cliente.dsCliente}] perfis novos: ${depois - antes}; funcionarios movidos para ${DEFAULT_PROFILE_FOR_EXISTING}: ${count}`,
    );
  }

  const orfaos = await prisma.funcionario.count({ where: { idPerfilAcesso: null } });
  console.log(`\nPerfis criados: ${perfisCriados}`);
  console.log(`Funcionarios vinculados: ${funcionariosVinculados}`);
  console.log(`Funcionarios ainda sem perfil: ${orfaos} (sem empresa vinculada, ou seja, sem tenant)`);
}

backfill()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
