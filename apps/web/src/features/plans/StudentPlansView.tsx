'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDateDisplay } from '../../shared/registration/registrationHelpers';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useToast } from '../../shared/components/Toast';

type StudentPlansViewProps = {
  studentId: number | null;
  studentName: string;
};

type NamedRecord = {
  id: number;
  boInativo?: boolean;
  [key: string]: unknown;
};

type AcademyPlan = NamedRecord & {
  dsPlano?: string;
  frequencia?: NamedRecord | null;
  planoAtividades?: Array<NamedRecord & { atividade?: NamedRecord | null }>;
  planoProdutos?: Array<NamedRecord & { produto?: NamedRecord | null }>;
  planoEmpresas?: Array<NamedRecord & { empresa?: NamedRecord | null }>;
  planoValores?: Array<NamedRecord & { empresa?: NamedRecord | null; vlVenda?: number | string | null }>;
  promocaoPlanos?: Array<NamedRecord & { promocao?: NamedRecord | null }>;
};

type StudentPlanLink = {
  id: number;
  idPlano: number | null;
  nrDiaPagamento: number;
  dtAdmissao: string | null;
  boInativo: boolean;
};

type PlanRequest = {
  id: number;
  cnTipo: 'cancelamento' | 'renovacao' | 'troca';
  cnStatus: 'pendente' | 'aprovada' | 'recusada';
  planoDesejado: { id: number; dsPlano: string } | null;
};

function getText(record: NamedRecord | null | undefined, key: string, fallback = '-') {
  const value = record?.[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return '-';
  return Number(value).toLocaleString('pt-BR', {
    currency: 'BRL',
    style: 'currency',
  });
}

function uniqueNames(names: string[]) {
  return Array.from(new Set(names.filter((name) => name && name !== '-')));
}

export function StudentPlansView({ studentId }: StudentPlansViewProps) {
  const [academyPlans, setAcademyPlans] = useState<AcademyPlan[]>([]);
  const [studentPlans, setStudentPlans] = useState<StudentPlanLink[]>([]);
  const [requests, setRequests] = useState<PlanRequest[]>([]);
  const [requestingPlanId, setRequestingPlanId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const { showToast } = useToast();

  // Um pedido de troca por vez: enquanto a academia não responde, o aluno vê o
  // estado em vez de um botão que abriria um segundo pedido igual.
  const pendingChange = requests.find(
    (request) => request.cnTipo === 'troca' && request.cnStatus === 'pendente',
  ) ?? null;

  const studentPlanByPlanId = useMemo(() => {
    const links = new Map<number, StudentPlanLink>();
    for (const plan of studentPlans) {
      if (plan.idPlano && plan.boInativo === false) {
        links.set(plan.idPlano, plan);
      }
    }
    return links;
  }, [studentPlans]);

  const sortedPlans = useMemo(
    () =>
      [...academyPlans].sort((a, b) => {
        const aOwned = studentPlanByPlanId.has(a.id) ? 0 : 1;
        const bOwned = studentPlanByPlanId.has(b.id) ? 0 : 1;
        if (aOwned !== bOwned) return aOwned - bOwned;
        return getText(a, 'dsPlano', '').localeCompare(getText(b, 'dsPlano', ''), 'pt-BR');
      }),
    [academyPlans, studentPlanByPlanId],
  );

  useEffect(() => {
    if (!studentId) {
      setAcademyPlans([]);
      setStudentPlans([]);
      return;
    }

    void loadPlans();
  }, [studentId]);

  async function loadPlans() {
    if (!studentId) return;

    try {
      setIsLoading(true);
      const [plansResponse, studentPlansResponse] = await Promise.all([
        fetch(`${apiUrl}/plans?includeDetails=true`),
        fetch(`${apiUrl}/students/${studentId}/related/plans`),
      ]);

      if (!plansResponse.ok) {
        await getApiError(plansResponse, 'Não foi possível carregar os planos da academia.');
      }
      if (!studentPlansResponse.ok) {
        await getApiError(studentPlansResponse, 'Não foi possível identificar seu plano.');
      }

      setAcademyPlans((await plansResponse.json()) as AcademyPlan[]);
      setStudentPlans((await studentPlansResponse.json()) as StudentPlanLink[]);
      setFeedback('');

      // Pedidos: falham em silêncio de propósito — sem eles a vitrine continua
      // funcionando, que é a função principal da tela.
      try {
        const requestsResponse = await fetch(
          `${apiUrl}/students/${studentId}/related/plan-requests`,
        );
        if (requestsResponse.ok) setRequests((await requestsResponse.json()) as PlanRequest[]);
      } catch {
        // silencioso de propósito — ver comentário acima
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar planos.');
    } finally {
      setIsLoading(false);
    }
  }

  async function requestPlan(plan: AcademyPlan) {
    if (!studentId) return;
    try {
      setRequestingPlanId(plan.id);
      // A matrícula atual vai junto quando existe: aprovar encerra ela e abre a
      // nova. Quem ainda não tem plano manda sem, e a aprovação só matricula.
      const atual = studentPlans.find((link) => link.boInativo === false) ?? null;
      const response = await fetch(`${apiUrl}/students/${studentId}/related/plan-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnTipo: 'troca',
          idPlanoDesejado: plan.id,
          idAlunoPlano: atual?.id ?? null,
        }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível enviar o pedido.');

      await loadPlans();
      showToast('Pedido enviado. A academia vai responder em breve.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao enviar o pedido.');
    } finally {
      setRequestingPlanId(null);
    }
  }

  if (!studentId) {
    return (
      <div className="form-view">
        <div className="form-heading">
          <p className="section-label">Planos</p>
          <h2>Sem acesso</h2>
          <p>Faça login como aluno para visualizar os planos da academia.</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <header className="module-page-header">
      <p className="section-label">Minha conta</p>
      <h2 className="module-page-title">PLANOS</h2>
    </header>
    <div className="form-view student-plans-view">
      <p className="form-hint">Veja os planos disponíveis e identifique com destaque o plano vinculado à sua matrícula.</p>

      {pendingChange ? (
        <div className="student-plan-pending" role="status">
          Você já pediu
          {pendingChange.planoDesejado ? ` o ${pendingChange.planoDesejado.dsPlano}` : ' um plano'}
          . A academia está avaliando — assim que aprovarem, as parcelas aparecem em Matrícula.
        </div>
      ) : null}

      {feedback ? <div className="form-feedback">{feedback}</div> : null}

      {isLoading ? <div className="form-hint">Carregando planos...</div> : null}

      {!isLoading && sortedPlans.length === 0 ? (
        <div className="form-hint">Nenhum plano ativo cadastrado para a academia.</div>
      ) : null}

      <section className="student-plan-cards" aria-label="Planos da academia">
        {sortedPlans.map((plan) => {
          const myPlan = studentPlanByPlanId.get(plan.id) ?? null;
          const value = plan.planoValores?.[0] ?? null;
          const branches = uniqueNames(
            plan.planoEmpresas?.map((item) => getText(item.empresa, 'dsEmpresa')) ?? [],
          );
          const activities = uniqueNames(
            plan.planoAtividades?.map((item) => getText(item.atividade, 'dsAtividade')) ?? [],
          );
          const products = uniqueNames(
            plan.planoProdutos?.map((item) => getText(item.produto, 'dsProduto')) ?? [],
          );
          const promotions = uniqueNames(
            plan.promocaoPlanos?.map((item) => getText(item.promocao, 'dsPromocao')) ?? [],
          );
          const benefits = [
            ...activities,
            ...products.map((product) => `Produto: ${product}`),
            ...promotions.map((promotion) => `Promoção: ${promotion}`),
          ];

          return (
            <article className={`student-plan-card ${myPlan ? 'current' : ''}`} key={plan.id}>
              <div className="student-plan-card-header">
                <div>
                  <span className="section-label">{myPlan ? 'Meu plano' : 'Plano disponivel'}</span>
                  <h3>{plan.dsPlano ?? 'Plano sem nome'}</h3>
                </div>
                <span className={`status-badge ${myPlan ? 'active' : 'pending'}`}>
                  {myPlan ? 'Pertence a você' : 'Disponível'}
                </span>
              </div>

              {/* Só no plano que o aluno NÃO tem, e só quando não há pedido
                  pendente. O botão abre um pedido — não contrata: sem baixa
                  automática, contratar direto faria o aluno virar devedor no
                  mesmo instante, e alguém teria que limpar depois. */}
              {!myPlan && !pendingChange ? (
                <button
                  className="student-plan-request"
                  disabled={requestingPlanId === plan.id}
                  onClick={() => void requestPlan(plan)}
                  type="button"
                >
                  {requestingPlanId === plan.id ? 'Enviando...' : 'Quero este plano'}
                </button>
              ) : null}

              <div className="student-plan-summary">
                <div>
                  <span>Valor</span>
                  <strong>{formatMoney(value?.vlVenda)}</strong>
                </div>
                <div>
                  <span>Frequência</span>
                  <strong>{getText(plan.frequencia, 'dsFrequencia')}</strong>
                </div>
                {/* "Pagamento" e "Minha admissão" so existem na matricula do
                    aluno. Nos planos que ele nao tem, os dois saiam sempre como
                    "-" — um campo chamado "minha admissão" num plano alheio nao
                    quer dizer nada. */}
                {myPlan ? (
                  <>
                    <div>
                      <span>Pagamento</span>
                      <strong>{myPlan.nrDiaPagamento ? `Dia ${myPlan.nrDiaPagamento}` : '-'}</strong>
                    </div>
                    <div>
                      <span>Minha admissão</span>
                      <strong>{myPlan.dtAdmissao ? formatDateDisplay(myPlan.dtAdmissao) : '-'}</strong>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="student-plan-detail-grid">
                <section>
                  <h4>Filiais de acesso</h4>
                  <div className="student-plan-chip-list">
                    {branches.length > 0 ? (
                      branches.map((branch) => <span key={branch}>{branch}</span>)
                    ) : (
                      <p>{getText(value?.empresa, 'dsEmpresa', 'Acesso padrao da academia.')}</p>
                    )}
                  </div>
                </section>

                <section>
                  <h4>Benefícios do plano</h4>
                  <div className="student-plan-chip-list">
                    {benefits.length > 0 ? (
                      benefits.map((benefit) => <span key={benefit}>{benefit}</span>)
                    ) : (
                      <p>Nenhum beneficio adicional cadastrado.</p>
                    )}
                  </div>
                </section>
              </div>
            </article>
          );
        })}
      </section>
    </div>
    </>
  );
}
