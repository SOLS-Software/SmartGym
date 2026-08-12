// Fila de comandos por equipamento.
//
// A catraca nao aceita conexao de entrada para receber ordens: ela e quem
// pergunta, a cada ciclo de push, se ha algo a fazer. Entao tudo que o SmartGym
// precisa mandar para o equipamento (configuracao, sincronizacao de acesso)
// espera aqui ate o proximo `GET /controlid/push` daquele device.
//
// Em memoria de proposito. O conteudo e sempre reconstruivel a partir do banco:
// a reconciliacao compara o estado desejado com o que esta no equipamento e
// reenfileira o que faltar. Perder a fila num restart custa, no maximo, um ciclo
// de atraso — nunca um aluno liberado indevidamente.
export type ComandoControlid = {
  verb: string;
  endpoint: string;
  contentType: string;
  queryString: string;
  body: Record<string, unknown>;
};

export function comando(endpoint: string, body: Record<string, unknown>): ComandoControlid {
  return { verb: 'POST', endpoint, contentType: 'application/json', queryString: '', body };
}

const filas = new Map<string, ComandoControlid[]>();

// Teto por device. Se a catraca ficar horas sem buscar comandos (queda de rede,
// equipamento desligado), a fila nao pode crescer sem limite dentro do processo.
// Descartamos os MAIS ANTIGOS: numa fila de sincronizacao, o comando recente
// sempre representa o estado mais atual do aluno.
const MAX_FILA = 500;

export function enfileirar(deviceId: string, ...comandos: ComandoControlid[]) {
  if (!deviceId || comandos.length === 0) return;
  const fila = filas.get(deviceId) ?? [];
  fila.push(...comandos);
  if (fila.length > MAX_FILA) fila.splice(0, fila.length - MAX_FILA);
  filas.set(deviceId, fila);
}

export function proximoComando(deviceId: string): ComandoControlid | null {
  const fila = filas.get(deviceId);
  if (!fila || fila.length === 0) return null;
  const proximo = fila.shift() ?? null;
  if (fila.length === 0) filas.delete(deviceId);
  return proximo;
}

export function tamanhoDaFila(deviceId: string): number {
  return filas.get(deviceId)?.length ?? 0;
}
