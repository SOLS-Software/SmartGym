import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const empresa = await prisma.empresa.upsert({
    where: {
      id: 1,
    },
    update: {
      dsEmpresa: 'Empresa Teste',
      caCNPJ: '11115151',
      cnTemaTP: 1,
    },
    create: {
      id: 1,
      dsEmpresa: 'Empresa Teste',
      caCNPJ: '11115151',
      cnTemaTP: 1,
    },
  });

  const planos = await Promise.all([
    prisma.plano.upsert({
      where: { id: 1 },
      update: { dsPlano: 'Plano Mensal', cnPlanoTP: 1 },
      create: { id: 1, dsPlano: 'Plano Mensal', cnPlanoTP: 1 },
    }),
    prisma.plano.upsert({
      where: { id: 2 },
      update: { dsPlano: 'Plano Trimestral', cnPlanoTP: 2 },
      create: { id: 2, dsPlano: 'Plano Trimestral', cnPlanoTP: 2 },
    }),
    prisma.plano.upsert({
      where: { id: 3 },
      update: { dsPlano: 'Plano Semestral', cnPlanoTP: 3 },
      create: { id: 3, dsPlano: 'Plano Semestral', cnPlanoTP: 3 },
    }),
    prisma.plano.upsert({
      where: { id: 4 },
      update: { dsPlano: 'Plano Anual', cnPlanoTP: 4 },
      create: { id: 4, dsPlano: 'Plano Anual', cnPlanoTP: 4 },
    }),
    prisma.plano.upsert({
      where: { id: 5 },
      update: { dsPlano: 'Plano Mensal Empresa 1', cnPlanoTP: 1 },
      create: { id: 5, dsPlano: 'Plano Mensal Empresa 1', cnPlanoTP: 1 },
    }),
  ]);

  await Promise.all([
    prisma.planoValor.upsert({
      where: { id: 1 },
      update: { idPlano: planos[0].id, vlVenda: '80' },
      create: { id: 1, idPlano: planos[0].id, vlVenda: '80' },
    }),
    prisma.planoValor.upsert({
      where: { id: 2 },
      update: { idPlano: planos[1].id, vlVenda: '230' },
      create: { id: 2, idPlano: planos[1].id, vlVenda: '230' },
    }),
    prisma.planoValor.upsert({
      where: { id: 3 },
      update: { idPlano: planos[2].id, vlVenda: '400' },
      create: { id: 3, idPlano: planos[2].id, vlVenda: '400' },
    }),
    prisma.planoValor.upsert({
      where: { id: 4 },
      update: { idPlano: planos[3].id, vlVenda: '880' },
      create: { id: 4, idPlano: planos[3].id, vlVenda: '880' },
    }),
    prisma.planoValor.upsert({
      where: { id: 5 },
      update: { idEmpresa: empresa.id, idPlano: planos[0].id, vlVenda: '75' },
      create: { id: 5, idEmpresa: empresa.id, idPlano: planos[0].id, vlVenda: '75' },
    }),
    prisma.planoValor.upsert({
      where: { id: 6 },
      update: { idEmpresa: empresa.id, idPlano: planos[4].id, vlVenda: '72' },
      create: { id: 6, idEmpresa: empresa.id, idPlano: planos[4].id, vlVenda: '72' },
    }),
  ]);

  console.log('Seed concluido com empresa, planos e valores de exemplo.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
