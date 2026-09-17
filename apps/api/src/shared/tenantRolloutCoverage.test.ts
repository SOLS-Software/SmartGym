import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROTEAMENTO_COMPLETO } from './tenantRollout.js';
import {
  CHAMADA_RE,
  MODELS_DE_TENANT,
  acessosCentraisPendentes,
  analisarFonte,
  collectTsFiles,
  tabelasDeTenant,
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
const TETO = 0;

// O detector precisa PROVAR que enxerga. Um medidor que parou de casar marca
// zero exatamente como um rollout terminado — e zero e o que destrava a
// ativacao de banco dedicado. Estes tres trechos sao os tres jeitos ja vistos
// no codigo real de alcancar dado de tenant pelo central.
describe('a varredura enxerga as tres formas', () => {
  const tabelas = tabelasDeTenant();
  const analisar = (src: string) => analisarFonte('fake.ts', src, tabelas);

  it('acesso direto a model de aplicacao', () => {
    const achados = analisar('const x = await prisma.aluno.findMany({ where: { idCliente } });');
    expect(achados).toHaveLength(1);
    expect(achados[0]?.model).toBe('aluno');
  });

  it('filtro por RELACAO a partir de model central', () => {
    // A forma que passou despercebida por todo o rollout: o model e central,
    // mas o filtro atravessa para a tabela de aplicacao.
    const achados = analisar(
      'const u = await prisma.usuario.findMany({ where: { funcionario: { caCPFHash: h } } });',
    );
    expect(achados).toHaveLength(1);
    expect(achados[0]?.model).toBe('funcionario');
    expect(achados[0]?.operacao).toContain('relacao');
  });

  it('SQL cru em tabela de tenant', () => {
    const achados = analisar('await prisma.$queryRaw`SELECT 1 FROM "tb_Alunos" WHERE id = 1`;');
    expect(achados).toHaveLength(1);
    expect(achados[0]?.operacao).toBe('$queryRaw');
  });

  it('NAO acusa o que e control-plane de verdade', () => {
    expect(analisar('await prisma.usuario.count({ where: { idAluno: 1, idCliente: 2 } });')).toEqual([]);
    expect(analisar('await prisma.$queryRaw`SELECT 1 FROM "tb_ClienteConexoes"`;')).toEqual([]);
  });
});

describe('rollout multi-tenant — acessos a dado de tenant pelo client central', () => {
  it('a heuristica continua casando (nao virou um teste vazio)', () => {
    expect(MODELS_DE_TENANT.size).toBeGreaterThan(50);
    let total = 0;
    for (const file of collectTsFiles()) {
      CHAMADA_RE.lastIndex = 0;
      const src = readFileSync(file, 'utf8');
      while (CHAMADA_RE.exec(src)) total += 1;
    }
    // Piso de sanidade: pega a heuristica MORRENDO (um rename de `prisma`
    // faria o regex casar zero e o teto passar vazio, protegendo nada). Nao e
    // meta de volume: conta TODO `prisma.<algo>.<op>`, inclusive control-plane.
    // Comecou em 100 e desceu para 30 quando o rollout esvaziou os modulos —
    // o que sobra e control-plane, que por desenho nunca vai a zero.
    expect(total).toBeGreaterThan(30);
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
