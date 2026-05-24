'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle, Clock, Users, XCircle } from 'lucide-react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import type { AgendaSession, EnrolledStudent } from '../../shared/registration/registrationTypes';

type AgendaViewProps = {
  userType: 'employee' | 'student';
  studentId: number | null;
  studentName: string;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(value: string | null | undefined) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isSameDay(a: string, b: string) {
  return formatDate(a) === formatDate(b);
}

function groupSessionsByDate(sessions: AgendaSession[]) {
  const groups: Record<string, AgendaSession[]> = {};
  for (const session of sessions) {
    const key = formatDate(session.dtInicial);
    if (!groups[key]) groups[key] = [];
    groups[key]!.push(session);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

export function AgendaView({ userType, studentId, studentName }: AgendaViewProps) {
  const [sessions, setSessions] = useState<AgendaSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  // Employee view state
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [presenceSubmitting, setPresenceSubmitting] = useState<number | null>(null);

  // Filters (employee only)
  const [filterDate, setFilterDate] = useState('');

  useEffect(() => {
    void loadSessions();
  }, []);

  async function loadSessions() {
    try {
      setIsLoading(true);
      setFeedback('');
      const params = new URLSearchParams();
      if (filterDate) params.set('dtInicial', filterDate);
      const response = await fetch(`${apiUrl}/agenda-sessions?${params.toString()}`);
      if (!response.ok) await getApiError(response, 'Erro ao carregar agendas.');
      const data = (await response.json()) as AgendaSession[];
      setSessions(data.filter((s) => s.boInativo === 0));
      setSelectedSessionId(null);
      setEnrolledStudents([]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar agendas.');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadEnrolledStudents(sessionId: number) {
    try {
      setIsLoadingStudents(true);
      const response = await fetch(`${apiUrl}/agenda-sessions/${sessionId}/enrolled-students`);
      if (!response.ok) await getApiError(response, 'Erro ao carregar alunos.');
      setEnrolledStudents((await response.json()) as EnrolledStudent[]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar alunos inscritos.');
    } finally {
      setIsLoadingStudents(false);
    }
  }

  function handleSelectSession(session: AgendaSession) {
    if (userType !== 'employee') return;
    setSelectedSessionId(session.id);
    setEnrolledStudents([]);
    void loadEnrolledStudents(session.id);
  }

  async function handleEnroll(sessionId: number) {
    if (!studentId) return;
    try {
      setSubmittingId(sessionId);
      setFeedback('');
      const response = await fetch(`${apiUrl}/agenda-sessions/${sessionId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idAluno: studentId }),
      });
      if (!response.ok) await getApiError(response, 'Erro ao realizar inscrição.');
      setFeedback('Inscrição realizada com sucesso.');
      await loadSessions();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao realizar inscrição.');
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleUnenroll(sessionId: number) {
    if (!studentId) return;
    try {
      setSubmittingId(sessionId);
      setFeedback('');
      const response = await fetch(`${apiUrl}/agenda-sessions/${sessionId}/unenroll`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idAluno: studentId }),
      });
      if (!response.ok) await getApiError(response, 'Erro ao cancelar inscrição.');
      setFeedback('Inscrição cancelada com sucesso.');
      await loadSessions();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao cancelar inscrição.');
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleMarkPresence(sessionId: number, studentEnrollId: number, idAluno: number) {
    try {
      setPresenceSubmitting(studentEnrollId);
      setFeedback('');
      const response = await fetch(`${apiUrl}/agenda-sessions/${sessionId}/students/${idAluno}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) await getApiError(response, 'Erro ao registrar presença.');
      await loadEnrolledStudents(sessionId);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao registrar presença.');
    } finally {
      setPresenceSubmitting(null);
    }
  }

  async function handleToggleStatus(sessionId: number, boInativo: number) {
    try {
      setFeedback('');
      const response = await fetch(`${apiUrl}/agenda-sessions/${sessionId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo }),
      });
      if (!response.ok) await getApiError(response, 'Erro ao alterar status.');
      await loadSessions();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;
  const grouped = groupSessionsByDate(sessions);

  if (userType === 'student') {
    return (
      <div className="form-view agenda-view">
        <div className="form-heading">
          <p className="section-label">Agendas</p>
          <h2>Olá, {studentName}</h2>
          <p>Inscreva-se nas aulas disponíveis.</p>
        </div>

        {feedback ? <div className={`form-feedback ${feedback.toLowerCase().includes('sucesso') ? 'success' : ''}`}>{feedback}</div> : null}

        {isLoading ? <div className="form-hint">Carregando agendas...</div> : null}

        {!isLoading && sessions.length === 0 ? (
          <div className="form-hint">Nenhuma agenda ativa encontrada.</div>
        ) : null}

        <div className="agenda-session-list">
          {grouped.map(([date, daySessions]) => (
            <div className="agenda-day-group" key={date}>
              <div className="agenda-day-header">
                <CalendarDays size={14} />
                <span>{date}</span>
              </div>
              <div className="agenda-day-sessions">
                {daySessions.map((session) => {
                  const isEnrolled = studentId !== null && session.alunoIds.includes(studentId);
                  const isFull = session.qtAlunos !== null && session.qtInscritos >= session.qtAlunos;
                  const isWorking = submittingId === session.id;

                  return (
                    <div className={`agenda-session-card ${isEnrolled ? 'enrolled' : ''} ${isFull && !isEnrolled ? 'full' : ''}`} key={session.id}>
                      <div className="agenda-session-card-header">
                        <div>
                          <strong className="agenda-session-activity">{session.dsAtividade ?? '-'}</strong>
                          {session.dsCategoria ? <span className="agenda-session-category">{session.dsCategoria}</span> : null}
                        </div>
                        <div className="agenda-session-capacity">
                          <Users size={13} />
                          <span>
                            {session.qtAlunos !== null
                              ? `${session.qtInscritos}/${session.qtAlunos}`
                              : `${session.qtInscritos} inscritos`}
                          </span>
                        </div>
                      </div>

                      <div className="agenda-session-meta">
                        <span>
                          <Clock size={12} />
                          {formatTime(session.dtInicial)} — {formatTime(session.dtFinal)}
                        </span>
                        {session.profissionais.length > 0 ? (
                          <span>{session.profissionais.map((p) => p.nome).join(', ')}</span>
                        ) : null}
                        {session.dsEmpresa ? <span>{session.dsEmpresa}</span> : null}
                      </div>

                      <div className="agenda-session-actions">
                        {isEnrolled ? (
                          <>
                            <span className="agenda-enrolled-badge">
                              <CheckCircle size={13} /> Inscrito
                            </span>
                            <button
                              className="ghost-button danger"
                              disabled={isWorking}
                              onClick={() => void handleUnenroll(session.id)}
                              type="button"
                            >
                              {isWorking ? 'Cancelando...' : 'Cancelar inscrição'}
                            </button>
                          </>
                        ) : isFull ? (
                          <span className="agenda-full-badge">
                            <XCircle size={13} /> Lotado
                          </span>
                        ) : (
                          <button
                            className="new-button"
                            disabled={isWorking}
                            onClick={() => void handleEnroll(session.id)}
                            type="button"
                          >
                            {isWorking ? 'Inscrevendo...' : 'Inscrever-se'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Employee view
  return (
    <div className="form-view agenda-view">
      <div className="form-heading">
        <p className="section-label">Gestão de Agendas</p>
        <h2>Agendas</h2>
      </div>

      {feedback ? <div className={`form-feedback ${feedback.toLowerCase().includes('sucesso') ? 'success' : ''}`}>{feedback}</div> : null}

      <div className="agenda-employee-layout">
        <div className="agenda-sessions-panel">
          <div className="agenda-filter-bar">
            <label className="field">
              <span>Filtrar por data</span>
              <input
                onChange={(e) => setFilterDate(e.target.value)}
                type="date"
                value={filterDate}
              />
            </label>
            <button className="new-button" onClick={() => void loadSessions()} type="button">
              Buscar
            </button>
          </div>

          {isLoading ? <div className="form-hint">Carregando agendas...</div> : null}
          {!isLoading && sessions.length === 0 ? <div className="form-hint">Nenhuma agenda encontrada.</div> : null}

          <div className="agenda-session-list">
            {grouped.map(([date, daySessions]) => (
              <div className="agenda-day-group" key={date}>
                <div className="agenda-day-header">
                  <CalendarDays size={14} />
                  <span>{date}</span>
                </div>
                <div className="agenda-day-sessions">
                  {daySessions.map((session) => (
                    <button
                      className={`agenda-session-card employee-card ${selectedSessionId === session.id ? 'selected' : ''}`}
                      key={session.id}
                      onClick={() => handleSelectSession(session)}
                      type="button"
                    >
                      <div className="agenda-session-card-header">
                        <strong className="agenda-session-activity">{session.dsAtividade ?? '-'}</strong>
                        <div className="agenda-session-capacity">
                          <Users size={13} />
                          <span>
                            {session.qtAlunos !== null
                              ? `${session.qtInscritos}/${session.qtAlunos}`
                              : `${session.qtInscritos} inscritos`}
                          </span>
                        </div>
                      </div>
                      <div className="agenda-session-meta">
                        <span>
                          <Clock size={12} />
                          {formatTime(session.dtInicial)} — {formatTime(session.dtFinal)}
                        </span>
                        {session.profissionais.length > 0 ? (
                          <span>{session.profissionais.map((p) => p.nome).join(', ')}</span>
                        ) : null}
                      </div>
                      {session.dsCategoria ? (
                        <div className="agenda-session-category">{session.dsCategoria}</div>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedSession ? (
          <div className="agenda-detail-panel">
            <div className="agenda-detail-header">
              <div>
                <p className="section-label">Sessão selecionada</p>
                <h3>{selectedSession.dsAtividade ?? '-'}</h3>
                <p className="agenda-detail-meta">
                  {formatDateTime(selectedSession.dtInicial)} — {formatTime(selectedSession.dtFinal)}
                  {selectedSession.dsCategoria ? ` · ${selectedSession.dsCategoria}` : ''}
                  {selectedSession.dsEmpresa ? ` · ${selectedSession.dsEmpresa}` : ''}
                </p>
              </div>
              <button
                className={`ghost-button ${selectedSession.boInativo ? 'success' : 'danger'}`}
                onClick={() => void handleToggleStatus(selectedSession.id, selectedSession.boInativo ? 0 : 1)}
                type="button"
              >
                {selectedSession.boInativo ? 'Ativar' : 'Suspender'}
              </button>
            </div>

            <div className="agenda-detail-students">
              <p className="section-label">Alunos inscritos</p>
              {isLoadingStudents ? <div className="form-hint">Carregando alunos...</div> : null}
              {!isLoadingStudents && enrolledStudents.length === 0 ? (
                <div className="form-hint">Nenhum aluno inscrito.</div>
              ) : null}
              {enrolledStudents.map((student) => (
                <div className={`agenda-student-row ${student.presente ? 'present' : ''}`} key={student.id}>
                  <div className="agenda-student-info">
                    <strong>{student.nmAluno}</strong>
                    <span>{student.caCPF || '-'}</span>
                  </div>
                  {student.presente ? (
                    <span className="agenda-enrolled-badge">
                      <CheckCircle size={13} /> Presente
                    </span>
                  ) : (
                    <button
                      className="new-button sm"
                      disabled={presenceSubmitting === student.id}
                      onClick={() => void handleMarkPresence(selectedSession.id, student.id, student.idAluno)}
                      type="button"
                    >
                      {presenceSubmitting === student.id ? 'Registrando...' : 'Marcar presença'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="agenda-detail-panel empty">
            <p className="form-hint">Selecione uma agenda para ver os alunos inscritos e registrar presenças.</p>
          </div>
        )}
      </div>
    </div>
  );
}
