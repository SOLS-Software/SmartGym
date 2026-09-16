// Provisiona/atualiza o registro de conexao de um cliente (control plane do
// multi-tenancy de dados — modelo hibrido/registro). Cifra as credenciais
// (secrets.ts) e faz upsert em tb_ClienteConexoes; buckets ficam em claro.
//
// Pre-requisito: a tabela precisa existir — rode antes
//   packages/db/scripts/cliente-conexoes.sql
// no banco control-plane (o DATABASE_URL padrao). Ver docs/multi-tenancy-dados.md.
//
// Semantica: le a linha atual (se houver), MESCLA os campos passados por flag e
// grava o estado completo. Campos nao passados sao preservados. Para voltar um
// cliente ao padrao sem apagar o registro, use --disable (boAtivo=false).
//
// DRY-RUN por padrao (so mostra o que faria, com as credenciais MASCARADAS);
// --apply escreve. Nunca imprime segredo em claro.
//
// Uso (na pasta apps/api), ex.: dar banco e storage proprios ao cliente 7:
//   pnpm exec tsx --env-file-if-exists ../../.env --env-file-if-exists ../../packages/db/.env \
//     src/scripts/setTenantDataSource.ts --cliente=7 \
//     --db-url='postgresql://...' --storage-url='https://x.supabase.co' \
//     --storage-key='...' --bucket='arquivos-cliente7'          # dry-run
//   ...adicione --apply para gravar. Flags extras: --bucket-clientes,
//   --disable (volta o cliente ao padrao) e --enable (religa o override).

import { prisma } from '../shared/prisma.js';
import { encryptSecret, maskSecret } from '../shared/secrets.js';
import { MOTIVO_ROLLOUT_INCOMPLETO, ROTEAMENTO_COMPLETO } from '../shared/tenantRollout.js';

type Row = {
  idCliente: number;
  dsDatabaseUrlEnc: string | null;
  dsStorageUrlEnc: string | null;
  dsStorageKeyEnc: string | null;
  dsStorageBucket: string | null;
  dsStorageBucketClientes: string | null;
  boAtivo: boolean;
};

function opt(argv: string[], name: string): string | undefined {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function log(msg = '') {
  // eslint-disable-next-line no-console
  console.log(msg);
}

async function readExisting(idCliente: number): Promise<Row | null> {
  try {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT "idCliente", "dsDatabaseUrlEnc", "dsStorageUrlEnc", "dsStorageKeyEnc",
             "dsStorageBucket", "dsStorageBucketClientes", "boAtivo"
      FROM "tb_ClienteConexoes" WHERE "idCliente" = ${idCliente} LIMIT 1`;
    return rows[0] ?? null;
  } catch (err) {
    // Tabela ausente: em dry-run trata como novo; em --apply o upsert vai falhar
    // com uma mensagem clara pedindo para rodar o .sql antes.
    if (process.argv.includes('--apply')) {
      throw new Error(
        'tb_ClienteConexoes nao existe. Rode packages/db/scripts/cliente-conexoes.sql no banco control-plane antes de --apply. ' +
          `(detalhe: ${(err as Error).message})`,
      );
    }
    return null;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const disable = argv.includes('--disable');
  // Sem isto o registro era uma porta de mao unica: --disable gravava false e
  // nada jamais voltava para true, entao desfazer um rollback exigia SQL na mao.
  const enable = argv.includes('--enable');
  if (disable && enable) {
    throw new Error('Use --disable ou --enable, nao os dois.');
  }

  const idCliente = Number(opt(argv, 'cliente'));
  if (!Number.isInteger(idCliente) || idCliente <= 0) {
    throw new Error('Informe --cliente=<id> (inteiro > 0).');
  }

  const dbUrl = opt(argv, 'db-url');
  const storageUrl = opt(argv, 'storage-url');
  const storageKey = opt(argv, 'storage-key');
  const bucket = opt(argv, 'bucket');
  const bucketClientes = opt(argv, 'bucket-clientes');

  const existing = await readExisting(idCliente);

  // Merge: flag passada sobrescreve; ausente preserva o que ja havia.
  const merged: Row = {
    idCliente,
    dsDatabaseUrlEnc: dbUrl !== undefined ? encryptSecret(dbUrl) : (existing?.dsDatabaseUrlEnc ?? null),
    dsStorageUrlEnc: storageUrl !== undefined ? encryptSecret(storageUrl) : (existing?.dsStorageUrlEnc ?? null),
    dsStorageKeyEnc: storageKey !== undefined ? encryptSecret(storageKey) : (existing?.dsStorageKeyEnc ?? null),
    dsStorageBucket: bucket !== undefined ? bucket : (existing?.dsStorageBucket ?? null),
    dsStorageBucketClientes:
      bucketClientes !== undefined ? bucketClientes : (existing?.dsStorageBucketClientes ?? null),
    boAtivo: disable ? false : enable ? true : (existing?.boAtivo ?? true),
  };

  // TRAVA DO ROLLOUT INCOMPLETO. Desativar (--disable) e sempre permitido — e a
  // saida de emergencia. O que se barra e o contrario: LIGAR um banco dedicado
  // enquanto ha rota lendo dado de aplicacao pelo client central, porque ai o
  // tenant passa a ter duas verdades (silo numa rota, pool na outra) sem que
  // nada acuse. Ver shared/tenantRollout.ts.
  const vaiLigarBancoDedicado = !disable && merged.boAtivo && merged.dsDatabaseUrlEnc !== null;
  if (vaiLigarBancoDedicado && !ROTEAMENTO_COMPLETO) {
    if (!argv.includes('--force-rollout-incompleto')) {
      throw new Error(MOTIVO_ROLLOUT_INCOMPLETO);
    }
    log('!! AVISO: banco dedicado ligado com o rollout INCOMPLETO (--force-rollout-incompleto).');
    log('!! Rotas nao migradas continuarao lendo este tenant do pool compartilhado.');
  }

  log('========================================================================');
  log(`Registro de conexao — cliente ${idCliente} — modo: ${apply ? 'APPLY (ESCREVE)' : 'DRY-RUN'}`);
  log(existing ? '(atualizando registro existente)' : '(registro novo)');
  log('------------------------------------------------------------------------');
  log(`  banco dedicado:      ${merged.dsDatabaseUrlEnc ? maskSecret(merged.dsDatabaseUrlEnc) : '(padrao / .env)'}`);
  log(`  storage url:         ${merged.dsStorageUrlEnc ? maskSecret(merged.dsStorageUrlEnc) : '(padrao / .env)'}`);
  log(`  storage key:         ${merged.dsStorageKeyEnc ? maskSecret(merged.dsStorageKeyEnc) : '(padrao / .env)'}`);
  log(`  bucket:              ${merged.dsStorageBucket ?? '(padrao / .env)'}`);
  log(`  bucket clientes:     ${merged.dsStorageBucketClientes ?? '(herda bucket)'}`);
  log(`  ativo:               ${merged.boAtivo}`);
  log('========================================================================');

  if (!apply) {
    log('DRY-RUN — nada foi escrito. Adicione --apply para gravar.');
    return;
  }

  await prisma.$executeRaw`
    INSERT INTO "tb_ClienteConexoes"
      ("idCliente","dsDatabaseUrlEnc","dsStorageUrlEnc","dsStorageKeyEnc",
       "dsStorageBucket","dsStorageBucketClientes","boAtivo","dtAlteracao")
    VALUES (${merged.idCliente}, ${merged.dsDatabaseUrlEnc}, ${merged.dsStorageUrlEnc},
            ${merged.dsStorageKeyEnc}, ${merged.dsStorageBucket}, ${merged.dsStorageBucketClientes},
            ${merged.boAtivo}, now())
    ON CONFLICT ("idCliente") DO UPDATE SET
      "dsDatabaseUrlEnc" = EXCLUDED."dsDatabaseUrlEnc",
      "dsStorageUrlEnc" = EXCLUDED."dsStorageUrlEnc",
      "dsStorageKeyEnc" = EXCLUDED."dsStorageKeyEnc",
      "dsStorageBucket" = EXCLUDED."dsStorageBucket",
      "dsStorageBucketClientes" = EXCLUDED."dsStorageBucketClientes",
      "boAtivo" = EXCLUDED."boAtivo",
      "dtAlteracao" = now()`;

  log('Gravado. Lembre: o resolver so passa a usar por-tenant nos call sites migrados (rollout).');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
