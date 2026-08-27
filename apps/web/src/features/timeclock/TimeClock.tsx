'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, LogIn, LogOut } from 'lucide-react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useToast } from '../../shared/components/Toast';

// Registro de ponto.
//
// A tela tem dois públicos e por isso duas metades. A de cima é do próprio
// funcionário e aparece para qualquer um — bater ponto não depende de perfil.
// A de baixo é o espelho da equipe e só carrega para quem tem permissão de RH;
// falha em silêncio, do mesmo jeito que a fila da recepção, para que quem só
// bate o próprio ponto não veja mensagem de erro sobre uma tela que não é dele.
//
// NÃO HÁ ATRASO, HORA EXTRA NEM FALTA aqui: julgar exige escala prevista e
// tolerância, que são regras do contrato de cada academia. A tela mostra o que
// foi batido e quanto deu.

type Punch = {
  id: number;
  cnTipo: 'entrada' | 'saida';
  dtRegistro: string;
  boManual: boolean;
  dsObservacao: string | null;
};

type PunchPair = {
  entrada: Punch | null;
  saida: Punch | null;
  minutos: number;
};

type DaySheet = {
  dia: string;
  batidas: Punch[];
  pares: PunchPair[];
  minutos: number;
  aberto: boolean;
  inconsistente: boolean;
};

type MySheet = {
  proximaBatida: 'entrada' | 'saida';
  ultimaBatida: Punch | null;
  totalMinutos: number;
  totalFormatado: string;
  diasTrabalhados: number;
  dias: DaySheet[];
};

type TeamMember = {
  idFuncionario: number;
  nmFuncionario: string;
  totalMinutos: number;
  totalFormatado: string;
  diasTrabalhados: number;
  diasInconsistentes: number;
  dias: DaySheet[];
};

type Employee = { id: number; nmFuncionario: string; boInativo: boolean };

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** "25/08, seg" a partir de YYYY-MM-DD, sem passar por UTC. */
function diaLabel(dia: string) {
  const [ano, mes, d] = dia.split('-').map(Number);
  const date = new Date(ano ?? 0, (mes ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'short' });
}

function formatMinutes(minutos: number) {
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}`;
}

/** Primeiro e último dia do mês corrente, em ISO curto. */
function currentMonth() {
  const hoje = new Date();
  const iso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    from: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    to: iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
  };
}

export function TimeClock() {
  const { showToast } = useToast();

  const [mine, setMine] = useState<MySheet | null>(null);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isPunching, setIsPunching] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');

  const [fixEmployee, setFixEmployee] = useState('');
  const [fixType, setFixType] = useState<'entrada' | 'saida'>('entrada');
  const [fixWhen, setFixWhen] = useState('');
  const [fixNote, setFixNote] = useState('');
  const [isFixing, setIsFixing] = useState(false);

  const range = useMemo(currentMonth, []);

  async function loadMine() {
    try {
      const response = await fetch(`${apiUrl}/time-clock/me?from=${range.from}&to=${range.to}`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar seu espelho.');
      setMine((await response.json()) as MySheet);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar o espelho.');
    }
  }

  // Espelho da equipe e lista de funcionários: silenciosos de propósito — quem
  // não tem permissão de RH continua com a metade de cima funcionando.
  async function loadTeam() {
    try {
      const [teamResponse, employeesResponse] = await Promise.all([
        fetch(`${apiUrl}/time-clock?from=${range.from}&to=${range.to}`),
        fetch(`${apiUrl}/employees`),
      ]);
      if (teamResponse.ok) {
        const data = (await teamResponse.json()) as { funcionarios: TeamMember[] };
        setTeam(data.funcionarios);
      }
      if (employeesResponse.ok) {
        const data = (await employeesResponse.json()) as Employee[];
        setEmployees(data.filter((employee) => employee.boInativo === false));
      }
    } catch {
      // silencioso de propósito — ver comentário acima
    }
  }

  useEffect(() => {
    void loadMine();
    void loadTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePunch() {
    try {
      setIsPunching(true);
      const response = await fetch(`${apiUrl}/time-clock/me`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível registrar o ponto.');

      const data = (await response.json()) as { cnTipo: string; repetida: boolean };
      // O servidor decide entrada ou saída; a tela só conta o que aconteceu.
      showToast(
        data.repetida
          ? 'Esta batida já tinha sido registrada agora há pouco.'
          : data.cnTipo === 'entrada'
            ? 'Entrada registrada.'
            : 'Saída registrada.',
      );
      await loadMine();
      await loadTeam();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao registrar o ponto.');
    } finally {
      setIsPunching(false);
    }
  }

  async function handleFix(event: React.FormEvent) {
    event.preventDefault();
    if (!fixEmployee || !fixWhen || fixNote.trim().length < 3) {
      setFeedback('Escolha o profissional, a data/hora e escreva a justificativa.');
      return;
    }
    try {
      setIsFixing(true);
      const response = await fetch(`${apiUrl}/time-clock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idFuncionario: fixEmployee,
          cnTipo: fixType,
          dtRegistro: fixWhen,
          dsObservacao: fixNote.trim(),
        }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível lançar a correção.');

      setFixWhen('');
      setFixNote('');
      await loadTeam();
      await loadMine();
      showToast('Correção lançada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao lançar a correção.');
    } finally {
      setIsFixing(false);
    }
  }

  function renderDays(dias: DaySheet[]) {
    return (
      <ul className="timeclock-days">
        {dias.map((dia) => (
          <li className={dia.inconsistente ? 'inconsistente' : ''} key={dia.dia}>
            <span className="timeclock-day-label">{diaLabel(dia.dia)}</span>
            <span className="timeclock-day-punches">
              {dia.pares.map((par, indice) => (
                <span className="timeclock-pair" key={indice}>
                  {par.entrada ? hora(par.entrada.dtRegistro) : '--:--'}
                  {' → '}
                  {par.saida ? hora(par.saida.dtRegistro) : '--:--'}
                  {(par.entrada?.boManual || par.saida?.boManual) ? (
                    /* Batida lançada por outra pessoa fica marcada: o espelho
                       nunca confunde o que a pessoa bateu com o que alguém
                       lançou por ela. */
                    <em title="lançamento manual"> ✎</em>
                  ) : null}
                </span>
              ))}
            </span>
            <span className="timeclock-day-total">
              {dia.aberto && dia.minutos === 0 ? 'em curso' : formatMinutes(dia.minutos)}
              {dia.inconsistente ? (
                <AlertTriangle aria-label="batida faltando" size={13} />
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">RH</p>
        <h2 className="module-page-title">PONTO</h2>
      </header>

      <div className="form-view timeclock">
        {feedback ? <div className="form-feedback">{feedback}</div> : null}

        <section className="timeclock-punch" aria-label="Registrar meu ponto">
          <div className="timeclock-punch-info">
            <Clock aria-hidden="true" size={22} />
            <div>
              <strong>
                {mine?.ultimaBatida
                  ? `Última batida: ${mine.ultimaBatida.cnTipo === 'entrada' ? 'entrada' : 'saída'} às ${hora(mine.ultimaBatida.dtRegistro)}`
                  : 'Nenhuma batida hoje'}
              </strong>
              <span>
                {mine ? `${mine.totalFormatado} no mês · ${mine.diasTrabalhados} dia(s)` : '—'}
              </span>
            </div>
          </div>

          <button
            className={`timeclock-button ${mine?.proximaBatida ?? 'entrada'}`}
            disabled={isPunching || !mine}
            onClick={() => void handlePunch()}
            type="button"
          >
            {mine?.proximaBatida === 'saida' ? (
              <LogOut aria-hidden="true" size={18} />
            ) : (
              <LogIn aria-hidden="true" size={18} />
            )}
            {isPunching
              ? 'Registrando...'
              : mine?.proximaBatida === 'saida'
                ? 'Registrar saída'
                : 'Registrar entrada'}
          </button>
        </section>

        <section className="timeclock-mine" aria-label="Meu espelho do mês">
          <p className="section-label">Meu espelho deste mês</p>
          {!mine || mine.dias.length === 0 ? (
            <p className="timeclock-empty">Nenhuma batida registrada neste mês.</p>
          ) : (
            renderDays(mine.dias)
          )}
        </section>

        {team ? (
          <section className="timeclock-team" aria-label="Espelho da equipe">
            <p className="section-label">Espelho da equipe</p>

            {team.length === 0 ? (
              <p className="timeclock-empty">Ninguém bateu ponto neste mês.</p>
            ) : (
              <ul className="timeclock-team-list">
                {team.map((member) => (
                  <li key={member.idFuncionario}>
                    <button
                      className="timeclock-team-head"
                      onClick={() =>
                        setExpanded(expanded === member.idFuncionario ? null : member.idFuncionario)
                      }
                      type="button"
                    >
                      <span className="timeclock-team-name">{member.nmFuncionario}</span>
                      <span className="timeclock-team-total">{member.totalFormatado}</span>
                      <span className="timeclock-team-days">
                        {member.diasTrabalhados} dia(s)
                        {member.diasInconsistentes > 0 ? (
                          <em className="timeclock-warn">
                            <AlertTriangle aria-hidden="true" size={12} />
                            {member.diasInconsistentes} a corrigir
                          </em>
                        ) : null}
                      </span>
                    </button>
                    {expanded === member.idFuncionario ? renderDays(member.dias) : null}
                  </li>
                ))}
              </ul>
            )}

            <form className="timeclock-fix" onSubmit={handleFix}>
              <p className="section-label">Corrigir batida esquecida</p>
              <div className="timeclock-fix-grid">
                <label>
                  <span>Profissional</span>
                  <select
                    onChange={(event) => setFixEmployee(event.target.value)}
                    value={fixEmployee}
                  >
                    <option value="">Selecione</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={String(employee.id)}>
                        {employee.nmFuncionario}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Tipo</span>
                  <select
                    onChange={(event) => setFixType(event.target.value as 'entrada' | 'saida')}
                    value={fixType}
                  >
                    <option value="entrada">Entrada</option>
                    <option value="saida">Saída</option>
                  </select>
                </label>
                <label>
                  <span>Data e hora</span>
                  <input
                    onChange={(event) => setFixWhen(event.target.value)}
                    type="datetime-local"
                    value={fixWhen}
                  />
                </label>
                <label className="timeclock-fix-wide">
                  <span>Justificativa</span>
                  <input
                    onChange={(event) => setFixNote(event.target.value)}
                    placeholder="Esqueceu de bater a saída"
                    type="text"
                    value={fixNote}
                  />
                </label>
              </div>
              <button disabled={isFixing} type="submit">
                {isFixing ? 'Lançando...' : 'Lançar correção'}
              </button>
              {/* A justificativa é obrigatória no servidor também: uma batida
                  lançada por outra pessoa sem motivo é indistinguível de
                  adulteração do espelho. */}
              <p className="timeclock-fix-note">
                A correção fica marcada como lançamento manual e guarda quem a fez.
              </p>
            </form>
          </section>
        ) : null}
      </div>
    </>
  );
}
