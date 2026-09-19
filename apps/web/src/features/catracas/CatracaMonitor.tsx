'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Fingerprint, Link2, Pencil, Plus, Power, RefreshCw, Save, Unlink } from 'lucide-react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { useEnvio } from '../../shared/registration/useEnvio';
import { useToast } from '../../shared/components/Toast';

type Catraca = {
  id: number;
  dsCatraca: string;
  dsFabricante: string;
  dsModelo: string;
  caSerial: string;
  anIp: string;
  anIpPermitido: string;
  anMac: string;
  caToken: string;
  idEmpresa: number | null;
  boInativo: boolean;
  dtUltimoPush: string | null;
  boOnline: boolean;
  nrSegundosSemContato: number | null;
};

type Empresa = {
  id: number;
  dsEmpresa: string;
  boInativo: boolean;
};

type EnderecoDispositivo = {
  chave: string | null;
  caminho: string | null;
  endereco: string | null;
  enderecoLegado: string | null;
};

type CatracaEvento = {
  id: number;
  idAluno: number | null;
  nrUsuarioCatraca: string | null;
  dsTipoEvento: string;
  boAcessoLiberado: boolean;
  boDecisaoOnline: boolean;
  dsMotivo: string;
  dtEvento: string;
  aluno: { id: number; nmAluno: string } | null;
};

type UsuarioNaoVinculado = {
  nrUsuarioCatraca: string;
  qtEventos: number;
  dtUltimoEvento: string | null;
};

type AlunoResumo = {
  id: number;
  nmAluno: string;
  nrUsuarioCatraca: number | null;
};

type EtapaCadastro =
  | 'criando_usuario'
  | 'lendo_digitais'
  | 'aguardando_dedo'
  | 'concluido'
  | 'cancelado'
  | 'erro'
  | 'expirado';

type SessaoCadastro = {
  deviceId: string;
  idCatraca: number;
  idAluno: number;
  nmAluno: string;
  nrUsuarioCatraca: number | null;
  etapa: EtapaCadastro;
  dsMensagem: string;
  qtDigitaisAntes: number;
  qtDigitaisAgora: number;
  boVerificacaoIndisponivel: boolean;
  dtInicio: string;
  dtAtualizacao: string;
};

// A catraca reporta "0" quando NAO identificou ninguem — nao e um usuario.
const USUARIO_NAO_IDENTIFICADO = '0';

// Etapas em que ainda ha algo acontecendo no equipamento: enquanto durarem, a
// tela pergunta o estado a cada poucos segundos.
const ETAPAS_ATIVAS: EtapaCadastro[] = ['criando_usuario', 'lendo_digitais', 'aguardando_dedo'];

// Intervalo do acompanhamento do cadastro. Bem mais curto que o refresh geral
// da tela (30s): aqui tem uma pessoa com o dedo no leitor esperando resposta.
const INTERVALO_CADASTRO_MS = 2_000;

function estadoDaEtapa(etapa: EtapaCadastro): 'ativo' | 'ok' | 'falha' {
  if (etapa === 'concluido') return 'ok';
  if (etapa === 'erro' || etapa === 'expirado' || etapa === 'cancelado') return 'falha';
  return 'ativo';
}

function tituloDaEtapa(etapa: EtapaCadastro, nmAluno: string): string {
  switch (etapa) {
    case 'criando_usuario':
      return `Criando ${nmAluno} na catraca...`;
    case 'lendo_digitais':
      return `Consultando as digitais de ${nmAluno}...`;
    case 'aguardando_dedo':
      return `Aguardando a digital de ${nmAluno}`;
    case 'concluido':
      return `Digital de ${nmAluno} cadastrada`;
    case 'cancelado':
      return 'Cadastro cancelado';
    case 'expirado':
      return 'Tempo esgotado';
    default:
      return 'Não foi possível cadastrar';
  }
}

function tempoDecorrido(segundos: number | null): string {
  if (segundos === null) return 'nunca';
  if (segundos < 60) return `há ${segundos}s`;
  if (segundos < 3600) return `há ${Math.round(segundos / 60)}min`;
  if (segundos < 86400) return `há ${Math.round(segundos / 3600)}h`;
  return `há ${Math.round(segundos / 86400)}d`;
}

function dataHora(valor: string | null): string {
  if (!valor) return '—';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleString('pt-BR');
}

// Formulario do cadastro manual/edicao. `anIp` e `caToken` NAO tem campo na
// tela — o IP quem escreve e o proprio equipamento a cada push, e o token e
// inviavel neste firmware (a tela de push nao tem onde digita-lo). Os dois
// andam junto no formulario mesmo assim porque o PUT manda o registro inteiro:
// deixar de enviar um deles apagaria o valor guardado.
type FormCatraca = {
  dsCatraca: string;
  idEmpresa: string;
  dsFabricante: string;
  dsModelo: string;
  caSerial: string;
  anIpPermitido: string;
  anMac: string;
  anIp: string;
  caToken: string;
  boInativo: boolean;
};

const FORM_VAZIO: FormCatraca = {
  dsCatraca: '',
  idEmpresa: '',
  dsFabricante: 'controlid',
  dsModelo: '',
  caSerial: '',
  anIpPermitido: '',
  anMac: '',
  anIp: '',
  caToken: '',
  boInativo: false,
};

function formDaCatraca(catraca: Catraca): FormCatraca {
  return {
    dsCatraca: catraca.dsCatraca ?? '',
    idEmpresa: catraca.idEmpresa === null ? '' : String(catraca.idEmpresa),
    dsFabricante: catraca.dsFabricante ?? '',
    dsModelo: catraca.dsModelo ?? '',
    caSerial: catraca.caSerial ?? '',
    anIpPermitido: catraca.anIpPermitido ?? '',
    anMac: catraca.anMac ?? '',
    anIp: catraca.anIp ?? '',
    caToken: catraca.caToken ?? '',
    boInativo: catraca.boInativo,
  };
}

function corpoDaCatraca(form: FormCatraca) {
  return {
    dsCatraca: form.dsCatraca.trim(),
    idEmpresa: form.idEmpresa ? Number(form.idEmpresa) : undefined,
    dsFabricante: form.dsFabricante.trim(),
    dsModelo: form.dsModelo.trim(),
    caSerial: form.caSerial.trim(),
    anIpPermitido: form.anIpPermitido.trim(),
    anMac: form.anMac.trim(),
    anIp: form.anIp.trim(),
    caToken: form.caToken.trim(),
    boInativo: form.boInativo ? 1 : 0,
  };
}

export function CatracaMonitor() {
  const { showToast } = useToast();
  const { enviando, envolver } = useEnvio();

  const [catracas, setCatracas] = useState<Catraca[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [endereco, setEndereco] = useState<EnderecoDispositivo | null>(null);
  const [enderecoCopiado, setEnderecoCopiado] = useState(false);
  const [empresaDaPendente, setEmpresaDaPendente] = useState<Record<number, string>>({});
  const [nomeDaPendente, setNomeDaPendente] = useState<Record<number, string>>({});
  const [ativando, setAtivando] = useState<number | null>(null);
  const [emEdicao, setEmEdicao] = useState<Catraca | 'nova' | null>(null);
  const [form, setForm] = useState<FormCatraca>(FORM_VAZIO);
  const [feedback, setFeedback] = useState('');
  const [eventos, setEventos] = useState<CatracaEvento[]>([]);
  const [naoVinculados, setNaoVinculados] = useState<UsuarioNaoVinculado[]>([]);
  const [alunos, setAlunos] = useState<AlunoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [alunoEscolhido, setAlunoEscolhido] = useState<Record<string, string>>({});
  const [cadastroCatraca, setCadastroCatraca] = useState('');
  const [cadastroAluno, setCadastroAluno] = useState('');
  const [sessao, setSessao] = useState<SessaoCadastro | null>(null);
  const [iniciandoCadastro, setIniciandoCadastro] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [respCatracas, respEventos, respNaoVinculados, respAlunos] = await Promise.all([
        fetch(`${apiUrl}/controlid/catracas?includeInactive=true`),
        fetch(`${apiUrl}/controlid/events?limit=50`),
        fetch(`${apiUrl}/controlid/usuarios-nao-vinculados`),
        fetch(`${apiUrl}/students`),
      ]);

      if (!respCatracas.ok) await getApiError(respCatracas, 'Não foi possível carregar as catracas.');
      setCatracas((await respCatracas.json()) as Catraca[]);
      if (!respEventos.ok) await getApiError(respEventos, 'Não foi possível carregar os acessos.');
      setEventos((await respEventos.json()) as CatracaEvento[]);
      if (!respNaoVinculados.ok) {
        await getApiError(respNaoVinculados, 'Não foi possível carregar os usuários da catraca.');
      }
      setNaoVinculados((await respNaoVinculados.json()) as UsuarioNaoVinculado[]);
      if (!respAlunos.ok) await getApiError(respAlunos, 'Não foi possível carregar os alunos.');
      setAlunos((await respAlunos.json()) as AlunoResumo[]);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Erro ao carregar dados das catracas.',
        'error',
      );
    } finally {
      setCarregando(false);
    }
  }, [showToast]);

  // Endereco do dispositivo e lista de empresas mudam de ano em ano, nao a cada
  // 30s: ficam fora do ciclo de atualizacao e falham em silencio. Sem a lista de
  // empresas ainda da para ver os equipamentos; sem o endereco, idem.
  const carregarApoio = useCallback(async () => {
    try {
      const resposta = await fetch(`${apiUrl}/controlid/endereco`);
      if (resposta.ok) setEndereco((await resposta.json()) as EnderecoDispositivo);
    } catch {
      // silencioso de proposito — ver comentario acima
    }
    try {
      const resposta = await fetch(`${apiUrl}/companies`);
      if (resposta.ok) {
        const dados = (await resposta.json()) as Empresa[];
        setEmpresas(dados.filter((empresa) => !empresa.boInativo));
      }
    } catch {
      // silencioso de proposito — ver comentario acima
    }
  }, []);

  useEffect(() => {
    void carregarApoio();
  }, [carregarApoio]);

  useEffect(() => {
    void carregar();
    // A catraca conversa com a API a cada poucos segundos; sem atualizacao
    // automatica a tela mostraria "online" de um equipamento que caiu ha meia
    // hora — justamente a falha que esta tela existe para expor.
    const timer = window.setInterval(() => void carregar(), 30_000);
    return () => window.clearInterval(timer);
  }, [carregar]);

  const alunosVinculados = useMemo(
    () => alunos.filter((aluno) => aluno.nrUsuarioCatraca !== null),
    [alunos],
  );

  // So oferece equipamento que consegue receber o comando AGORA. A fila e por
  // serial e uma catraca sem contato nunca vem busca-la: o cadastro ficaria
  // "carregando" ate estourar o tempo, sem nada acontecendo do outro lado.
  const catracasDisponiveis = useMemo(
    () => catracas.filter((catraca) => !catraca.boInativo && catraca.boOnline && catraca.caSerial),
    [catracas],
  );

  // Catraca auto-registrada nasce sem empresa: ela e visivel, mas ainda nao e
  // de ninguem. Separar as duas listas evita o engano de achar que o
  // equipamento novo ja esta valendo so porque apareceu na tela.
  const pendentes = useMemo(
    () => catracas.filter((catraca) => catraca.idEmpresa === null),
    [catracas],
  );
  const proprias = useMemo(
    () => catracas.filter((catraca) => catraca.idEmpresa !== null),
    [catracas],
  );

  const enderecoParaCopiar = endereco?.endereco ?? endereco?.caminho ?? '';

  const cadastroAtivo = sessao !== null && ETAPAS_ATIVAS.includes(sessao.etapa);
  const idCatracaDaSessao = sessao?.idCatraca ?? null;
  const etapaDaSessao = sessao?.etapa ?? null;

  // Acompanhamento do cadastro em andamento. Sai de cena assim que a sessao
  // termina — nao ha por que continuar perguntando sobre um cadastro concluido.
  useEffect(() => {
    if (!cadastroAtivo || idCatracaDaSessao === null) return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const resposta = await fetch(
            `${apiUrl}/controlid/cadastro-digital?idCatraca=${idCatracaDaSessao}`,
          );
          if (!resposta.ok) return;
          const dados = (await resposta.json()) as { sessao: SessaoCadastro | null };
          if (dados.sessao) setSessao(dados.sessao);
        } catch {
          // Falha de rede num ciclo nao invalida o cadastro: o proximo tenta de
          // novo, e o tempo limite de verdade e o da sessao no servidor.
        }
      })();
    }, INTERVALO_CADASTRO_MS);
    return () => window.clearInterval(timer);
  }, [cadastroAtivo, idCatracaDaSessao]);

  // Cadastro concluido cria (ou reaproveita) o usuario na catraca e grava o
  // vinculo: as listas de alunos e de pendentes ficaram desatualizadas.
  useEffect(() => {
    if (etapaDaSessao === 'concluido') void carregar();
  }, [etapaDaSessao, carregar]);

  async function copiarEndereco() {
    if (!enderecoParaCopiar) return;
    try {
      await navigator.clipboard.writeText(enderecoParaCopiar);
      setEnderecoCopiado(true);
      showToast('Endereço copiado.', 'success');
    } catch {
      // Area de transferencia bloqueada: o endereco continua na tela, inteiro,
      // para copiar a mao.
      setEnderecoCopiado(false);
    }
  }

  // Reivindicacao: atribui a catraca auto-registrada a uma empresa do cliente e
  // ja a deixa ativa. E o unico caminho que tira o equipamento do limbo — o
  // PATCH de status recusa catraca sem empresa, de proposito.
  async function reivindicar(catraca: Catraca) {
    const idEmpresa = empresaDaPendente[catraca.id];
    if (!idEmpresa) {
      showToast('Escolha a empresa para ativar a catraca.', 'error');
      return;
    }
    setAtivando(catraca.id);
    try {
      const resposta = await fetch(`${apiUrl}/controlid/catracas/${catraca.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...corpoDaCatraca(formDaCatraca(catraca)),
          dsCatraca: (nomeDaPendente[catraca.id] ?? catraca.dsCatraca ?? '').trim(),
          idEmpresa: Number(idEmpresa),
          boInativo: 0,
        }),
      });
      if (!resposta.ok) await getApiError(resposta, 'Não foi possível ativar a catraca.');
      showToast('Catraca ativada. O acesso é sincronizado no próximo ciclo.', 'success');
      await carregar();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao ativar a catraca.', 'error');
    } finally {
      setAtivando(null);
    }
  }

  async function alternarStatus(catraca: Catraca) {
    setAtivando(catraca.id);
    try {
      const resposta = await fetch(`${apiUrl}/controlid/catracas/${catraca.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: catraca.boInativo ? 0 : 1 }),
      });
      if (!resposta.ok) await getApiError(resposta, 'Não foi possível alterar a situação.');
      showToast(catraca.boInativo ? 'Catraca ativada.' : 'Catraca inativada.', 'success');
      await carregar();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao alterar a situação.', 'error');
    } finally {
      setAtivando(null);
    }
  }

  function abrirCadastro(catraca?: Catraca) {
    setFeedback('');
    setEmEdicao(catraca ?? 'nova');
    setForm(catraca ? formDaCatraca(catraca) : FORM_VAZIO);
  }

  function fecharCadastro() {
    setEmEdicao(null);
    setForm(FORM_VAZIO);
    setFeedback('');
  }

  async function salvarCatraca() {
    if (!form.idEmpresa) {
      setFeedback('Escolha a empresa dona da catraca.');
      return;
    }
    const criando = emEdicao === 'nova';
    try {
      const resposta = await fetch(
        criando ? `${apiUrl}/controlid/catracas` : `${apiUrl}/controlid/catracas/${(emEdicao as Catraca).id}`,
        {
          method: criando ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpoDaCatraca(form)),
        },
      );
      if (!resposta.ok) {
        await getApiError(resposta, criando ? 'Não foi possível cadastrar.' : 'Não foi possível salvar.');
      }
      showToast(criando ? 'Catraca cadastrada.' : 'Catraca atualizada.', 'success');
      fecharCadastro();
      await carregar();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar a catraca.');
    }
  }

  async function vincular(nrUsuarioCatraca: string) {
    const idAluno = alunoEscolhido[nrUsuarioCatraca];
    if (!idAluno) {
      showToast('Escolha o aluno para vincular.', 'error');
      return;
    }
    setVinculando(nrUsuarioCatraca);
    try {
      const resposta = await fetch(`${apiUrl}/students/${idAluno}/usuario-catraca`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nrUsuarioCatraca: Number(nrUsuarioCatraca) }),
      });
      // A colisao (numero ja vinculado a outro aluno) volta 409 com mensagem
      // propria da API — getApiError a propaga em vez do texto generico.
      if (!resposta.ok) await getApiError(resposta, 'Não foi possível vincular.');
      showToast('Aluno vinculado. O acesso é sincronizado no próximo ciclo.', 'success');
      await carregar();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Erro ao vincular usuário da catraca.',
        'error',
      );
    } finally {
      setVinculando(null);
    }
  }

  async function desvincular(aluno: AlunoResumo) {
    setVinculando(String(aluno.nrUsuarioCatraca));
    try {
      const resposta = await fetch(`${apiUrl}/students/${aluno.id}/usuario-catraca`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nrUsuarioCatraca: null }),
      });
      if (!resposta.ok) await getApiError(resposta, 'Não foi possível desvincular.');
      showToast(`${aluno.nmAluno} desvinculado da catraca.`, 'success');
      await carregar();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao desvincular.', 'error');
    } finally {
      setVinculando(null);
    }
  }

  async function cadastrarDigital() {
    if (!cadastroCatraca || !cadastroAluno) {
      showToast('Escolha a catraca e o aluno.', 'error');
      return;
    }
    setIniciandoCadastro(true);
    try {
      const resposta = await fetch(`${apiUrl}/controlid/cadastro-digital`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idCatraca: Number(cadastroCatraca),
          idAluno: Number(cadastroAluno),
        }),
      });
      if (!resposta.ok) await getApiError(resposta, 'Não foi possível iniciar o cadastro.');
      setSessao((await resposta.json()) as SessaoCadastro);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Erro ao iniciar o cadastro de digital.',
        'error',
      );
    } finally {
      setIniciandoCadastro(false);
    }
  }

  async function cancelarCadastro() {
    if (!sessao) return;
    try {
      const resposta = await fetch(
        `${apiUrl}/controlid/cadastro-digital?idCatraca=${sessao.idCatraca}`,
        { method: 'DELETE' },
      );
      if (!resposta.ok) await getApiError(resposta, 'Não foi possível cancelar.');
      const dados = (await resposta.json()) as { sessao: SessaoCadastro | null };
      setSessao(dados.sessao);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao cancelar o cadastro.', 'error');
    }
  }

  return (
    <div className="catraca-monitor">
      <div className="catraca-monitor-header">
        <div>
          <h2>Catracas</h2>
          <p>
            O acesso é sincronizado com o equipamento a cada poucos minutos: aluno em dia entra,
            inadimplente é barrado pela própria catraca.
          </p>
        </div>
        <button type="button" onClick={() => void carregar()} disabled={carregando}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      {/* Primeiro passo de uma catraca nova: o endereco que alguem digita na
          tela de push do equipamento. O servidor monta porque digitar errado
          significa semanas sem evento chegando, sem nenhum sinal de erro. */}
      <section className="catraca-monitor-section">
        <h3>Endereço do equipamento</h3>
        <p className="catraca-monitor-ajuda">
          Na tela de push do equipamento, aponte o servidor para este endereço — sem barra no fim e
          sem <code>/push</code>: o próprio firmware completa o caminho. Assim que ele começar a
          falar, a catraca aparece sozinha aqui embaixo, aguardando ativação.
        </p>
        {enderecoParaCopiar ? (
          <div className="catraca-endereco">
            <code>{enderecoParaCopiar}</code>
            <button type="button" onClick={() => void copiarEndereco()}>
              {enderecoCopiado ? 'Copiado' : 'Copiar'}
            </button>
            {!endereco?.endereco ? (
              <span className="catraca-endereco-dica">
                Prefixe com o endereço público da sua API (defina API_PUBLIC_URL para o sistema
                montar sozinho).
              </span>
            ) : null}
          </div>
        ) : (
          <p className="catraca-monitor-vazio">
            Este cliente ainda não tem chave de dispositivo.
            {endereco?.enderecoLegado
              ? ` Enquanto isso vale o endereço compartilhado ${endereco.enderecoLegado}.`
              : ''}
          </p>
        )}
      </section>

      {/* Catracas que se auto-registraram e ainda nao pertencem a ninguem. Sem
          esta secao o equipamento novo ficava parado na listagem, inativo, e a
          reivindicacao so era possivel por chamada direta na API. */}
      <section className="catraca-monitor-section">
        <h3>Aguardando ativação</h3>
        <p className="catraca-monitor-ajuda">
          Equipamento que começou a falar com o sistema mas ainda não foi assumido por nenhuma
          unidade. Enquanto estiver aqui, ele não sincroniza acesso nenhum.
        </p>
        {/* Sem a lista de unidades nao ha o que escolher, e o botao de ativar
            so devolveria erro. Melhor dizer o motivo do que deixar o seletor
            vazio parecendo defeito. */}
        {pendentes.length > 0 && empresas.length === 0 ? (
          <p className="catraca-monitor-vazio">
            Nenhuma unidade disponível para vincular. É preciso acesso ao cadastro de empresas para
            ativar uma catraca.
          </p>
        ) : null}
        {pendentes.length === 0 ? (
          <p className="catraca-monitor-vazio">
            {carregando ? 'Carregando...' : 'Nenhuma catraca aguardando ativação.'}
          </p>
        ) : (
          <table className="catraca-monitor-tabela">
            <thead>
              <tr>
                <th>Série</th>
                <th>IP</th>
                <th>Último contato</th>
                <th>Nome</th>
                <th>Unidade</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pendentes.map((catraca) => (
                <tr key={catraca.id}>
                  <td>{catraca.caSerial || '—'}</td>
                  <td>{catraca.anIp || '—'}</td>
                  <td>{tempoDecorrido(catraca.nrSegundosSemContato)}</td>
                  <td>
                    <input
                      type="text"
                      maxLength={200}
                      placeholder="Ex.: Entrada principal"
                      value={nomeDaPendente[catraca.id] ?? catraca.dsCatraca ?? ''}
                      onChange={(evento) =>
                        setNomeDaPendente((atual) => ({
                          ...atual,
                          [catraca.id]: evento.target.value,
                        }))
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={empresaDaPendente[catraca.id] ?? ''}
                      onChange={(evento) =>
                        setEmpresaDaPendente((atual) => ({
                          ...atual,
                          [catraca.id]: evento.target.value,
                        }))
                      }
                    >
                      <option value="">Selecione...</option>
                      {empresas.map((empresa) => (
                        <option key={empresa.id} value={empresa.id}>
                          {empresa.dsEmpresa}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => void reivindicar(catraca)}
                      disabled={ativando === catraca.id}
                    >
                      <Power size={14} /> Ativar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="catraca-monitor-section">
        <div className="catraca-section-header">
          <h3>Equipamentos</h3>
          <button type="button" onClick={() => abrirCadastro()}>
            <Plus size={14} /> Cadastrar catraca
          </button>
        </div>
        {proprias.length === 0 ? (
          <p className="catraca-monitor-vazio">
            {carregando ? 'Carregando...' : 'Nenhuma catraca cadastrada.'}
          </p>
        ) : (
          <table className="catraca-monitor-tabela">
            <thead>
              <tr>
                <th>Situação</th>
                <th>Catraca</th>
                <th>Unidade</th>
                <th>Série</th>
                <th>IP</th>
                <th>Último contato</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {proprias.map((catraca) => (
                <tr key={catraca.id}>
                  <td>
                    <span
                      className={`catraca-status ${catraca.boOnline ? 'is-online' : 'is-offline'}`}
                    >
                      {catraca.boOnline ? 'Comunicando' : 'Sem contato'}
                    </span>
                    {catraca.boInativo ? <small> · inativa</small> : null}
                  </td>
                  <td>{catraca.dsCatraca || '—'}</td>
                  <td>
                    {empresas.find((empresa) => empresa.id === catraca.idEmpresa)?.dsEmpresa ?? '—'}
                  </td>
                  <td>{catraca.caSerial || '—'}</td>
                  <td>
                    {catraca.anIp || '—'}
                    {catraca.anIpPermitido ? <small> · restrita</small> : null}
                  </td>
                  <td>{tempoDecorrido(catraca.nrSegundosSemContato)}</td>
                  <td className="catraca-acoes">
                    <button type="button" onClick={() => abrirCadastro(catraca)}>
                      <Pencil size={14} /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void alternarStatus(catraca)}
                      disabled={ativando === catraca.id}
                    >
                      <Power size={14} /> {catraca.boInativo ? 'Ativar' : 'Inativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="catraca-monitor-section">
        <h3>Cadastrar digital</h3>
        <p className="catraca-monitor-ajuda">
          O comando sai daqui e a catraca executa: escolha o aluno, clique em cadastrar e peça para
          ele encostar o dedo no leitor. Não é preciso estar na rede do equipamento — quem precisa
          estar na frente dele é a pessoa.
        </p>

        {catracasDisponiveis.length === 0 ? (
          <p className="catraca-monitor-vazio">
            Nenhuma catraca ativa em contato com o sistema. O cadastro precisa de um equipamento
            comunicando agora.
          </p>
        ) : (
          <div className="catraca-cadastro-form">
            <select
              value={cadastroCatraca}
              onChange={(evento) => setCadastroCatraca(evento.target.value)}
              disabled={cadastroAtivo}
            >
              <option value="">Catraca...</option>
              {catracasDisponiveis.map((catraca) => (
                <option key={catraca.id} value={catraca.id}>
                  {catraca.dsCatraca || catraca.caSerial}
                </option>
              ))}
            </select>
            <select
              value={cadastroAluno}
              onChange={(evento) => setCadastroAluno(evento.target.value)}
              disabled={cadastroAtivo}
            >
              <option value="">Aluno...</option>
              {alunos.map((aluno) => (
                <option key={aluno.id} value={aluno.id}>
                  {aluno.nmAluno}
                  {aluno.nrUsuarioCatraca !== null ? ' (já tem digital)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void cadastrarDigital()}
              disabled={iniciandoCadastro || cadastroAtivo}
            >
              <Fingerprint size={14} /> Cadastrar digital
            </button>
          </div>
        )}

        {sessao ? (
          <div className={`catraca-cadastro-status is-${estadoDaEtapa(sessao.etapa)}`}>
            <strong>{tituloDaEtapa(sessao.etapa, sessao.nmAluno)}</strong>
            <p>{sessao.dsMensagem}</p>
            {sessao.nrUsuarioCatraca !== null ? (
              <small>
                Usuário {sessao.nrUsuarioCatraca} na catraca
                {sessao.boVerificacaoIndisponivel
                  ? ' · sem confirmação automática neste equipamento'
                  : ` · ${sessao.qtDigitaisAgora} digital(is) cadastrada(s)`}
              </small>
            ) : null}
            {cadastroAtivo ? (
              <button type="button" onClick={() => void cancelarCadastro()}>
                Cancelar
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="catraca-monitor-section">
        <h3>Vincular usuário da catraca a um aluno</h3>
        <p className="catraca-monitor-ajuda">
          Para digitais cadastradas direto no equipamento, sem passar pelo sistema: peça para a
          pessoa passar uma vez, o número aparece aqui e basta escolher de quem é. Sem vínculo, o
          acesso não é controlado pelo plano.
        </p>
        {naoVinculados.length === 0 ? (
          <p className="catraca-monitor-vazio">Nenhum usuário pendente de vínculo.</p>
        ) : (
          <table className="catraca-monitor-tabela">
            <thead>
              <tr>
                <th>Usuário na catraca</th>
                <th>Acessos</th>
                <th>Último acesso</th>
                <th>Aluno</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {naoVinculados
                .filter((usuario) => usuario.nrUsuarioCatraca !== USUARIO_NAO_IDENTIFICADO)
                .map((usuario) => (
                  <tr key={usuario.nrUsuarioCatraca}>
                    <td>{usuario.nrUsuarioCatraca}</td>
                    <td>{usuario.qtEventos}</td>
                    <td>{dataHora(usuario.dtUltimoEvento)}</td>
                    <td>
                      <select
                        value={alunoEscolhido[usuario.nrUsuarioCatraca] ?? ''}
                        onChange={(evento) =>
                          setAlunoEscolhido((atual) => ({
                            ...atual,
                            [usuario.nrUsuarioCatraca]: evento.target.value,
                          }))
                        }
                      >
                        <option value="">Selecione...</option>
                        {alunos
                          .filter((aluno) => aluno.nrUsuarioCatraca === null)
                          .map((aluno) => (
                            <option key={aluno.id} value={aluno.id}>
                              {aluno.nmAluno}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => void vincular(usuario.nrUsuarioCatraca)}
                        disabled={vinculando === usuario.nrUsuarioCatraca}
                      >
                        <Link2 size={14} /> Vincular
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {alunosVinculados.length > 0 ? (
          <>
            <h4>Já vinculados</h4>
            <table className="catraca-monitor-tabela">
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Usuário na catraca</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {alunosVinculados.map((aluno) => (
                  <tr key={aluno.id}>
                    <td>{aluno.nmAluno}</td>
                    <td>{aluno.nrUsuarioCatraca}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => void desvincular(aluno)}
                        disabled={vinculando === String(aluno.nrUsuarioCatraca)}
                      >
                        <Unlink size={14} /> Desvincular
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </section>

      <section className="catraca-monitor-section">
        <h3>Últimos acessos</h3>
        {eventos.length === 0 ? (
          <p className="catraca-monitor-vazio">Nenhum acesso registrado.</p>
        ) : (
          <table className="catraca-monitor-tabela">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>Resultado</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((evento) => (
                <tr key={evento.id}>
                  <td>{dataHora(evento.dtEvento)}</td>
                  <td>
                    {evento.aluno?.nmAluno ??
                      (evento.nrUsuarioCatraca && evento.nrUsuarioCatraca !== USUARIO_NAO_IDENTIFICADO
                        ? `Usuário ${evento.nrUsuarioCatraca} (sem vínculo)`
                        : 'Não identificado')}
                  </td>
                  <td>
                    <span
                      className={`catraca-status ${
                        evento.boAcessoLiberado ? 'is-online' : 'is-offline'
                      }`}
                    >
                      {evento.boAcessoLiberado ? 'Liberado' : 'Negado'}
                    </span>
                  </td>
                  <td>{evento.dsMotivo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {emEdicao ? (
        <RegistrationDrawer
          isOpen
          title={emEdicao === 'nova' ? 'Nova Catraca' : 'Editar Catraca'}
          onClose={fecharCadastro}
        >
          <form className="drawer-fields" onSubmit={envolver(salvarCatraca)}>
            {feedback ? <div className="form-feedback field-size-full">{feedback}</div> : null}

            <div className="field field-size-lg">
              <label htmlFor="catracaNome">Nome da catraca</label>
              <input
                id="catracaNome"
                maxLength={200}
                onChange={(evento) => setForm((atual) => ({ ...atual, dsCatraca: evento.target.value }))}
                placeholder="Ex.: Entrada principal"
                type="text"
                value={form.dsCatraca}
              />
            </div>

            <div className="field field-size-lg">
              <label htmlFor="catracaEmpresa">Unidade</label>
              <select
                id="catracaEmpresa"
                onChange={(evento) => setForm((atual) => ({ ...atual, idEmpresa: evento.target.value }))}
                required
                value={form.idEmpresa}
              >
                <option value="">Selecione...</option>
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.dsEmpresa}
                  </option>
                ))}
              </select>
            </div>

            <div className="field field-size-lg">
              <label htmlFor="catracaSerial">Número de série</label>
              <input
                id="catracaSerial"
                maxLength={200}
                onChange={(evento) => setForm((atual) => ({ ...atual, caSerial: evento.target.value }))}
                placeholder="Como aparece na tela do equipamento"
                type="text"
                value={form.caSerial}
              />
            </div>

            <div className="field field-size-sm">
              <label htmlFor="catracaFabricante">Fabricante</label>
              <input
                id="catracaFabricante"
                maxLength={200}
                onChange={(evento) =>
                  setForm((atual) => ({ ...atual, dsFabricante: evento.target.value }))
                }
                type="text"
                value={form.dsFabricante}
              />
            </div>

            <div className="field field-size-sm">
              <label htmlFor="catracaModelo">Modelo</label>
              <input
                id="catracaModelo"
                maxLength={200}
                onChange={(evento) => setForm((atual) => ({ ...atual, dsModelo: evento.target.value }))}
                type="text"
                value={form.dsModelo}
              />
            </div>

            <div className="field field-size-sm">
              <label htmlFor="catracaIpPermitido">IP permitido</label>
              <input
                id="catracaIpPermitido"
                maxLength={200}
                onChange={(evento) =>
                  setForm((atual) => ({ ...atual, anIpPermitido: evento.target.value }))
                }
                placeholder="Em branco: aceita de qualquer IP"
                type="text"
                value={form.anIpPermitido}
              />
            </div>

            <div className="field field-size-sm">
              <label htmlFor="catracaMac">MAC</label>
              <input
                id="catracaMac"
                maxLength={200}
                onChange={(evento) => setForm((atual) => ({ ...atual, anMac: evento.target.value }))}
                type="text"
                value={form.anMac}
              />
            </div>

            <div className="field field-size-full">
              <label htmlFor="catracaInativa">
                <input
                  checked={form.boInativo}
                  id="catracaInativa"
                  onChange={(evento) =>
                    setForm((atual) => ({ ...atual, boInativo: evento.target.checked }))
                  }
                  type="checkbox"
                />{' '}
                Catraca inativa (não sincroniza acesso)
              </label>
            </div>

            <div className="form-actions field-size-full">
              <button className="secondary-button" onClick={fecharCadastro} type="button">
                Cancelar
              </button>
              <button disabled={enviando} type="submit">
                <Save size={16} /> Salvar catraca
              </button>
            </div>
          </form>
        </RegistrationDrawer>
      ) : null}
    </div>
  );
}
