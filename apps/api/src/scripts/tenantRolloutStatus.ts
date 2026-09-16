// Diagnostico do rollout multi-tenant: onde ainda se le dado de tenant pelo
// client central, agrupado por arquivo. E o mapa de trabalho — a ordem dos
// modulos sai daqui.
//
//   pnpm exec tsx src/scripts/tenantRolloutStatus.ts            # resumo
//   pnpm exec tsx src/scripts/tenantRolloutStatus.ts --detalhe=modules/plans
//
// Nao toca banco nem rede: so le o proprio fonte.
import { ROTEAMENTO_COMPLETO } from '../shared/tenantRollout.js';
import { acessosPendentes } from '../shared/tenantRolloutScan.js';

const detalhe = process.argv.find((a) => a.startsWith('--detalhe='))?.split('=')[1];
const pendentes = acessosPendentes();

function log(msg = '') {
  // eslint-disable-next-line no-console
  console.log(msg);
}

if (detalhe) {
  const alvo = pendentes.filter((a) => a.arquivo.includes(detalhe));
  log(`${alvo.length} acesso(s) em "${detalhe}":\n`);
  for (const a of alvo) log(`  ${a.arquivo}:${a.linha}  prisma.${a.model}.${a.operacao}`);
  process.exit(0);
}

const porArquivo = new Map<string, number>();
for (const a of pendentes) porArquivo.set(a.arquivo, (porArquivo.get(a.arquivo) ?? 0) + 1);

const porModel = new Map<string, number>();
for (const a of pendentes) porModel.set(a.model, (porModel.get(a.model) ?? 0) + 1);

log('========================================================================');
log(`Rollout multi-tenant — ${pendentes.length} acesso(s) a dado de tenant pelo central`);
log(`Roteamento declarado completo: ${ROTEAMENTO_COMPLETO ? 'SIM' : 'NAO'}`);
log('========================================================================');
log(`\nPor arquivo (${porArquivo.size} arquivos):`);
for (const [arquivo, n] of [...porArquivo].sort((a, b) => b[1] - a[1])) {
  log(`  ${String(n).padStart(4)}  ${arquivo}`);
}
log('\nTop 15 models:');
for (const [model, n] of [...porModel].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  log(`  ${String(n).padStart(4)}  ${model}`);
}
log('\nUse --detalhe=<trecho do caminho> para ver as linhas de um modulo.');
