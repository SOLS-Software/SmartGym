// Testes do formato do token de push.
//
// So a validacao, que e a parte pura: `sendExpoPush` fala com o servico do
// Expo pela rede, e um teste que finge a rede testaria o dublê, nao o codigo.
// O que precisa de trava aqui e o que decide se um texto qualquer pode virar
// "aparelho registrado" na base.
import { describe, expect, it } from 'vitest';
import { buildPushRequest, isExpoPushToken } from './push.js';

describe('isExpoPushToken', () => {
  it('aceita os dois formatos que o Expo emite', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[yyyyyyyyyyyyyyyyyyyyyy]')).toBe(true);
  });

  it('recusa texto que nao e token', () => {
    expect(isExpoPushToken('')).toBe(false);
    expect(isExpoPushToken('abc123')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
    // Sem isto, um campo de texto qualquer viraria endereco de aparelho e a
    // base acumularia destino para onde nunca vai chegar nada.
    expect(isExpoPushToken('<script>alert(1)</script>')).toBe(false);
  });

  it('recusa o que nao e string', () => {
    expect(isExpoPushToken(null)).toBe(false);
    expect(isExpoPushToken(undefined)).toBe(false);
    expect(isExpoPushToken(42)).toBe(false);
    expect(isExpoPushToken({ to: 'ExponentPushToken[a]' })).toBe(false);
  });

  it('recusa token maior que a coluna', () => {
    expect(isExpoPushToken(`ExponentPushToken[${'a'.repeat(300)}]`)).toBe(false);
  });
});

describe('buildPushRequest', () => {
  const aviso = {
    to: 'ExponentPushToken[abcdefghijklmnopqrstuv]',
    title: 'Pagamento a vencer',
    body: 'Sua proxima parcela vence em 30/08/2026.',
    data: { tipo: 'aviso', idNotificacao: 412 },
  };

  it('manda pelo canal de avisos do Android', () => {
    // O canal e quem define importancia e som no Android. Sem `channelId` o
    // aviso cai no canal padrao e a importancia alta configurada no app nao
    // vale nada — e a notificacao chega mesmo assim, entao nada acusa o erro.
    // O nome tem que bater com CANAL_AVISOS em apps/mobile/lib/push.
    expect(buildPushRequest(aviso).channelId).toBe('avisos');
  });

  it('pede prioridade alta e som', () => {
    const pedido = buildPushRequest(aviso);
    expect(pedido.priority).toBe('high');
    expect(pedido.sound).toBe('default');
  });

  it('leva os dados que a tela de avisos usa para abrir no aviso certo', () => {
    expect(buildPushRequest(aviso).data).toEqual({ tipo: 'aviso', idNotificacao: 412 });
  });

  it('nunca manda data undefined', () => {
    // O endpoint do Expo recusa payload malformado, e um aviso sem `data`
    // chegaria sem o que o listener de toque le para rotear.
    const semDados = buildPushRequest({ to: aviso.to, title: 'x', body: 'y' });
    expect(semDados.data).toEqual({});
  });
});
