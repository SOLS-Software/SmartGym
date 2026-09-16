import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Rede de protecao do isolamento de tenant (achado M-1, fase 1). O isolamento e
// opt-in: cada handler adiciona `where: { idCliente }` a mao. Nada IMPEDE o
// esquecimento — este teste ao menos o FLAGRA no vetor mais perigoso: uma
// LISTAGEM ou AGREGACAO de um model de tenant sem escopo retorna dados de TODAS
// as academias de uma vez.
//
// Escopo deliberadamente estreito para nao gerar falso positivo (senao o time
// ignora):
//   - So models que TEM coluna idCliente (os 15). Filhos alcancam o tenant pelo
//     pai; sao cobertos pela posse do pai no handler, nao aqui.
//   - So findMany/count/aggregate/groupBy — as operacoes que devolvem linhas ou
//     agregados de MUITOS registros. findFirst/findUnique/update/delete ficam de
//     fora: os lookups de auth por CPF (login/forgot/register) sao findFirst SEM
//     tenant de proposito (ver A-2), e update/delete usam `where` por id unico
//     precedido de validacao de posse. Incluir esses geraria ruido.
//
// Regra: a chamada precisa MENCIONAR `idCliente` no argumento. E uma heuristica
// textual (nao prova o filtro correto), mas pega o esquecimento cru — que e o
// que causa vazamento cross-tenant silencioso. Hoje: 25 chamadas, 25 com
// idCliente, 0 violacoes. Se uma nova listagem nascer sem escopo, este teste
// quebra antes do merge.

const TENANT_MODELS = new Set([
  'aluno',
  'empresa',
  'plano',
  'atividade',
  'treino',
  'promocao',
  'usuario',
  'perfilAcesso',
  'lead',
  'equipamento',
  'fornecedor',
  'contaRecebimento',
  'dominioCorporativo',
  'temaCustomizado',
  'clienteArquivo',
]);

const LIST_METHODS = ['findMany', 'count', 'aggregate', 'groupBy'];

// Excecoes legitimas conhecidas: uma listagem de model de tenant que, por
// desenho, nao e escopada por idCliente. Formato: `arquivo:linha` (a partir de
// apps/api/src). Se um caso legitimo surgir, adicione aqui COM o motivo, para a
// excecao ser uma decisao e nao um descuido. (Refs sao por LINHA — se o arquivo
// citado mudar, o teste volta a flagrar e as linhas devem ser reconferidas.)
const ALLOWLIST = new Set<string>([
  // Expurgo de retencao (LGPD). O MOTIVO MUDOU em 09/2026: o job deixou de ser
  // uma varredura cross-tenant. Com banco por cliente nao existe mais "varrer
  // todos de uma vez", entao ele itera os tenants e consulta o banco de CADA um
  // com `idCliente` no filtro — ou seja, esta escopado.
  //
  // Segue aqui porque a heuristica e TEXTUAL e so olha o argumento da chamada:
  // o filtro vem de uma const `where` montada algumas linhas acima, e
  // `count({ where })` nao tem a palavra idCliente dentro. Excecao de leitura,
  // nao de escopo.
  'scripts/retention.ts:143', // db.aluno.count — where com idCliente na linha 132
  'scripts/retention.ts:144', // db.aluno.findMany — mesmo where
]);

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url)); // apps/api/src
const callRe = new RegExp(
  String.raw`\b(?:prisma|transaction|tx|db)\.([a-zA-Z]+)\.(` + LIST_METHODS.join('|') + String.raw`)\s*\(`,
  'g',
);

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
    else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

// Recorta o argumento da chamada (parenteses balanceados) a partir do '('.
function balancedArg(src: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < src.length; i += 1) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(openParen, i + 1);
    }
  }
  return src.slice(openParen, openParen + 400);
}

function findViolations(): string[] {
  const violations: string[] = [];
  for (const file of collectTsFiles(SRC_ROOT)) {
    const src = readFileSync(file, 'utf8');
    const rel = file.slice(SRC_ROOT.length).replace(/\\/g, '/').replace(/^\//, '');
    let m: RegExpExecArray | null;
    callRe.lastIndex = 0;
    while ((m = callRe.exec(src))) {
      const model = m[1];
      if (!model || !TENANT_MODELS.has(model)) continue;
      const arg = balancedArg(src, m.index + m[0].length - 1);
      if (arg.includes('idCliente')) continue;
      const line = src.slice(0, m.index).split('\n').length;
      const ref = `${rel}:${line}`;
      if (ALLOWLIST.has(ref)) continue;
      violations.push(`${ref}  ${model}.${m[2]}`);
    }
  }
  return violations;
}

describe('isolamento de tenant — listagens escopadas por idCliente (M-1 fase 1)', () => {
  it('encontra as chamadas de listagem em models de tenant (heuristica ativa)', () => {
    // Guarda contra a heuristica silenciosamente parar de casar (ex.: rename de
    // prisma). Se cair para 0, o teste abaixo passaria vazio sem proteger nada.
    let total = 0;
    for (const file of collectTsFiles(SRC_ROOT)) {
      const src = readFileSync(file, 'utf8');
      callRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = callRe.exec(src))) if (m[1] && TENANT_MODELS.has(m[1])) total += 1;
    }
    expect(total).toBeGreaterThan(10);
  });

  it('nenhuma listagem/agregacao de model de tenant sem idCliente', () => {
    const violations = findViolations();
    expect(violations, `Listagens sem escopo de tenant:\n  ${violations.join('\n  ')}`).toEqual([]);
  });
});
