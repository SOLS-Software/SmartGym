// Status da integracao com as catracas Control iD.
//
// Uso (a partir de packages/db):
//   pnpm exec tsx --env-file=.env scripts/catraca-status.ts
//
// Mostra as catracas cadastradas, quando cada uma falou com a API pela ultima
// vez e os ultimos eventos de acesso recebidos. E a forma mais rapida de
// conferir, durante um teste em campo, se a digital/cartao que acabou de ser
// apresentado na catraca chegou ao banco.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function haQuantoTempo(data: Date | null): string {
  if (!data) return 'nunca';
  const segundos = Math.round((Date.now() - data.getTime()) / 1000);
  if (segundos < 60) return `ha ${segundos}s`;
  if (segundos < 3600) return `ha ${Math.round(segundos / 60)}min`;
  return `ha ${Math.round(segundos / 3600)}h`;
}

async function main() {
  const catracas = await prisma.catraca.findMany({
    orderBy: { id: 'asc' },
    include: { _count: { select: { eventos: true } } },
  });

  console.log('=== CATRACAS ===');
  for (const c of catracas) {
    console.log(
      [
        `#${c.id}`,
        c.dsCatraca || '(sem nome)',
        `serial=${c.caSerial || '-'}`,
        `ip=${c.anIp || '-'}`,
        `empresa=${c.idEmpresa ?? 'NAO VINCULADA'}`,
        c.boInativo ? 'INATIVA' : 'ativa',
        `token=${c.caToken ? 'sim' : 'NAO'}`,
        `ultimoContato=${haQuantoTempo(c.dtUltimoPush)}`,
        `eventos=${c._count.eventos}`,
      ].join(' | '),
    );
  }

  const ultimos = await prisma.catracaEvento.findMany({
    orderBy: { id: 'desc' },
    take: 10,
    select: {
      idCatraca: true,
      idEventoDispositivo: true,
      nrUsuarioCatraca: true,
      nrTipoEvento: true,
      dsTipoEvento: true,
      boAcessoLiberado: true,
      dtEvento: true,
      dtCadastro: true,
    },
  });

  console.log('\n=== ULTIMOS EVENTOS RECEBIDOS ===');
  if (ultimos.length === 0) {
    console.log('(nenhum)');
  }
  for (const e of ultimos) {
    console.log(
      [
        `catraca#${e.idCatraca}`,
        `logId=${e.idEventoDispositivo ?? '-'}`,
        `usuarioNaCatraca=${e.nrUsuarioCatraca ?? '-'}`,
        `evento=${e.nrTipoEvento ?? '-'}(${e.dsTipoEvento || '-'})`,
        e.boAcessoLiberado ? 'LIBERADO' : 'negado',
        `ocorreuEm=${e.dtEvento.toLocaleString('pt-BR')}`,
        `gravadoEm=${haQuantoTempo(e.dtCadastro)}`,
      ].join(' | '),
    );
  }
}

main()
  .catch((e) => {
    console.error('FALHA:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
