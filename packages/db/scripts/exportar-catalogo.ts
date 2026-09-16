// Exporta o CATÁLOGO GLOBAL de um banco para JSON versionado no repositório.
//
//   cd packages/db
//   DATABASE_URL="<banco de origem>" pnpm exec tsx scripts/exportar-catalogo.ts
//
// Rode isto sempre que o catálogo mudar (exercício novo, ilustração nova). O
// resultado vai para prisma/catalogo/*.json e DEVE ser commitado — é o que
// transforma o catálogo, que hoje só existe dentro de um banco na nuvem, em um
// ativo que sobrevive a perder aquele banco.
//
// O par deste script é o seed-catalogo.ts, que carrega os JSON num banco vazio.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../src/index.js';
import { CAMPOS_AUDITORIA, CATALOGO, DIR_CATALOGO, EXERCICIO_GLOBAL } from './catalogo.js';

const prisma = new PrismaClient();

/** Remove as colunas de auditoria; ver a nota em catalogo.ts. */
function limpar(registro: Record<string, unknown>) {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(registro)) {
    if ((CAMPOS_AUDITORIA as readonly string[]).includes(chave)) continue;
    saida[chave] = valor;
  }
  return saida;
}

async function main() {
  const destino = join(process.cwd(), DIR_CATALOGO);
  mkdirSync(destino, { recursive: true });

  let total = 0;

  for (const modelo of CATALOGO) {
    // `where` só existe para exercicio e para o que depende dele: o catálogo
    // global é o que NÃO pertence a nenhuma empresa.
    const where =
      modelo === 'exercicio'
        ? EXERCICIO_GLOBAL
        : modelo === 'exercicioAreaCorporal' || modelo === 'exercicioArquivo'
          ? { exercicio: EXERCICIO_GLOBAL }
          : undefined;

    const delegate = prisma[modelo] as unknown as {
      findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
    };

    // Ordem por id deixa o JSON estável entre exportações — sem isso, cada
    // execução geraria um diff gigante no git sem nada ter mudado.
    const registros = await delegate.findMany({ where, orderBy: { id: 'asc' } });
    const limpos = registros.map(limpar);

    writeFileSync(
      join(destino, `${modelo}.json`),
      `${JSON.stringify(limpos, null, 2)}\n`,
      'utf8',
    );

    total += limpos.length;
    console.log(`${String(limpos.length).padStart(6)}  ${modelo}`);
  }

  console.log(`\n${total} registros em ${DIR_CATALOGO}/. Commite o resultado.`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
