// Backfill pos-migration 20260722213000_encrypt_cpf_columns:
// criptografa CPFs (Aluno/Funcionario) e embeddings biometricos existentes.
// Idempotente: registros ja criptografados (prefixo enc:v1:) sao ignorados.
//
// Uso (na pasta packages/db):
//   pnpm exec tsx --env-file-if-exists .env --env-file-if-exists ../../.env scripts/backfill-cpf-encryption.ts

import { PrismaClient } from '../src/index.js';
import {
  encryptCpfFields,
  encryptPii,
  isEncrypted,
} from '../../../apps/api/src/shared/pii.js';

const prisma = new PrismaClient();

async function backfillAlunos() {
  const rows = await prisma.aluno.findMany({
    where: { NOT: { caCPF: { startsWith: 'enc:v1:' } }, caCPF: { not: '' } },
    select: { id: true, caCPF: true },
  });

  for (const row of rows) {
    await prisma.aluno.update({
      where: { id: row.id },
      data: encryptCpfFields(row.caCPF),
    });
  }

  return rows.length;
}

async function backfillFuncionarios() {
  const rows = await prisma.funcionario.findMany({
    where: { NOT: { caCPF: { startsWith: 'enc:v1:' } }, caCPF: { not: '' } },
    select: { id: true, caCPF: true },
  });

  for (const row of rows) {
    await prisma.funcionario.update({
      where: { id: row.id },
      data: encryptCpfFields(row.caCPF),
    });
  }

  return rows.length;
}

async function backfillEmbeddings() {
  // Tabela pequena: filtra em JS (Json null do Prisma tem semantica dupla).
  const rows = await prisma.alunoBiometriaFacial.findMany({
    select: { id: true, anEmbedding: true },
  });

  let updated = 0;
  for (const row of rows) {
    const embedding = row.anEmbedding;
    if (embedding == null) continue;
    // Ja criptografado: objeto { enc: 'enc:v1:...' }.
    if (
      typeof embedding === 'object' &&
      !Array.isArray(embedding) &&
      typeof (embedding as { enc?: unknown }).enc === 'string' &&
      isEncrypted((embedding as { enc: string }).enc)
    ) {
      continue;
    }

    await prisma.alunoBiometriaFacial.update({
      where: { id: row.id },
      data: { anEmbedding: { enc: encryptPii(JSON.stringify(embedding)) } },
    });
    updated += 1;
  }

  return updated;
}

const alunos = await backfillAlunos();
const funcionarios = await backfillFuncionarios();
const embeddings = await backfillEmbeddings();

console.log(`Backfill concluido: ${alunos} alunos, ${funcionarios} funcionarios, ${embeddings} embeddings criptografados.`);

await prisma.$disconnect();
