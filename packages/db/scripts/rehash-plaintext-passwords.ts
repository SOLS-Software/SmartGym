// B3: aposenta senhas em TEXTO PURO (tb_Senhas.cnTipoHash IS NULL) sem esperar
// o proximo login. Como o texto puro esta na coluna, da para gerar o bcrypt
// direto — sem conhecer nada alem do que ja esta no banco. Registros SHA-256
// (cnTipoHash = 1) NAO sao tocados: sem a senha original nao ha como reverter;
// esses migram no login ou caem no prazo LEGACY_PASSWORD_DEADLINE.
//
// Idempotente: apos rodar, nao ha mais linhas com cnTipoHash nulo, entao rodar
// de novo processa zero.
//
// Uso (na pasta packages/db):
//   pnpm exec tsx --env-file-if-exists .env --env-file-if-exists ../../.env scripts/rehash-plaintext-passwords.ts

import { PrismaClient } from '../src/index.js';
import { HASH_TYPE_BCRYPT, hashPassword } from '../../../apps/api/src/shared/passwords.js';

const prisma = new PrismaClient();

async function rehashPlaintext() {
  // Somente texto puro ativo com valor: cnTipoHash nulo. SHA-256 (=1) e bcrypt
  // (=2) ficam de fora.
  const rows = await prisma.senha.findMany({
    where: { cnTipoHash: null, boInativo: false, NOT: { dsSenha: null } },
    select: { id: true, dsSenha: true },
  });

  let updated = 0;
  for (const row of rows) {
    if (!row.dsSenha) continue;
    await prisma.senha.update({
      where: { id: row.id },
      data: { dsSenha: await hashPassword(row.dsSenha), cnTipoHash: HASH_TYPE_BCRYPT },
    });
    updated += 1;
  }

  return updated;
}

const updated = await rehashPlaintext();
console.log(`Backfill concluido: ${updated} senha(s) em texto puro migrada(s) para bcrypt.`);

await prisma.$disconnect();
