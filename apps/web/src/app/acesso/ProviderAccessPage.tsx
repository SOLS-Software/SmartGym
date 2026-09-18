'use client';

import { useEffect, useRef, useState } from 'react';

type Resultado = {
  dsCliente?: string;
  dsOperador?: string;
  dsMotivo?: string;
};

/**
 * Quebra de vidro: a porta por onde um operador da SOLS entra para implantar.
 *
 * A pessoa chega aqui por um link emitido no painel do provedor, com um token
 * de USO UNICO e prazo de minutos. Esta tela so faz a troca: manda o token para
 * a API, que devolve uma sessao; o proxy move essa sessao para o cookie
 * HttpOnly, como em qualquer login.
 *
 * O TOKEN SAI DA URL assim que e usado (replaceState). Endereco de navegador
 * vaza com facilidade — fica no historico, na sincronizacao entre dispositivos,
 * no print que alguem manda no grupo. Ele ja estara queimado a essa altura, mas
 * nao ha motivo para deixa-lo a vista.
 *
 * NAO E UMA TELA DE ESPERA BONITA: e uma tela que diz, antes de entrar, EM QUAL
 * cliente se esta entrando e COM QUE motivo. Quem administra varios clientes
 * erra de aba, e a hora de perceber isso e antes de comecar a cadastrar.
 */
export default function ProviderAccessPage() {
  const [estado, setEstado] = useState<'trocando' | 'pronto' | 'erro'>('trocando');
  const [mensagem, setMensagem] = useState('');
  const [resultado, setResultado] = useState<Resultado>({});
  // O React 18+ roda o efeito duas vezes em desenvolvimento. Sem esta trava, a
  // segunda execucao gastaria o token ja queimado pela primeira e a tela
  // mostraria "acesso invalido" logo depois de ter dado certo.
  const jaTrocou = useRef(false);

  useEffect(() => {
    if (jaTrocou.current) return;
    jaTrocou.current = true;

    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setEstado('erro');
      setMensagem('Link sem token. Abra o acesso novamente pelo painel.');
      return;
    }

    // Tira o token da URL antes mesmo da resposta chegar.
    window.history.replaceState({}, '', window.location.pathname);

    void (async () => {
      try {
        const res = await fetch('/api/proxy/auth/acesso-provedor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const dados = (await res.json().catch(() => ({}))) as Resultado & { message?: string };

        if (!res.ok) {
          setEstado('erro');
          setMensagem(dados.message ?? 'Acesso inválido ou expirado.');
          return;
        }

        setResultado(dados);
        setEstado('pronto');
      } catch {
        setEstado('erro');
        setMensagem('Não foi possível validar o acesso. Tente abrir outro pelo painel.');
      }
    })();
  }, []);

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '1rem',
        maxWidth: '32rem',
        margin: '0 auto',
        padding: '1.5rem',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Acesso de implantação</h1>

      {estado === 'trocando' && <p>Validando o acesso...</p>}

      {estado === 'erro' && (
        <>
          <p role="alert" style={{ color: '#b91c1c' }}>
            {mensagem}
          </p>
          <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>
            Cada link abre uma única vez e vale por poucos minutos. Abrir outro no painel leva um
            clique — e deixa mais uma linha na trilha, que é o comportamento esperado.
          </p>
        </>
      )}

      {estado === 'pronto' && (
        <>
          <p>
            Entrando em <strong>{resultado.dsCliente}</strong> como{' '}
            <strong>{resultado.dsOperador}</strong>.
          </p>
          {resultado.dsMotivo && (
            <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>Motivo: {resultado.dsMotivo}</p>
          )}
          <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>
            Esta sessão alcança configuração e equipe. Ficha de aluno, avaliação física, treino,
            check-in e pagamento ficam fora — perante a academia, a SOLS é operadora.
          </p>
          <a
            href="/gestor"
            style={{
              alignSelf: 'flex-start',
              background: '#032da2',
              color: '#fff',
              padding: '0.75rem 1.25rem',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Abrir o sistema
          </a>
        </>
      )}
    </main>
  );
}
