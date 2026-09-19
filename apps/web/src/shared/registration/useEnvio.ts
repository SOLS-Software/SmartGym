'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Impede que a mesma ação seja disparada de novo enquanto ainda está rodando.
 *
 * O PROBLEMA QUE RESOLVE: botões de salvar ficavam habilitados durante a
 * requisição. Numa ação rápida isso passa despercebido; numa lenta, não. Montar
 * uma agenda de trinta dias faz trinta POSTs em sequência — segundos de espera,
 * com o botão convidando a clicar de novo. Cada clique extra criava OUTRA
 * agenda para cada data, e a pessoa só descobria depois, com o calendário
 * duplicado.
 *
 * SÃO DUAS TRAVAS, e as duas são necessárias:
 *
 *   `emCurso` (ref) é a que de fato protege. Ela vale no mesmo instante da
 *   chamada. Um duplo clique rápido dispara os dois eventos ANTES de o React
 *   re-renderizar, então uma trava baseada só em estado chegaria tarde.
 *
 *   `enviando` (estado) existe para a TELA: é o que desabilita o botão e mostra
 *   que algo está acontecendo. Sozinho, ele não impediria o segundo clique.
 *
 * `preventDefault` é chamado antes da trava, e não depois: o submit bloqueado
 * não pode escapar para a navegação nativa do formulário. Chamar duas vezes —
 * aqui e no handler, que normalmente já chama — não tem efeito colateral.
 */
export function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const emCurso = useRef(false);

  const envolver = useCallback(
    <E extends { preventDefault?: () => void }>(handler: (evento: E) => void | Promise<void>) =>
      async (evento: E) => {
        evento?.preventDefault?.();
        if (emCurso.current) return;
        emCurso.current = true;
        setEnviando(true);
        try {
          await handler(evento);
        } finally {
          // `finally` e nao depois do await: se o handler lançar, a trava tem
          // de sair do caminho, senão o botão fica morto até recarregar a
          // página — e a pessoa perde o formulário preenchido.
          emCurso.current = false;
          setEnviando(false);
        }
      },
    [],
  );

  return { enviando, envolver };
}
