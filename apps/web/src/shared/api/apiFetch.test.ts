import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, apiUrl } from './apiFetch';

// O apiFetch é o caminho de TODA chamada do painel, e foi onde nasceram os
// defeitos cujo sintoma não acusava a causa. Dois deles importam aqui:
//
//   - o cancelamento deliberado. Telas que trocam de seleção rápido abortam a
//     busca anterior e identificam isso por `name === 'AbortError'` para
//     ignorar em silêncio. Qualquer mudança que embrulhe esse erro transforma
//     cada troca de aluno numa mensagem vermelha na tela;
//
//   - o teto de tempo. Sem ele, uma requisição pendurada nunca resolve, o
//     `finally` do useEnvio não roda, e o botão de salvar fica morto até a
//     pessoa recarregar — perdendo o formulário preenchido.
//
// Em teste, `NODE_ENV` não é 'production', então o apiFetch segue o caminho
// LEGÍVEL (sem cifrar caminho e corpo). É o caminho certo para exercitar aqui:
// o teto e a tradução moram nele, e valem para os dois.

describe('apiFetch', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  /** Substitui o fetch global e devolve o `init` que ele recebeu. */
  function capturarInit() {
    const capturado: { init?: RequestInit } = {};
    globalThis.fetch = vi.fn(async (_entrada: unknown, init?: RequestInit) => {
      capturado.init = init;
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    return capturado;
  }

  function fetchQueRejeitaCom(erro: unknown) {
    globalThis.fetch = vi.fn(async () => {
      throw erro;
    }) as unknown as typeof fetch;
  }

  describe('teto de tempo', () => {
    it('envia um sinal de aborto mesmo quando o chamador não passa nenhum', async () => {
      const capturado = capturarInit();

      await apiFetch(`${apiUrl}/qualquer`);

      expect(capturado.init?.signal).toBeInstanceOf(AbortSignal);
    });

    // O sinal do chamador não pode ser SUBSTITUÍDO pelo do teto: telas que
    // cancelam a busca anterior dependem dele. Os dois são combinados, e vale o
    // que disparar primeiro — aqui, o do chamador.
    it('preserva o cancelamento do chamador ao combinar com o teto', async () => {
      const capturado = capturarInit();
      const controlador = new AbortController();

      await apiFetch(`${apiUrl}/qualquer`, { signal: controlador.signal });
      const sinal = capturado.init?.signal as AbortSignal;

      expect(sinal.aborted).toBe(false);
      controlador.abort();
      expect(sinal.aborted).toBe(true);
      expect((sinal.reason as DOMException).name).toBe('AbortError');
    });
  });

  describe('tradução da falha de transporte', () => {
    // A mais importante: o AbortError precisa chegar INTACTO, porque as telas o
    // reconhecem por `instanceof DOMException && name === 'AbortError'`.
    it('NÃO traduz o cancelamento deliberado', async () => {
      const cancelamento = new DOMException('The operation was aborted.', 'AbortError');
      fetchQueRejeitaCom(cancelamento);

      const erro = await apiFetch(`${apiUrl}/x`).catch((e: unknown) => e);

      expect(erro).toBe(cancelamento);
      expect(erro instanceof DOMException && erro.name === 'AbortError').toBe(true);
    });

    // O timeout, ao contrário, TEM de aparecer: significa que a operação não
    // aconteceu, e quem está esperando precisa saber.
    it('traduz o estouro de tempo para uma frase em português', async () => {
      fetchQueRejeitaCom(new DOMException('signal timed out', 'TimeoutError'));

      const erro = await apiFetch(`${apiUrl}/x`).catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(Error);
      expect(erro instanceof DOMException).toBe(false);
      expect((erro as Error).message).toContain('demorou demais');
    });

    // As telas mostram `error.message` direto ao usuário em mais de duzentos
    // lugares. Sem tradução, quem usa o sistema lê "Failed to fetch".
    it('traduz a falha de rede em vez de vazar o texto do navegador', async () => {
      fetchQueRejeitaCom(new TypeError('Failed to fetch'));

      const erro = await apiFetch(`${apiUrl}/x`).catch((e: unknown) => e);

      expect((erro as Error).message).not.toContain('Failed to fetch');
      expect((erro as Error).message).toContain('servidor');
    });

    it('deixa passar um erro que não é de transporte', async () => {
      const qualquer = new Error('erro de regra de negócio');
      fetchQueRejeitaCom(qualquer);

      const erro = await apiFetch(`${apiUrl}/x`).catch((e: unknown) => e);

      expect(erro).toBe(qualquer);
    });
  });

  it('devolve a resposta sem mexer quando dá certo', async () => {
    capturarInit();

    const resposta = await apiFetch(`${apiUrl}/x`);

    expect(resposta.status).toBe(200);
    await expect(resposta.json()).resolves.toEqual({});
  });
});
