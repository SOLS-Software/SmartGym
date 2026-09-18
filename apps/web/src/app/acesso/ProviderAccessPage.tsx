'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch as fetch, apiUrl } from '../../shared/api/apiFetch';
import { GESTOR_SESSION_KEY, SESSION_KEY, encryptSession } from '../../shared/auth/sessionUtils';

type Empresa = { id: number; dsEmpresa: string; caCNPJ: string; boInativo: boolean };

type Resultado = {
  idOperador?: number;
  idCliente?: number;
  dsCliente?: string;
  dsOperador?: string;
  dsMotivo?: string;
  empresas?: Empresa[];
  permissions?: string[];
};

/** Rotulo do papel dentro do sistema do cliente. O mesmo que a API devolve. */
const PERFIL_IMPLANTACAO = { id: 0, dsPerfil: 'Implantação SOLS' };

/**
 * Quebra de vidro: a porta por onde um operador da SOLS entra para implantar.
 *
 * A pessoa chega aqui por um link emitido no painel do provedor, com um token
 * de USO UNICO e prazo de minutos. Esta tela troca o token por uma sessao — o
 * proxy move o JWT para o cookie HttpOnly, como em qualquer login — e monta as
 * sessoes que as telas do SOLSFIT leem do navegador.
 *
 * POR QUE MONTAR SESSAO NO NAVEGADOR, se o cookie ja basta para a API: as telas
 * do produto decidem "estou logado?" olhando o localStorage e confirmando em
 * /auth/verify. Sem o primeiro passo, o cookie valia para a API e nao valia
 * para a interface — era possivel estar autenticado e mesmo assim olhar um
 * formulario de CPF e senha. Foi exatamente o que aconteceu na primeira
 * implantacao.
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

    // Tira o token da URL antes mesmo da resposta chegar.
    if (token) window.history.replaceState({}, '', window.location.pathname);

    void (async () => {
      try {
        if (token) {
          const res = await fetch(`${apiUrl}/auth/acesso-provedor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          const dados = (await res.json().catch(() => ({}))) as Resultado & { message?: string };

          if (res.ok) {
            await montarSessoes(dados);
            setResultado(dados);
            setEstado('pronto');
            return;
          }
        }

        // SEM TOKEN, OU COM O TOKEN JA QUEIMADO: pode ser alguem VOLTANDO a esta
        // pagina, e nao um acesso invalido.
        //
        // O token vale 5 minutos e abre UMA vez; a sessao que ele emite vale 2
        // horas. Como esta tela tambem e o menu das tres portas, voltar a ela
        // para abrir outra portava dava "acesso expirado" — com a sessao viva
        // do outro lado. Quem responde de verdade e o /auth/verify.
        const sessao = await sessaoDeImplantacaoAberta();
        if (sessao) {
          setResultado(sessao);
          setEstado('pronto');
          return;
        }

        setEstado('erro');
        setMensagem(
          token
            ? 'Acesso inválido ou expirado.'
            : 'Link sem token. Abra o acesso novamente pelo painel.',
        );
      } catch {
        setEstado('erro');
        setMensagem('Não foi possível validar o acesso. Tente abrir outro pelo painel.');
      }
    })();
  }, []);

  /** A sessao de implantacao ainda esta de pe? Devolve com que dados exibi-la. */
  async function sessaoDeImplantacaoAberta(): Promise<Resultado | null> {
    try {
      const res = await fetch(`${apiUrl}/auth/verify`);
      if (!res.ok) return null;
      const dados = (await res.json()) as {
        id?: number;
        idCliente?: number;
        dsCliente?: string | null;
        name?: string;
        provedor?: boolean;
      };
      // Sessao comum de funcionario nao vira acesso de implantacao por abrir
      // esta URL: sem `provedor`, esta pagina nao tem o que mostrar.
      if (!dados.provedor) return null;
      return {
        idOperador: dados.id,
        idCliente: dados.idCliente,
        dsCliente: dados.dsCliente ?? undefined,
        dsOperador: dados.name,
      };
    } catch {
      return null;
    }
  }

  /**
   * Escreve as duas sessoes que as telas do produto esperam encontrar.
   *
   * Sao formatos diferentes porque nasceram em logins diferentes: o sistema
   * guarda a sessao cifrada (ofuscacao, nao seguranca — ver sessionUtils) e o
   * Gestor de Tema guarda um base64 com a lista de filiais. Reproduzir os dois
   * aqui e o preco de nao mexer nas duas telas.
   *
   * As permissoes vao junto so para o menu nascer recortado; a cada /auth/verify
   * elas sao reescritas pelo que o servidor responde, e a autorizacao de verdade
   * e conferida em toda requisicao.
   */
  async function montarSessoes(dados: Resultado) {
    const usuario = {
      id: dados.idOperador ?? 0,
      idAluno: null,
      idFuncionario: null,
      idCliente: dados.idCliente ?? null,
      name: dados.dsOperador ?? 'Operador SOLS',
      type: 'employee' as const,
      permissions: dados.permissions ?? [],
      perfilAcesso: PERFIL_IMPLANTACAO,
    };

    try {
      const cifrada = await encryptSession({
        user: usuario,
        // Abre em Empresas: numa implantacao, a unidade e a primeira coisa a
        // existir — sem ela nao ha onde pendurar equipe, plano nem catraca.
        activeItem: 'Empresas',
        cachedAt: Date.now(),
      });
      localStorage.setItem(SESSION_KEY, cifrada);
    } catch {
      // Sem localStorage (aba anonima com armazenamento bloqueado) a tela
      // seguinte vai pedir login. Nao impede de mostrar o resto daqui.
    }

    try {
      localStorage.setItem(
        GESTOR_SESSION_KEY,
        btoa(
          JSON.stringify({
            data: { ...usuario, idCliente: dados.idCliente, empresas: dados.empresas ?? [] },
            cachedAt: Date.now(),
          }),
        ),
      );
    } catch {
      // btoa recusa caractere fora do Latin-1 (um emoji no nome da filial, por
      // exemplo). Perder o atalho do tema nao pode custar a entrada no sistema.
    }
  }

  const caixa: React.CSSProperties = {
    display: 'block',
    padding: '0.9rem 1.1rem',
    border: '1px solid #d4d9e3',
    borderRadius: '0.6rem',
    textDecoration: 'none',
    color: 'inherit',
  };

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

          {/* As tres telas do produto, na ordem em que uma implantacao precisa
              delas: montar a academia, vestir a marca, conferir a porta. */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <a
              href="/"
              style={{
                ...caixa,
                background: '#032da2',
                borderColor: '#032da2',
                color: '#fff',
              }}
            >
              <strong>Sistema</strong>
              <span style={{ display: 'block', fontSize: '0.8rem', opacity: 0.85 }}>
                Unidades, equipe, perfis, planos, aulas, equipamentos, catraca e conta de
                recebimento.
              </span>
            </a>

            <a href="/gestor" style={caixa}>
              <strong>Gestor de Tema</strong>
              <span style={{ display: 'block', fontSize: '0.8rem', opacity: 0.7 }}>
                Cores, fonte e medidas das telas do cliente.
              </span>
            </a>

            {/* A porta do aluno abre a tela de ENTRADA, e nao uma sessao de
                aluno: com as permissoes de implantacao, ficha, treino, check-in
                e pagamento sao recusados pela API — uma sessao de aluno seria
                uma tela quebrada, e nao um acesso. Serve para o que a
                implantacao precisa ver ali: a marca na porta. */}
            <a href="/?vista=entrada" style={caixa}>
              <strong>Porta do aluno</strong>
              <span style={{ display: 'block', fontSize: '0.8rem', opacity: 0.7 }}>
                A tela de entrada como o aluno vê, com a marca deste cliente. Sua sessão continua
                aberta.
              </span>
            </a>
          </nav>

          <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>
            Esta sessão alcança configuração e equipe. Ficha de aluno, avaliação física, treino,
            check-in e pagamento ficam fora — perante a academia, a SOLS é operadora.
          </p>
          <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>
            O link de entrada vale 5 minutos e abre uma única vez; a sessão dura 2 horas. Volte a
            esta página quando quiser trocar de tela — enquanto a sessão durar, ela abre sem token.
          </p>
        </>
      )}
    </main>
  );
}
