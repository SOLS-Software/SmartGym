'use client';

import { useEffect, useMemo, useState } from 'react';
import { Mail, Search, UserCheck } from 'lucide-react';
import type { Company } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useToast } from '../../shared/components/Toast';

type Student = { id: number; nmAluno: string; boInativo: boolean };

type CheckIn = {
  id: number;
  idAluno: number;
  dtCadastro: string;
  aluno: { id: number; nmAluno: string } | null;
  tipoCheckIn: { id: number; dsTipoCheckIn: string } | null;
  atividadeAgenda: { id: number; atividade: { dsAtividade: string } | null } | null;
};

type Movement = {
  dia: string;
  total: number;
  alunosDistintos: number;
  checkIns: CheckIn[];
};

type StudentAccess = {
  canAccess: boolean;
  reason: string | null;
  hasPlan: boolean;
  planActive: boolean;
  paymentOverdue: boolean;
  /** O plano não cobre a filial perguntada. */
  unidadeNaoCoberta?: boolean;
  /** Limite de entradas do plano. Avisa, não bloqueia. */
  frequencia?: { limite: number | null; usadas: number; excedeu: boolean; aviso: string | null };
};

type PlanRequest = {
  id: number;
  cnTipo: 'cancelamento' | 'renovacao' | 'troca';
  cnStatus: 'pendente' | 'aprovada' | 'recusada';
  dsObservacao: string | null;
  dtCadastro: string;
  motivoCancelamento: { id: number; dsMotivoCancelamento: string } | null;
  aluno: { id: number; nmAluno: string } | null;
  planoDesejado: { id: number; dsPlano: string } | null;
  alunoPlano: {
    id: number;
    aluno: { id: number; nmAluno: string } | null;
    plano: { id: number; dsPlano: string } | null;
  } | null;
};

/** O que a aprovação vai FAZER, dito antes do clique. */
const REQUEST_LABEL: Record<PlanRequest['cnTipo'], { pedido: string; acao: string }> = {
  cancelamento: { pedido: 'quer cancelar', acao: 'Aprovar e encerrar' },
  renovacao: { pedido: 'quer renovar', acao: 'Aprovar e renovar' },
  troca: { pedido: 'quer trocar de plano', acao: 'Aprovar e matricular' },
};

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** De onde veio a entrada, para a recepção saber o que aconteceu sem abrir nada. */
function describeOrigin(checkIn: CheckIn) {
  if (checkIn.atividadeAgenda) {
    return `Aula: ${checkIn.atividadeAgenda.atividade?.dsAtividade ?? 'atividade'}`;
  }
  return checkIn.tipoCheckIn?.dsTipoCheckIn ?? 'Entrada';
}

type Benefit = {
  idPlanoBeneficio: number;
  descricao: string;
  cnTipo: string;
  limite: number;
  usadas: number;
  restantes: number;
  podeUsar: boolean;
  /** "por matrícula", "neste mês", "neste ano" */
  janela: string;
};

export function ReceptionDesk() {
  const { showToast } = useToast();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [movement, setMovement] = useState<Movement | null>(null);

  const [term, setTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  // Direitos da matrícula (camiseta da assinatura, avaliação do mês) com o
  // saldo. É aqui que a entrega acontece — o aluno não marca "peguei".
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [deliveringId, setDeliveringId] = useState<number | null>(null);
  const [access, setAccess] = useState<StudentAccess | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [requests, setRequests] = useState<PlanRequest[]>([]);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [newLeads, setNewLeads] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');

  // Busca local: a lista de alunos já está carregada e a recepção digita com o
  // aluno na frente dela — ida ao servidor a cada tecla só adicionaria espera.
  const matches = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (needle.length < 2) return [];
    return students.filter((s) => s.nmAluno.toLowerCase().includes(needle)).slice(0, 8);
  }, [term, students]);

  async function loadCompanies() {
    try {
      const response = await fetch(`${apiUrl}/companies`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as empresas.');
      const data = (await response.json()) as Company[];
      const ativas = data.filter((company) => company.boInativo === false);
      setCompanies(ativas);
      if (ativas.length === 1 && ativas[0]) setSelectedCompanyId(ativas[0].id);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar empresas.');
    }
  }

  async function loadStudents() {
    try {
      const response = await fetch(`${apiUrl}/students`);
      if (!response.ok) return;
      const data = (await response.json()) as Student[];
      setStudents(data.filter((student) => student.boInativo === false));
    } catch {
      // A busca é um atalho; sem ela a tela ainda mostra o movimento do dia.
    }
  }

  async function loadMovement(companyId = selectedCompanyId) {
    if (!companyId) {
      setMovement(null);
      return;
    }
    try {
      const response = await fetch(`${apiUrl}/companies/${companyId}/reception`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar o movimento.');
      setMovement((await response.json()) as Movement);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar movimento.');
    }
  }

  // Fila de solicitações. Falha em silêncio: quem não tem permissão de avisos
  // continua usando a recepção para atender, que é a função principal da tela.
  async function loadRequests() {
    try {
      const response = await fetch(`${apiUrl}/plan-requests?cnStatus=pendente`);
      if (!response.ok) return;
      setRequests((await response.json()) as PlanRequest[]);
    } catch {
      // silencioso de propósito — ver comentário acima
    }
  }

  // Quantos interessados ainda não foram atendidos. A recepção é a tela que
  // fica aberta o dia todo — é aqui que o número precisa aparecer para alguém
  // lembrar de ligar. A fila em si vive na tela Interessados; duplicá-la aqui
  // criaria duas listas para manter em dia. Silencioso, como a fila acima.
  async function loadNewLeads() {
    try {
      const response = await fetch(`${apiUrl}/leads?cnStatus=novo`);
      if (!response.ok) return;
      setNewLeads(((await response.json()) as unknown[]).length);
    } catch {
      // silencioso de propósito — ver comentário acima
    }
  }

  async function resolveRequest(request: PlanRequest, cnStatus: 'aprovada' | 'recusada') {
    try {
      setResolvingId(request.id);
      const response = await fetch(`${apiUrl}/plan-requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnStatus }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível responder a solicitação.');

      await loadRequests();
      // A mensagem diz o que ACONTECEU, não o que foi clicado: aprovar
      // renovação e troca agora cria a matrícula e as parcelas de verdade.
      showToast(
        cnStatus !== 'aprovada'
          ? 'Solicitação recusada.'
          : request.cnTipo === 'cancelamento'
            ? 'Cancelamento aprovado e matrícula encerrada.'
            : request.cnTipo === 'renovacao'
              ? 'Renovação aprovada. Nova matrícula e parcelas geradas.'
              : 'Troca aprovada. O aluno já está no novo plano, com as parcelas geradas.',
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao responder solicitação.');
    } finally {
      setResolvingId(null);
    }
  }

  async function dispatchNotices() {
    try {
      setIsDispatching(true);
      const response = await fetch(`${apiUrl}/notifications/dispatch`, { method: 'POST' });
      if (!response.ok) await getApiError(response, 'Não foi possível enviar os avisos.');
      const data = (await response.json()) as { enviados: number; semEmail: number };
      showToast(
        `${data.enviados} aviso(s) enviado(s) por e-mail` +
          (data.semEmail > 0 ? ` · ${data.semEmail} sem e-mail cadastrado` : '.'),
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao enviar avisos.');
    } finally {
      setIsDispatching(false);
    }
  }

  useEffect(() => {
    void loadCompanies();
    void loadStudents();
    void loadRequests();
    void loadNewLeads();
  }, []);

  useEffect(() => {
    void loadMovement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  async function selectStudent(student: Student) {
    setSelectedStudent(student);
    setTerm('');
    setAccess(null);
    setPoints(null);
    setBenefits([]);

    // Situação, saldo e direitos em paralelo: são as perguntas que a recepção
    // faz antes de liberar a entrada. A situação vai com a FILIAL: o plano
    // pode valer noutra unidade, e a tela precisa dizer isso antes do
    // check-in recusar.
    const [verifyResponse, pointsResponse, benefitsResponse] = await Promise.all([
      fetch(`${apiUrl}/students/${student.id}?idEmpresa=${selectedCompanyId ?? ''}`),
      fetch(`${apiUrl}/students/${student.id}/related/points`),
      fetch(`${apiUrl}/students/${student.id}/benefits`),
    ]);

    if (verifyResponse.ok) {
      const data = (await verifyResponse.json()) as { studentAccess?: StudentAccess };
      setAccess(data.studentAccess ?? null);
    }
    if (pointsResponse.ok) {
      const data = (await pointsResponse.json()) as {
        saldos: Array<{ idEmpresa: number; qtDisponivel: number }>;
      };
      setPoints(data.saldos.find((s) => s.idEmpresa === selectedCompanyId)?.qtDisponivel ?? 0);
    }
    if (benefitsResponse.ok) {
      const data = (await benefitsResponse.json()) as { beneficios?: Benefit[] };
      setBenefits(data.beneficios ?? []);
    }
  }

  async function handleDeliver(benefit: Benefit) {
    if (!selectedStudent) return;
    try {
      setDeliveringId(benefit.idPlanoBeneficio);
      const response = await fetch(
        `${apiUrl}/students/${selectedStudent.id}/benefits/${benefit.idPlanoBeneficio}/use`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idEmpresa: selectedCompanyId }),
        },
      );
      if (!response.ok) await getApiError(response, 'Não foi possível registrar a entrega.');

      // A resposta traz o estado novo: a linha vira "0 de 1" na hora, sem uma
      // segunda chamada e sem a recepção precisar recarregar para conferir.
      const data = (await response.json()) as { beneficios?: Benefit[] };
      setBenefits(data.beneficios ?? []);
      showToast(`${benefit.descricao} entregue.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao registrar a entrega.');
    } finally {
      setDeliveringId(null);
    }
  }

  async function handleCheckIn() {
    if (!selectedStudent || !selectedCompanyId) return;
    try {
      setIsCheckingIn(true);
      const response = await fetch(`${apiUrl}/students/${selectedStudent.id}/related/check-ins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idEmpresa: selectedCompanyId }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível registrar o check-in.');

      showToast(`Entrada registrada: ${selectedStudent.nmAluno}.`);
      setSelectedStudent(null);
      setAccess(null);
      setPoints(null);
      await loadMovement();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao registrar check-in.');
    } finally {
      setIsCheckingIn(false);
    }
  }

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Atendimento</p>
        <h2 className="module-page-title">RECEPÇÃO</h2>
      </header>

      <div className="form-view reception">
        <div className="reception-toolbar">
          <label className="search-field">
            <span>Empresa</span>
            <select
              onChange={(event) =>
                setSelectedCompanyId(event.target.value ? Number(event.target.value) : null)
              }
              value={selectedCompanyId ?? ''}
            >
              <option value="">Selecione a empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.dsEmpresa}
                </option>
              ))}
            </select>
          </label>

          <button
            className="reception-dispatch"
            disabled={isDispatching}
            onClick={() => void dispatchNotices()}
            title="Envia por e-mail os avisos de vencimento e atraso que ainda não saíram"
            type="button"
          >
            <Mail aria-hidden="true" size={15} />
            {isDispatching ? 'Enviando...' : 'Enviar avisos'}
          </button>

          {movement ? (
            <div className="reception-counters">
              <div>
                <strong>{movement.total}</strong>
                <span>entradas hoje</span>
              </div>
              <div>
                <strong>{movement.alunosDistintos}</strong>
                <span>{movement.alunosDistintos === 1 ? 'aluno' : 'alunos'}</span>
              </div>
              {newLeads !== null && newLeads > 0 ? (
                <div className="reception-counter-lead">
                  <strong>{newLeads}</strong>
                  <span>{newLeads === 1 ? 'interessado' : 'interessados'}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {feedback ? <div className="form-feedback">{feedback}</div> : null}

        <section className="reception-search" aria-label="Atender aluno">
          <label className="reception-search-field">
            <Search aria-hidden="true" size={18} />
            <input
              disabled={!selectedCompanyId}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={
                selectedCompanyId ? 'Digite o nome do aluno' : 'Selecione a empresa primeiro'
              }
              type="search"
              value={term}
            />
          </label>

          {matches.length > 0 ? (
            <ul className="reception-matches">
              {matches.map((student) => (
                <li key={student.id}>
                  <button onClick={() => void selectStudent(student)} type="button">
                    {student.nmAluno}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {selectedStudent ? (
            <div className="reception-card">
              <div className="reception-card-head">
                <div>
                  <strong>{selectedStudent.nmAluno}</strong>
                  {points !== null ? <span>{points} ponto(s) nesta filial</span> : null}
                </div>
                <button
                  className="reception-checkin"
                  disabled={isCheckingIn}
                  onClick={() => void handleCheckIn()}
                  type="button"
                >
                  <UserCheck aria-hidden="true" size={16} />
                  {isCheckingIn ? 'Registrando...' : 'Registrar entrada'}
                </button>
              </div>

              {access ? (
                <p
                  className={`reception-access ${access.canAccess ? 'ok' : 'blocked'}`}
                  role="status"
                >
                  {access.canAccess
                    ? 'Acesso liberado.'
                    : /* A mensagem vem da mesma regra que a catraca aplica, então
                         a recepção diz exatamente o que o aluno ouviria na porta. */
                      (access.reason ?? 'Acesso bloqueado.')}
                </p>
              ) : null}

              {/* Frequência é AVISO, não bloqueio: a entrada acontece e a
                  recepção decide o que fazer. Fica separado da linha de acesso
                  para não parecer recusa. */}
              {access?.frequencia?.aviso ? (
                <p className="reception-frequency" role="status">
                  {access.frequencia.aviso}
                </p>
              ) : null}

              {benefits.length > 0 ? (
                <ul className="reception-benefits">
                  {benefits.map((benefit) => (
                    <li key={benefit.idPlanoBeneficio}>
                      <span>
                        {benefit.descricao}
                        <em>
                          {benefit.restantes} de {benefit.limite} {benefit.janela}
                        </em>
                      </span>
                      <button
                        disabled={!benefit.podeUsar || deliveringId === benefit.idPlanoBeneficio}
                        onClick={() => void handleDeliver(benefit)}
                        type="button"
                      >
                        {deliveringId === benefit.idPlanoBeneficio
                          ? 'Registrando...'
                          : benefit.podeUsar
                            ? 'Entregar'
                            : 'Já usou'}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {benefits.some((benefit) => benefit.podeUsar && benefit.cnTipo === 'produto') ? (
                /* Dito porque é o efeito que não se vê acontecer: entregar aqui
                   tira a unidade do estoque, como uma venda de valor zero. */
                <p className="reception-benefits-hint">
                  Entregar um produto baixa o estoque junto com o direito.
                </p>
              ) : null}

              <button
                className="reception-clear"
                onClick={() => {
                  setSelectedStudent(null);
                  setAccess(null);
                  setPoints(null);
                  setBenefits([]);
                }}
                type="button"
              >
                Atender outro aluno
              </button>
            </div>
          ) : null}
        </section>

        {requests.length > 0 ? (
          <section className="reception-requests" aria-label="Solicitações pendentes">
            <div className="reception-requests-head">
              <p className="section-label">Solicitações aguardando resposta</p>
              <span>{requests.length}</span>
            </div>
            <ul className="reception-request-list">
              {requests.map((request) => (
                <li className="reception-request" key={request.id}>
                  <div>
                    <strong>
                      {request.aluno?.nmAluno ?? request.alunoPlano?.aluno?.nmAluno ?? 'Aluno'} —{' '}
                      {REQUEST_LABEL[request.cnTipo].pedido}
                    </strong>
                    <span>
                      {/* Na troca, o que interessa é o plano DESEJADO; nos
                          outros, o plano atual. Mostrar o atual num pedido de
                          troca faria a recepção aprovar sem saber para onde. */}
                      {request.cnTipo === 'troca'
                        ? (request.planoDesejado?.dsPlano ?? 'Plano novo')
                        : (request.alunoPlano?.plano?.dsPlano ?? 'Plano')}{' '}
                      ·{' '}
                      {new Date(request.dtCadastro).toLocaleDateString('pt-BR')}
                      {request.motivoCancelamento
                        ? ` · ${request.motivoCancelamento.dsMotivoCancelamento}`
                        : ''}
                    </span>
                    {request.dsObservacao ? <em>“{request.dsObservacao}”</em> : null}
                  </div>
                  <div className="reception-request-actions">
                    <button
                      className="secondary-button"
                      disabled={resolvingId === request.id}
                      onClick={() => void resolveRequest(request, 'recusada')}
                      type="button"
                    >
                      Recusar
                    </button>
                    <button
                      disabled={resolvingId === request.id}
                      onClick={() => void resolveRequest(request, 'aprovada')}
                      type="button"
                    >
                      {REQUEST_LABEL[request.cnTipo].acao}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="reception-movement" aria-label="Movimento de hoje">
          <p className="section-label">Movimento de hoje</p>
          {!selectedCompanyId ? (
            <p className="reception-empty">Selecione uma empresa para ver o movimento.</p>
          ) : !movement || movement.checkIns.length === 0 ? (
            <p className="reception-empty">Nenhuma entrada registrada hoje.</p>
          ) : (
            <ul className="reception-entries">
              {movement.checkIns.map((checkIn) => (
                <li className="reception-entry" key={checkIn.id}>
                  <span className="reception-entry-time">{hora(checkIn.dtCadastro)}</span>
                  <span className="reception-entry-name">
                    {checkIn.aluno?.nmAluno ?? 'Aluno'}
                  </span>
                  <span className="reception-entry-origin">{describeOrigin(checkIn)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
