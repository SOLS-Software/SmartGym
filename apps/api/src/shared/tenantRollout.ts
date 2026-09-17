// Estado do rollout multi-tenant — a trava que impede siloar um cliente cedo
// demais.
//
// O PILOTO PROVOU o modo de falha: enquanto o roteamento esta pela metade, um
// tenant com banco dedicado tem DUAS VERDADES ao mesmo tempo. A rota migrada le
// do silo, a nao migrada le do pool, e a mesma ficha volta diferente conforme o
// endpoint. Nao ha aviso, nao ha erro — so dado divergente.
//
// Enquanto esta constante for `false`, provisionar banco dedicado para um
// cliente e um erro operacional, e o script de provisionamento recusa.
//
// VIROU `true` em 2026-09-17: as tres portas publicas ganharam ancora no
// control-plane (catraca e webhook pela chave no caminho, login pela chave na
// identidade central) e a varredura chegou a zero.
//
// O teste guarda esta constante: declarar conclusao com acesso sobrando quebra
// o build. E a varredura, por sua vez, tem teste proprio — ela ja nasceu cega
// uma vez, marcando zero por nao enxergar filtro por relacao, e zero de
// medidor morto e indistinguivel de zero de trabalho terminado.
export const ROTEAMENTO_COMPLETO = true;

/** Mensagem unica, para o script e o runbook contarem a mesma historia. */
export const MOTIVO_ROLLOUT_INCOMPLETO =
  'O roteamento por tenant ainda esta incompleto: ha rotas lendo dado de aplicacao pelo client ' +
  'central. Ativar um banco dedicado agora faria a mesma ficha voltar diferente conforme a rota ' +
  '(o silo numa, o pool na outra). Termine o rollout — veja tenantRolloutCoverage.test.ts para o ' +
  'que falta — ou use --force-rollout-incompleto se souber exatamente por que esta contornando.';
