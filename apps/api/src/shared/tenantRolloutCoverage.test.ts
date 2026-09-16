import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROTEAMENTO_COMPLETO } from './tenantRollout.js';
import {
  CHAMADA_RE,
  MODELS_DE_TENANT,
  acessosCentraisPendentes,
  collectTsFiles,
} from './tenantRolloutScan.js';

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
// A varredura vive em tenantRolloutScan.ts (o script de diagnostico usa a
// mesma). Aqui fica so a regra: o numero pode cair, nunca subir.

// CATRACA: o total medido hoje. So desce. Ao rotear um modulo, baixe o numero
// junto — e o commit que registra o progresso do rollout.
//
// A UNICA razao legitima para SUBIR e a varredura ficar mais rigorosa, nunca o
// codigo regredir. Aconteceu uma vez: `prisma.$queryRaw` nao casava com
// `prisma.<model>` e 8 consultas cruas em tabela de tenant passavam batido. Ao
// fechar esse buraco o numero subiu sozinho — medidor furado da falsa
// confianca, que e justamente o defeito que este rollout existe para fechar.
const TETO = 50;

describe('rollout multi-tenant — acessos a dado de tenant pelo client central', () => {
  it('a heuristica continua casando (nao virou um teste vazio)', () => {
    expect(MODELS_DE_TENANT.size).toBeGreaterThan(50);
    let total = 0;
    for (const file of collectTsFiles()) {
      CHAMADA_RE.lastIndex = 0;
      const src = readFileSync(file, 'utf8');
      while (CHAMADA_RE.exec(src)) total += 1;
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
      throw new Error(
        `O rollout andou para tras: ${pendentes.length} acessos (teto ${TETO}).\n` +
          'Dado de tenant deve vir de getTenantDb(idCliente), nao do prisma central.\n' +
          `Exemplos:\n  ${pendentes.slice(TETO, TETO + 10).join('\n  ')}`,
      );
    }
    expect(pendentes.length).toBeLessThanOrEqual(TETO);
  });
});
