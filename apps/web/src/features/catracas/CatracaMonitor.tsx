'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, RefreshCw, Unlink } from 'lucide-react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useToast } from '../../shared/components/Toast';

type Catraca = {
  id: number;
  dsCatraca: string;
  dsModelo: string;
  caSerial: string;
  anIp: string;
  anIpPermitido: string;
  idEmpresa: number | null;
  boInativo: boolean;
  dtUltimoPush: string | null;
  boOnline: boolean;
  nrSegundosSemContato: number | null;
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

// A catraca reporta "0" quando NAO identificou ninguem — nao e um usuario.
const USUARIO_NAO_IDENTIFICADO = '0';

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

export function CatracaMonitor() {
  const { showToast } = useToast();

  const [catracas, setCatracas] = useState<Catraca[]>([]);
  const [eventos, setEventos] = useState<CatracaEvento[]>([]);
  const [naoVinculados, setNaoVinculados] = useState<UsuarioNaoVinculado[]>([]);
  const [alunos, setAlunos] = useState<AlunoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [alunoEscolhido, setAlunoEscolhido] = useState<Record<string, string>>({});

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

      <section className="catraca-monitor-section">
        <h3>Equipamentos</h3>
        {catracas.length === 0 ? (
          <p className="catraca-monitor-vazio">
            {carregando ? 'Carregando...' : 'Nenhuma catraca cadastrada.'}
          </p>
        ) : (
          <table className="catraca-monitor-tabela">
            <thead>
              <tr>
                <th>Situação</th>
                <th>Catraca</th>
                <th>Série</th>
                <th>IP</th>
                <th>Último contato</th>
              </tr>
            </thead>
            <tbody>
              {catracas.map((catraca) => (
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
                  <td>{catraca.caSerial || '—'}</td>
                  <td>
                    {catraca.anIp || '—'}
                    {catraca.anIpPermitido ? <small> · restrita</small> : null}
                  </td>
                  <td>{tempoDecorrido(catraca.nrSegundosSemContato)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="catraca-monitor-section">
        <h3>Vincular usuário da catraca a um aluno</h3>
        <p className="catraca-monitor-ajuda">
          Cadastre a digital no equipamento e peça para a pessoa passar uma vez. O número aparece
          aqui e basta escolher de quem é. Sem vínculo, o acesso não é controlado pelo plano.
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
    </div>
  );
}
