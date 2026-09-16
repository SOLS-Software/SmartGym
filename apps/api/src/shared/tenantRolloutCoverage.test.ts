import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABLE_TIERS } from './tenantTables.js';
import { ROTEAMENTO_COMPLETO } from './tenantRollout.js';

// Medidor do rollout multi-tenant — a resposta para "ja da para siloar um
// cliente?".
//
// POR QUE ISTO EXISTE. O piloto mostrou que um rollout PELA METADE serve a
// mesma ficha de dois bancos: `GET /students/:id` (roteada) devolvia o registro
// do silo enquanto `GET /students/:id/lgpd-export` (nao roteada) devolvia o do
// pool — mesmo aluno, mesmo token, duas verdades. Nao e transitorio: dura o
// tempo inteiro da migracao modulo a modulo. Entao ativar o banco dedicado de
// um cliente so e seguro quando NAO SOBRAR nenhum acesso a tabela de aplicacao
// pelo client central.
//
// O QUE ELE MEDE. Chamadas `prisma.<model>.<op>` em que `<model>` e de nivel
// application/catalog — ou seja, dado que DEVERIA vir de getTenantDb. Enquanto
// o numero for maior que zero, o roteamento esta incompleto.
//
// COMO ELE PROTEGE. Catraca: o numero pode cair, nunca subir. Codigo novo que
// leia dado de tenant pelo central quebra o build, em vez de empurrar o rollout
// para tras em silencio. Quando chegar a zero, atualize ROLLOUT_COMPLETO em
// tenantRollout.ts — e ai sim da para ativar um silo.
//
// Heuristica textual, como o tenantScope.test: nao prova semantica, flagra o
// caso cru. Prefiro contar a mais (um falso positivo aparece na lista e vira
// allowlist com motivo) a contar a menos.

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url)); // apps/api/src

// Nome do model no client Prisma: 'AlunoArquivo' -> 'alunoArquivo'.
const clientProp = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

const MODELS_DE_TENANT = new Set(
  Object.entries(TABLE_TIERS)
    .filter(([, tier]) => tier === 'application' || tier === 'catalog')
    .map(([model]) => clientProp(model)),
);

// So o singleton central. `db.` / `tx.` nao entram: sao o client ja resolvido
// por getTenantDb (ou a transacao dele), que e exatamente o destino.
const chamadaRe = /\bprisma\.([a-zA-Z]+)\.([a-zA-Z]+)\s*\(/g;

// Acessos ao central que NAO fazem parte do rollout. Formato `arquivo:linha`
// a partir de apps/api/src, com o motivo — excecao e decisao, nao descuido.
const ALLOWLIST = new Set<string>([]);

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
    else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

export function acessosCentraisPendentes(): string[] {
  const pendentes: string[] = [];
  for (const file of collectTsFiles(SRC_ROOT)) {
    const src = readFileSync(file, 'utf8');
    const rel = file.slice(SRC_ROOT.length).replace(/\\/g, '/').replace(/^\//, '');
    chamadaRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = chamadaRe.exec(src))) {
      const model = m[1];
      if (!model || !MODELS_DE_TENANT.has(model)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      const ref = `${rel}:${line}`;
      if (ALLOWLIST.has(ref)) continue;
      pendentes.push(`${ref}  prisma.${model}.${m[2]}`);
    }
  }
  return pendentes;
}

// CATRACA: o total medido hoje. Só desce. Ao rotear um módulo, baixe o número
// junto — é o commit que registra o progresso do rollout.
const TETO = 533;

describe('rollout multi-tenant — acessos a dado de tenant pelo client central', () => {
  it('a heuristica continua casando (nao virou um teste vazio)', () => {
    expect(MODELS_DE_TENANT.size).toBeGreaterThan(50);
    let total = 0;
    for (const file of collectTsFiles(SRC_ROOT)) {
      chamadaRe.lastIndex = 0;
      const src = readFileSync(file, 'utf8');
      while (chamadaRe.exec(src)) total += 1;
    }
    expect(total).toBeGreaterThan(100);
  });

  it('ROTEAMENTO_COMPLETO so pode ser true quando nao sobrar acesso central', () => {
    // Esta e a guarda da trava: a constante que o script de provisionamento le
    // nao pode declarar "terminado" enquanto a contagem nao for zero. Sem isto,
    // bastaria trocar um booleano para liberar o silo com o rollout pela metade
    // — exatamente a situacao que o piloto mostrou servindo duas verdades.
    if (ROTEAMENTO_COMPLETO) {
      expect(acessosCentraisPendentes()).toEqual([]);
    }
  });

  it('nao aumenta — codigo novo nao le dado de tenant pelo central', () => {
    const pendentes = acessosCentraisPendentes();
    if (pendentes.length > TETO) {
      const novos = pendentes.slice(TETO);
      throw new Error(
        `O rollout andou para tras: ${pendentes.length} acessos (teto ${TETO}).\n` +
          'Dado de tenant deve vir de getTenantDb(idCliente), nao do prisma central.\n' +
          `Exemplos:\n  ${novos.slice(0, 10).join('\n  ')}`,
      );
    }
    expect(pendentes.length).toBeLessThanOrEqual(TETO);
  });
});
