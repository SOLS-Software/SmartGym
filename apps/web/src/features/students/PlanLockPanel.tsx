'use client';

import { useEffect, useState } from 'react';
import { CalendarOff, PlayCircle } from 'lucide-react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useToast } from '../../shared/components/Toast';

/**
 * Trancar e destrancar a matrícula do aluno.
 *
 * TRANCAR NÃO É CANCELAR, e a tela precisa deixar isso óbvio — era exatamente
 * a confusão que o recurso veio resolver. Antes, pausar só era possível
 * encerrando a matrícula, e quem viajava dois meses entrava na estatística de
 * evasão junto com quem foi para o concorrente.
 *
 * Fica junto da aba Planos do aluno, e não como uma coluna a mais na grade, por
 * dois motivos: o ato precisa de dois campos (até quando, por quê) que não
 * cabem numa célula, e a diferença entre pausar e cancelar merece uma frase, não
 * um ícone.
 */

type Trancamento = {
  id: number;
  dtInicio: string;
  dtPrevisaoRetorno: string | null;
  dtRetorno: string | null;
  dsMotivo: string | null;
  vigente?: boolean;
};

type PlanoDoAluno = {
  id: number;
  dtEncerramento: string | null;
  plano?: { dsPlano?: string } | null;
  trancado?: boolean;
  trancamentoVigente?: Trancamento | null;
};

/** Data ISO (YYYY-MM-DD ou completa) em dd/mm/aaaa, sem cair no fuso. */
function formatar(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

export function PlanLockPanel({
  studentId,
  plano,
  onChange,
}: {
  studentId: number;
  plano: PlanoDoAluno;
  onChange: () => void;
}) {
  const { showToast } = useToast();
  const [historico, setHistorico] = useState<Trancamento[]>([]);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [dtInicio, setDtInicio] = useState(hojeIso());
  const [dtPrevisaoRetorno, setDtPrevisaoRetorno] = useState('');
  const [dsMotivo, setDsMotivo] = useState('');

  useEffect(() => {
    void carregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plano.id]);

  async function carregarHistorico() {
    try {
      const res = await fetch(`${apiUrl}/students/${studentId}/related/plans/${plano.id}/locks`);
      if (res.ok) {
        const body = (await res.json()) as { trancamentos: Trancamento[] };
        setHistorico(body.trancamentos ?? []);
      }
    } catch {
      // silencioso: o histórico é contexto, não bloqueia trancar
    }
  }

  const encerrada = Boolean(plano.dtEncerramento && new Date(plano.dtEncerramento) <= new Date());
  const trancado = Boolean(plano.trancado);
  const pausa = plano.trancamentoVigente ?? null;

  async function trancar() {
    if (dtPrevisaoRetorno && dtPrevisaoRetorno <= dtInicio) {
      showToast('A previsão de retorno deve ser depois do início.', 'error');
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch(`${apiUrl}/students/${studentId}/related/plans/${plano.id}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dtInicio,
          dtPrevisaoRetorno: dtPrevisaoRetorno || null,
          dsMotivo: dsMotivo.trim() || null,
        }),
      });
      if (!res.ok) {
        await getApiError(res, 'Não foi possível trancar a matrícula.');
        return;
      }
      const body = (await res.json()) as { parcelasSuspensas: number };
      showToast(
        body.parcelasSuspensas > 0
          ? `Matrícula trancada. ${body.parcelasSuspensas} parcela(s) do período foram suspensas.`
          : 'Matrícula trancada.',
        'success',
      );
      setAberto(false);
      setDsMotivo('');
      setDtPrevisaoRetorno('');
      await carregarHistorico();
      onChange();
    } catch (erro) {
      showToast(erro instanceof Error ? erro.message : 'Erro ao trancar.', 'error');
    } finally {
      setSalvando(false);
    }
  }

  async function destrancar() {
    setSalvando(true);
    try {
      const res = await fetch(`${apiUrl}/students/${studentId}/related/plans/${plano.id}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dtRetorno: hojeIso() }),
      });
      if (!res.ok) {
        await getApiError(res, 'Não foi possível registrar o retorno.');
        return;
      }
      const body = (await res.json()) as { parcelaGerada: { dtVencimento: string } | null };
      showToast(
        body.parcelaGerada
          ? `Retorno registrado. Nova cobrança para ${formatar(body.parcelaGerada.dtVencimento)}.`
          : 'Retorno registrado.',
        'success',
      );
      await carregarHistorico();
      onChange();
    } catch (erro) {
      showToast(erro instanceof Error ? erro.message : 'Erro ao destrancar.', 'error');
    } finally {
      setSalvando(false);
    }
  }

  if (encerrada) {
    return (
      <div className="lock-panel">
        <p className="lock-panel-nota">
          Matrícula encerrada em {formatar(plano.dtEncerramento)} — não é possível trancar. Trancar
          serve para pausar um contrato que continua valendo.
        </p>
      </div>
    );
  }

  return (
    <div className="lock-panel">
      <div className="lock-panel-topo">
        <div>
          <span className={`lock-badge ${trancado ? 'trancado' : 'ativo'}`}>
            {trancado ? 'Trancada' : 'Ativa'}
          </span>
          <strong className="lock-panel-plano">{plano.plano?.dsPlano ?? 'Matrícula'}</strong>
        </div>
        {trancado ? (
          <button className="btn-primary" disabled={salvando} onClick={destrancar} type="button">
            <PlayCircle size={16} /> Registrar retorno
          </button>
        ) : (
          <button
            className="btn-secondary"
            disabled={salvando}
            onClick={() => setAberto((v) => !v)}
            type="button"
          >
            <CalendarOff size={16} /> Trancar matrícula
          </button>
        )}
      </div>

      {trancado && pausa ? (
        <p className="lock-panel-nota">
          Trancada desde {formatar(pausa.dtInicio)}
          {pausa.dtPrevisaoRetorno ? `, com retorno previsto para ${formatar(pausa.dtPrevisaoRetorno)}` : ', sem prazo definido'}
          {pausa.dsMotivo ? ` · ${pausa.dsMotivo}` : ''}. O aluno não passa na catraca e as
          cobranças do período estão suspensas — mas a matrícula continua valendo e não conta como
          cancelamento.
        </p>
      ) : null}

      {aberto && !trancado ? (
        <div className="lock-panel-form">
          {/* A frase existe porque a confusão entre pausar e cancelar é o
              problema que este recurso veio resolver. */}
          <p className="lock-panel-nota">
            Trancar <strong>não cancela</strong>: o contrato continua valendo, o aluno não entra na
            estatística de evasão e volta com a mesma matrícula. Para encerrar de vez, use o
            cancelamento.
          </p>
          <div className="lock-panel-campos">
            <label>
              <span>Início</span>
              <input onChange={(e) => setDtInicio(e.target.value)} type="date" value={dtInicio} />
            </label>
            <label>
              <span>Retorno previsto</span>
              <input
                onChange={(e) => setDtPrevisaoRetorno(e.target.value)}
                type="date"
                value={dtPrevisaoRetorno}
              />
            </label>
            <label className="lock-panel-motivo">
              <span>Motivo (opcional)</span>
              <input
                maxLength={255}
                onChange={(e) => setDsMotivo(e.target.value)}
                placeholder="Viagem, lesão, licença..."
                type="text"
                value={dsMotivo}
              />
            </label>
          </div>
          {/* Sem previsão a pausa não acaba sozinha — e quem opera precisa saber
              disso ANTES de salvar, não quando o aluno reclamar na recepção. */}
          <p className="lock-panel-aviso">
            {dtPrevisaoRetorno
              ? `A matrícula volta a valer sozinha em ${formatar(dtPrevisaoRetorno)}.`
              : 'Sem retorno previsto, a matrícula fica trancada até alguém registrar a volta.'}
          </p>
          <div className="lock-panel-acoes">
            <button className="btn-secondary" onClick={() => setAberto(false)} type="button">
              Cancelar
            </button>
            <button className="btn-primary" disabled={salvando} onClick={trancar} type="button">
              Confirmar trancamento
            </button>
          </div>
        </div>
      ) : null}

      {historico.length > 0 ? (
        <details className="lock-panel-historico">
          <summary>Histórico de trancamentos ({historico.length})</summary>
          <ul>
            {historico.map((t) => (
              <li key={t.id}>
                <span>
                  {formatar(t.dtInicio)} →{' '}
                  {t.dtRetorno
                    ? formatar(t.dtRetorno)
                    : t.dtPrevisaoRetorno
                      ? `${formatar(t.dtPrevisaoRetorno)} (previsto)`
                      : 'em aberto'}
                </span>
                {t.dsMotivo ? <em>{t.dsMotivo}</em> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
