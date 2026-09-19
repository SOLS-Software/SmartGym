import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEnvio } from './useEnvio';

// Trinta e dois formulários do painel dependem deste hook. Ele existe porque
// botões de salvar ficavam habilitados durante a requisição: numa ação lenta —
// montar uma agenda de trinta dias faz trinta POSTs em sequência — cada clique
// extra repetia a operação inteira e duplicava o que já tinha sido criado.
//
// Os testes abaixo travam as duas propriedades que a correção precisa ter, e
// que se perderiam numa simplificação bem-intencionada do código.

describe('useEnvio', () => {
  /** Handler que só resolve quando o teste mandar, para segurar a ação no ar. */
  function handlerControlado() {
    let liberar!: () => void;
    const promessa = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const handler = vi.fn(() => promessa);
    return { handler, liberar };
  }

  const evento = () => ({ preventDefault: vi.fn() });

  it('executa uma vez só quando o clique se repete antes de terminar', async () => {
    const { handler, liberar } = handlerControlado();
    const { result } = renderHook(() => useEnvio());

    await act(async () => {
      const embrulhado = result.current.envolver(handler);
      // Cinco disparos em rajada, sem nenhuma renderização entre eles: é assim
      // que um duplo clique impaciente chega de verdade.
      void embrulhado(evento());
      void embrulhado(evento());
      void embrulhado(evento());
      void embrulhado(evento());
      void embrulhado(evento());
    });

    expect(handler).toHaveBeenCalledTimes(1);

    await act(async () => {
      liberar();
    });
  });

  // ESTA É A RAZÃO DE EXISTIR A TRAVA POR `ref`. Medido no navegador: logo após
  // os cliques o botão ainda estava habilitado, porque o React não havia
  // re-renderizado — quem barrou foi a ref, não o atributo `disabled`. Uma
  // trava baseada só em estado chegaria tarde e deixaria passar as repetições.
  it('barra o segundo disparo ANTES de qualquer renderização', async () => {
    const { handler, liberar } = handlerControlado();
    const { result } = renderHook(() => useEnvio());
    const embrulhado = result.current.envolver(handler);

    await act(async () => {
      void embrulhado(evento());
      // `enviando` ainda é `false` aqui: o estado só chega na próxima
      // renderização. Se a trava dependesse dele, esta chamada passaria.
      expect(result.current.enviando).toBe(false);
      void embrulhado(evento());
    });

    expect(handler).toHaveBeenCalledTimes(1);

    await act(async () => {
      liberar();
    });
  });

  it('marca `enviando` enquanto a ação está no ar', async () => {
    const { handler, liberar } = handlerControlado();
    const { result } = renderHook(() => useEnvio());

    await act(async () => {
      void result.current.envolver(handler)(evento());
    });
    expect(result.current.enviando).toBe(true);

    await act(async () => {
      liberar();
    });
    expect(result.current.enviando).toBe(false);
  });

  // "Voltar ao padrão em qualquer estágio" foi a exigência, e são quatro
  // estágios. O que os cobre é a liberação estar em `finally`: sem ela, um
  // handler que lança deixa o botão morto até a pessoa recarregar a página —
  // perdendo o formulário preenchido, que é o pior desfecho possível.
  it.each([
    ['saída antecipada por validação', async () => { return; }],
    ['erro lançado depois de um await', async () => { await Promise.resolve(); throw new Error('falhou'); }],
    ['erro síncrono, antes de qualquer await', () => { throw new Error('síncrono'); }],
    ['sucesso', async () => { await Promise.resolve(); }],
  ])('reabilita o botão após %s', async (_nome, handler) => {
    const { result } = renderHook(() => useEnvio());

    await act(async () => {
      await result.current.envolver(handler as () => void | Promise<void>)(evento()).catch(() => {
        // O erro segue para quem chamou; aqui só interessa o estado final.
      });
    });

    expect(result.current.enviando).toBe(false);
  });

  it('volta a aceitar disparos depois que a ação termina', async () => {
    const { result } = renderHook(() => useEnvio());
    const handler = vi.fn(async () => {});

    await act(async () => {
      await result.current.envolver(handler)(evento());
    });
    await act(async () => {
      await result.current.envolver(handler)(evento());
    });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  // `preventDefault` vem ANTES da trava, e não depois: o submit bloqueado não
  // pode escapar para a navegação nativa do formulário, que recarregaria a
  // página e descartaria tudo que foi digitado.
  it('impede a navegação nativa inclusive no disparo bloqueado', async () => {
    const { handler, liberar } = handlerControlado();
    const { result } = renderHook(() => useEnvio());
    const embrulhado = result.current.envolver(handler);
    const primeiro = evento();
    const segundo = evento();

    await act(async () => {
      void embrulhado(primeiro);
      void embrulhado(segundo);
    });

    expect(primeiro.preventDefault).toHaveBeenCalled();
    expect(segundo.preventDefault).toHaveBeenCalled();

    await act(async () => {
      liberar();
    });
  });
});
