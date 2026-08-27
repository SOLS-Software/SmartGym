// Testes da fidelidade (lacuna 5 das jornadas).
//
// Sem banco: um duble em memoria implementa as tres operacoes do Prisma que o
// modulo usa. O que esta sob teste e a ARITMETICA do extrato — saldo, recusa de
// resgate maior que o saldo, e o credito automatico nao contar duas vezes.
// Essas sao as regras que, se quebrarem, quebram calado: o aluno ve um numero
// errado e ninguem descobre ate ele reclamar.
import { describe, expect, it } from 'vitest';
import { creditCheckInPoints, getPointsBalance, registerPointsEntry } from './loyalty.js';
import type { PrismaLike } from './payments.js';

type Row = {
  id: number;
  idAluno: number;
  idEmpresa: number;
  idPontuacao: number | null;
  idAlunoCheckIn: number | null;
  idProdutoMovimentacao: number | null;
  dsHistorico: string | null;
  qtPontos: number;
  qtDisponivel: number;
  boInativo: boolean;
  dtCadastro: Date;
};

type Rule = { id: number; idEmpresa: number; qtPontos: number; boPadrao: boolean; boInativo: boolean };

function fakeDb(rules: Rule[] = []) {
  const rows: Row[] = [];
  let nextId = 1;

  const db = {
    alunoPontuacao: {
      async findFirst({ where, orderBy }: any) {
        const found = rows.filter((row) => {
          if (where.idAlunoCheckIn !== undefined && row.idAlunoCheckIn !== where.idAlunoCheckIn) return false;
          if (where.idAluno !== undefined && row.idAluno !== where.idAluno) return false;
          if (where.idEmpresa !== undefined && row.idEmpresa !== where.idEmpresa) return false;
          if (where.boInativo !== undefined && row.boInativo !== where.boInativo) return false;
          return true;
        });
        // O modulo pede sempre o mais recente primeiro.
        if (orderBy) found.sort((a, b) => b.id - a.id);
        return found[0] ?? null;
      },
      async create({ data }: any) {
        const row: Row = { id: nextId++, dtCadastro: new Date(), ...data };
        rows.push(row);
        return row;
      },
    },
    pontuacao: {
      async findFirst({ where }: any) {
        return (
          rules.find((rule) => {
            if (where.id !== undefined && rule.id !== where.id) return false;
            if (where.idEmpresa !== undefined && rule.idEmpresa !== where.idEmpresa) return false;
            if (where.boPadrao !== undefined && rule.boPadrao !== where.boPadrao) return false;
            if (where.boInativo !== undefined && rule.boInativo !== where.boInativo) return false;
            return true;
          }) ?? null
        );
      },
    },
  };

  return { db: db as unknown as PrismaLike, rows };
}

const ALUNO = 10;
const EMPRESA = 1;

describe('saldo', () => {
  it('comeca em zero e acompanha os lancamentos', async () => {
    const { db } = fakeDb();
    expect(await getPointsBalance(db, ALUNO, EMPRESA)).toBe(0);

    await registerPointsEntry(db, { idAluno: ALUNO, idEmpresa: EMPRESA, qtPontos: 10 });
    await registerPointsEntry(db, { idAluno: ALUNO, idEmpresa: EMPRESA, qtPontos: 15 });
    expect(await getPointsBalance(db, ALUNO, EMPRESA)).toBe(25);

    await registerPointsEntry(db, { idAluno: ALUNO, idEmpresa: EMPRESA, qtPontos: -20 });
    expect(await getPointsBalance(db, ALUNO, EMPRESA)).toBe(5);
  });

  it('cada linha guarda o saldo depois dela', async () => {
    const { db, rows } = fakeDb();
    await registerPointsEntry(db, { idAluno: ALUNO, idEmpresa: EMPRESA, qtPontos: 10 });
    await registerPointsEntry(db, { idAluno: ALUNO, idEmpresa: EMPRESA, qtPontos: 7 });
    await registerPointsEntry(db, { idAluno: ALUNO, idEmpresa: EMPRESA, qtPontos: -3 });

    expect(rows.map((row) => [row.qtPontos, row.qtDisponivel])).toEqual([
      [10, 10],
      [7, 17],
      [-3, 14],
    ]);
  });

  it('e por empresa: ponto ganho numa filial nao aparece na outra', async () => {
    const { db } = fakeDb();
    await registerPointsEntry(db, { idAluno: ALUNO, idEmpresa: 1, qtPontos: 30 });
    expect(await getPointsBalance(db, ALUNO, 1)).toBe(30);
    expect(await getPointsBalance(db, ALUNO, 2)).toBe(0);
  });

  it('nao mistura o saldo de alunos diferentes', async () => {
    const { db } = fakeDb();
    await registerPointsEntry(db, { idAluno: 10, idEmpresa: EMPRESA, qtPontos: 30 });
    await registerPointsEntry(db, { idAluno: 11, idEmpresa: EMPRESA, qtPontos: 5 });
    expect(await getPointsBalance(db, 10, EMPRESA)).toBe(30);
    expect(await getPointsBalance(db, 11, EMPRESA)).toBe(5);
  });
});

describe('resgate', () => {
  it('recusa gastar mais do que o aluno tem', async () => {
    const { db, rows } = fakeDb();
    await registerPointsEntry(db, { idAluno: ALUNO, idEmpresa: EMPRESA, qtPontos: 20 });

    await expect(
      registerPointsEntry(db, { idAluno: ALUNO, idEmpresa: EMPRESA, qtPontos: -21 }),
    ).rejects.toThrow(/Saldo insuficiente/);

    // E nao grava nada: saldo negativo nao chega a existir.
    expect(rows).toHaveLength(1);
    expect(await getPointsBalance(db, ALUNO, EMPRESA)).toBe(20);
  });

  it('permite zerar o saldo exatamente', async () => {
    const { db } = fakeDb();
    await registerPointsEntry(db, { idAluno: ALUNO, idEmpresa: EMPRESA, qtPontos: 20 });
    await registerPointsEntry(db, { idAluno: ALUNO, idEmpresa: EMPRESA, qtPontos: -20 });
    expect(await getPointsBalance(db, ALUNO, EMPRESA)).toBe(0);
  });

  it('recusa lancamento de zero pontos', async () => {
    const { db } = fakeDb();
    await expect(
      registerPointsEntry(db, { idAluno: ALUNO, idEmpresa: EMPRESA, qtPontos: 0 }),
    ).rejects.toThrow(/quantidade de pontos/);
  });
});

describe('credito automatico no check-in', () => {
  const padrao: Rule = { id: 1, idEmpresa: EMPRESA, qtPontos: 5, boPadrao: true, boInativo: false };
  const aula: Rule = { id: 2, idEmpresa: EMPRESA, qtPontos: 12, boPadrao: false, boInativo: false };

  it('credita a regra padrao da empresa', async () => {
    const { db } = fakeDb([padrao, aula]);
    await creditCheckInPoints(db, { idAluno: ALUNO, idEmpresa: EMPRESA, idAlunoCheckIn: 100 });
    expect(await getPointsBalance(db, ALUNO, EMPRESA)).toBe(5);
  });

  it('a regra escolhida na tela vence a padrao', async () => {
    const { db } = fakeDb([padrao, aula]);
    await creditCheckInPoints(db, {
      idAluno: ALUNO,
      idEmpresa: EMPRESA,
      idAlunoCheckIn: 100,
      idPontuacaoEscolhida: aula.id,
    });
    expect(await getPointsBalance(db, ALUNO, EMPRESA)).toBe(12);
  });

  it('o mesmo check-in nunca credita duas vezes', async () => {
    const { db, rows } = fakeDb([padrao]);
    await creditCheckInPoints(db, { idAluno: ALUNO, idEmpresa: EMPRESA, idAlunoCheckIn: 100 });
    await creditCheckInPoints(db, { idAluno: ALUNO, idEmpresa: EMPRESA, idAlunoCheckIn: 100 });
    expect(rows).toHaveLength(1);
    expect(await getPointsBalance(db, ALUNO, EMPRESA)).toBe(5);
  });

  it('check-ins diferentes creditam cada um', async () => {
    const { db } = fakeDb([padrao]);
    await creditCheckInPoints(db, { idAluno: ALUNO, idEmpresa: EMPRESA, idAlunoCheckIn: 100 });
    await creditCheckInPoints(db, { idAluno: ALUNO, idEmpresa: EMPRESA, idAlunoCheckIn: 101 });
    expect(await getPointsBalance(db, ALUNO, EMPRESA)).toBe(10);
  });

  it('empresa sem regra padrao nao credita e nao quebra o check-in', async () => {
    const { db, rows } = fakeDb([aula]);
    await expect(
      creditCheckInPoints(db, { idAluno: ALUNO, idEmpresa: EMPRESA, idAlunoCheckIn: 100 }),
    ).resolves.toBeNull();
    expect(rows).toHaveLength(0);
  });

  it('regra inativa ou zerada nao credita', async () => {
    const inativa = fakeDb([{ ...padrao, boInativo: true }]);
    await expect(
      creditCheckInPoints(inativa.db, { idAluno: ALUNO, idEmpresa: EMPRESA, idAlunoCheckIn: 1 }),
    ).resolves.toBeNull();

    const zerada = fakeDb([{ ...padrao, qtPontos: 0 }]);
    await expect(
      creditCheckInPoints(zerada.db, { idAluno: ALUNO, idEmpresa: EMPRESA, idAlunoCheckIn: 1 }),
    ).resolves.toBeNull();
  });

  it('a regra padrao de uma filial nao credita em outra', async () => {
    const { db, rows } = fakeDb([padrao]);
    await creditCheckInPoints(db, { idAluno: ALUNO, idEmpresa: 2, idAlunoCheckIn: 100 });
    expect(rows).toHaveLength(0);
  });
});
