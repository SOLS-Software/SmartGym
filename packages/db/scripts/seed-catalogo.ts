// Carrega o CATÁLOGO GLOBAL (prisma/catalogo/*.json) num banco.
//
//   cd packages/db
//   DATABASE_URL="<banco de destino>" pnpm exec tsx scripts/seed-catalogo.ts
//   DATABASE_URL="<banco de destino>" pnpm exec tsx scripts/seed-catalogo.ts --apply
//
// Dry-run por padrão, como o retention.ts: sem `--apply` ele só conta o que
// faria. Seguro de repetir — usa upsert por id, então rodar duas vezes não
// duplica nada.
//
// É este script, e não o `db:seed` (que cria Empresa e Planos de DEMONSTRAÇÃO),
// que roda num banco de produção novo.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '../src/index.js';
import { CATALOGO, DIR_CATALOGO } from './catalogo.js';

const prisma = new PrismaClient();
const APLICAR = process.argv.includes('--apply');

/** 'areaCorporal' -> 'AreaCorporal' (nome do model no DMMF). */
const nomeModel = (delegate: string) => delegate[0].toUpperCase() + delegate.slice(1);

/** Nome físico da tabela e se ela tem `id` autoincremento, direto do schema. */
function metadados(delegate: string) {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === nomeModel(delegate));
  if (!model) throw new Error(`Model ${nomeModel(delegate)} não existe no schema.`);
  const id = model.fields.find((f) => f.name === 'id' && f.isId);
  return { tabela: model.dbName ?? model.name, temId: Boolean(id) };
}

async function main() {
  console.log(APLICAR ? '>> APLICANDO\n' : '>> DRY-RUN (use --apply para gravar)\n');

  let total = 0;

  for (const modelo of CATALOGO) {
    const { tabela, temId } = metadados(modelo);
    const caminho = join(process.cwd(), DIR_CATALOGO, `${modelo}.json`);

    let registros: Record<string, unknown>[];
    try {
      registros = JSON.parse(readFileSync(caminho, 'utf8'));
    } catch {
      console.log(`${'--'.padStart(6)}  ${modelo} (sem arquivo; pulando)`);
      continue;
    }

    if (!APLICAR) {
      console.log(`${String(registros.length).padStart(6)}  ${modelo}`);
      total += registros.length;
      continue;
    }

    const delegate = prisma[modelo] as unknown as {
      upsert: (args: unknown) => Promise<unknown>;
      createMany: (args: unknown) => Promise<{ count: number }>;
    };

    if (temId) {
      // Upsert por id preserva as chaves — as tabelas seguintes têm FK para
      // elas, então renumerar quebraria o vínculo.
      for (const registro of registros) {
        await delegate.upsert({
          where: { id: registro.id },
          update: registro,
          create: registro,
        });
      }

      // Inserir id explícito NÃO avança a sequence do Postgres. Sem este
      // acerto, o primeiro registro criado pela aplicação tenta o id 1 e falha
      // com violação de chave primária — semanas depois, sem relação aparente
      // com a carga.
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${tabela}"', 'id'),
           COALESCE((SELECT MAX(id) FROM "${tabela}"), 0) + 1, false)`,
      );
    } else {
      // Tabela de junção sem id próprio: recriar é idempotente o bastante.
      await delegate.createMany({ data: registros, skipDuplicates: true });
    }

    console.log(`${String(registros.length).padStart(6)}  ${modelo}`);
    total += registros.length;
  }

  console.log(
    APLICAR
      ? `\n${total} registros carregados.`
      : `\n${total} registros seriam carregados. Repita com --apply.`,
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
