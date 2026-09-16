import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@smartgym/db';
import {
  CENTRAL_OWNER,
  currentTxOwner,
  guardTransactions,
  outsideTransaction,
  runAsTxOwner,
  tenantOwner,
} from './tenantTx.js';

// Guarda de transacao entre clients. O comportamento que estes testes fixam foi
// descoberto no piloto do rollout: uma escrita feita pelo client do tenant
// dentro de um `prisma.$transaction` central SOBREVIVIA ao rollback, sem erro.
// Corrupcao silenciosa e o pior desfecho possivel; aqui exigimos o barulho.

// Client falso com a superficie que a guarda usa: `$extends` (devolve a si
// mesmo guardando o hook) e `$transaction` (executa o callback). `operacao`
// simula uma chamada de model passando pelo hook de query.
function fakeClient() {
  let hook: ((ctx: { model?: string; operation: string; args: unknown; query: (a: unknown) => unknown }) => unknown) | null =
    null;
  const client = {
    $extends({ query }: { query: { $allOperations: NonNullable<typeof hook> } }) {
      hook = query.$allOperations;
      return client;
    },
    $transaction(fn: (tx: unknown) => unknown) {
      return fn(client);
    },
    operacao(model = 'Aluno', operation = 'update') {
      if (!hook) throw new Error('hook nao instalado');
      return hook({ model, operation, args: {}, query: () => 'ok' });
    },
  };
  return client as unknown as PrismaClient & { operacao: (m?: string, o?: string) => unknown };
}

describe('contexto de transacao', () => {
  it('fora de transacao nao tem dono', () => {
    expect(currentTxOwner()).toBeNull();
  });

  it('runAsTxOwner marca o dono so dentro do escopo', () => {
    runAsTxOwner('central', () => {
      expect(currentTxOwner()).toBe('central');
    });
    expect(currentTxOwner()).toBeNull();
  });

  it('outsideTransaction limpa o dono e sobrevive ao await', async () => {
    await runAsTxOwner('central', async () => {
      expect(currentTxOwner()).toBe('central');
      // O `await` interno e o ponto: uma operacao do Prisma so despacha quando
      // aguardada, entao o contexto precisa valer ALEM da chamada.
      await outsideTransaction(async () => {
        await Promise.resolve();
        expect(currentTxOwner()).toBeNull();
      });
      expect(currentTxOwner()).toBe('central');
    });
  });

  it('tenantOwner distingue tenants', () => {
    expect(tenantOwner(3)).not.toBe(tenantOwner(1));
    expect(tenantOwner(3)).not.toBe(CENTRAL_OWNER);
  });
});

describe('guardTransactions', () => {
  it('deixa passar operacao fora de qualquer transacao', () => {
    const c = fakeClient();
    guardTransactions(c, CENTRAL_OWNER);
    expect(() => c.operacao()).not.toThrow();
  });

  it('deixa passar operacao na transacao do PROPRIO client', () => {
    const c = fakeClient();
    guardTransactions(c, CENTRAL_OWNER);
    runAsTxOwner(CENTRAL_OWNER, () => {
      expect(() => c.operacao()).not.toThrow();
    });
  });

  it('BARRA operacao do tenant dentro de transacao do central', () => {
    const silo = fakeClient();
    guardTransactions(silo, tenantOwner(3));
    runAsTxOwner(CENTRAL_OWNER, () => {
      expect(() => silo.operacao('Aluno', 'update')).toThrow(/nao cruza dois bancos/);
    });
  });

  it('BARRA nos dois sentidos: central dentro de transacao do tenant', () => {
    const central = fakeClient();
    guardTransactions(central, CENTRAL_OWNER);
    runAsTxOwner(tenantOwner(3), () => {
      expect(() => central.operacao('Auditoria', 'create')).toThrow(/nao cruza dois bancos/);
    });
  });

  it('a mensagem nomeia os dois clients e a operacao', () => {
    const silo = fakeClient();
    guardTransactions(silo, tenantOwner(7));
    runAsTxOwner(CENTRAL_OWNER, () => {
      try {
        silo.operacao('Pagamento', 'create');
        throw new Error('deveria ter lancado');
      } catch (e) {
        const msg = (e as Error).message;
        expect(msg).toContain('central');
        expect(msg).toContain('tenant:7');
        expect(msg).toContain('Pagamento.create');
      }
    });
  });

  it('$transaction do client guardado declara o proprio dono', () => {
    const silo = fakeClient();
    const guardado = guardTransactions(silo, tenantOwner(3));
    let visto: string | null = null;
    guardado.$transaction(() => {
      visto = currentTxOwner();
      return Promise.resolve();
    });
    expect(visto).toBe(tenantOwner(3));
  });

  it('BARRA tambem dentro do $transaction real do outro client', () => {
    const central = fakeClient();
    const silo = fakeClient();
    const centralGuardado = guardTransactions(central, CENTRAL_OWNER);
    guardTransactions(silo, tenantOwner(3));
    expect(() =>
      centralGuardado.$transaction(() => {
        silo.operacao();
        return Promise.resolve();
      }),
    ).toThrow(/nao cruza dois bancos/);
  });
});
