import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from '@smartgym/db';

// Guarda de transacao entre clients (multi-tenancy de dados).
//
// O PROBLEMA QUE ISTO RESOLVE. Com banco por tenant existem DOIS PrismaClient
// vivos no mesmo processo: o central (control plane) e o do tenant. Um
// `$transaction` pertence a UMA conexao — operacoes feitas pelo outro client
// simplesmente nao entram nela. O perigoso e COMO isso falhava: sem erro. O
// piloto provou que uma escrita no client do tenant, feita dentro de um
// `prisma.$transaction` central que depois sofre rollback, SOBREVIVE ao
// rollback. A transacao "deu certo", o dado ficou meio gravado e ninguem soube.
//
// A DEFESA. Toda operacao carrega o dono do client que a executa. Quando um
// `$transaction` abre, o dono dele fica registrado no contexto assincrono; se
// uma operacao de OUTRO dono rodar ali dentro, lanca. Troca uma corrupcao
// silenciosa por um erro imediato, com o nome dos dois clients na mensagem.
//
// O ESCAPE. Ha caso legitimo de tocar o central dentro de uma transacao de
// tenant (gravar trilha de auditoria, por exemplo). Ele nao pode ser
// transacional — sao bancos diferentes — e precisa dizer isso no codigo:
// envolva em `outsideTransaction(...)`, que limpa o contexto e deixa a
// operacao passar. E explicito de proposito: quem escreve assume que aquele
// trecho nao tem rollback.

const txOwner = new AsyncLocalStorage<string | null>();

/** Dono do `$transaction` em curso neste contexto, ou null fora de transacao. */
export function currentTxOwner(): string | null {
  return txOwner.getStore() ?? null;
}

/** Roda `fn` declarando que a transacao em curso pertence a `owner`. */
export function runAsTxOwner<T>(owner: string, fn: () => T): T {
  return txOwner.run(owner, fn);
}

/**
 * Executa fora da transacao corrente, a proposito.
 *
 * Use quando um trecho precisa tocar OUTRO banco durante uma transacao (ex.:
 * trilha de auditoria no central durante uma escrita no tenant). O que roda
 * aqui dentro NAO participa do rollback — e por isso o escape tem nome.
 */
export function outsideTransaction<T>(fn: () => Promise<T>): Promise<T> {
  // `await` DENTRO do run e obrigatorio. Uma operacao do Prisma e preguicosa:
  // o objeto e criado na chamada, mas a query so e despachada quando alguem
  // aguarda. Devolvendo a promessa crua, o contexto ja teria sido restaurado
  // na hora do despacho e a guarda barraria justamente o que o escape existe
  // para liberar — foi o que aconteceu na primeira versao.
  return txOwner.run(null, async () => await fn());
}

/** Nome do dono para o client de um tenant. */
export function tenantOwner(idCliente: number): string {
  return `tenant:${idCliente}`;
}

export const CENTRAL_OWNER = 'central';

function assertTxOwner(owner: string, model: string | undefined, operation: string): void {
  const aberto = currentTxOwner();
  if (!aberto || aberto === owner) return;
  const alvo = model ? `${model}.${operation}` : operation;
  throw new Error(
    `Transacao aberta no client "${aberto}" e operacao "${alvo}" executada no client "${owner}". ` +
      'Um $transaction nao cruza dois bancos: esta escrita ficaria FORA do rollback. ' +
      'Abra a transacao no mesmo client dos dados, ou marque o trecho com outsideTransaction() ' +
      'se ele realmente nao deve participar do rollback.',
  );
}

/**
 * Devolve o client com a guarda instalada:
 *  - toda operacao confere o dono da transacao em curso;
 *  - `$transaction` declara o proprio dono para o que rodar dentro dele.
 *
 * O cast final segue o padrao de shared/prisma.ts: a extensao so acrescenta
 * verificacao, a superficie de runtime continua a de PrismaClient.
 */
export function guardTransactions<T extends PrismaClient>(client: T, owner: string): T {
  const extended = client.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        assertTxOwner(owner, model, operation);
        return query(args);
      },
    },
  });

  // `$transaction` precisa de Proxy, nao de extensao: o hook de query so
  // enxerga operacoes de model, e o que interessa aqui e marcar o contexto
  // ANTES de o callback da transacao comecar a rodar.
  return new Proxy(extended as unknown as T, {
    get(target, prop, receiver) {
      const valor = Reflect.get(target, prop, receiver);
      if (prop !== '$transaction' || typeof valor !== 'function') return valor;
      return (...args: unknown[]) =>
        runAsTxOwner(owner, () => (valor as (...a: unknown[]) => unknown).apply(target, args));
    },
  });
}
