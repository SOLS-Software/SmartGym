'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDateDisplay } from '../../shared/registration/registrationHelpers';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

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
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

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
        await getApiError(plansResponse, 'Nao foi possivel carregar os planos da academia.');
      }
      if (!studentPlansResponse.ok) {
        await getApiError(studentPlansResponse, 'Nao foi possivel identificar seu plano.');
      }

      setAcademyPlans((await plansResponse.json()) as AcademyPlan[]);
      setStudentPlans((await studentPlansResponse.json()) as StudentPlanLink[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar planos.');
    } finally {
      setIsLoading(false);
    }
  }

  if (!studentId) {
    return (
      <div className="form-view">
        <div className="form-heading">
          <p className="section-label">Planos</p>
          <h2>Sem acesso</h2>
          <p>Faca login como aluno para visualizar os planos da academia.</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <header className="module-page-header">
      <p className="section-label">Alunos</p>
      <h2 className="module-page-title">PLANOS</h2>
    </header>
    <div className="form-view student-plans-view">
      <p className="form-hint">Veja os planos disponíveis e identifique com destaque o plano vinculado à sua matrícula.</p>

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
            ...promotions.map((promotion) => `Promocao: ${promotion}`),
          ];

          return (
            <article className={`student-plan-card ${myPlan ? 'current' : ''}`} key={plan.id}>
              <div className="student-plan-card-header">
                <div>
                  <span className="section-label">{myPlan ? 'Meu plano' : 'Plano disponivel'}</span>
                  <h3>{plan.dsPlano ?? 'Plano sem nome'}</h3>
                </div>
                <span className={`status-badge ${myPlan ? 'active' : 'pending'}`}>
                  {myPlan ? 'Pertence a voce' : 'Disponivel'}
                </span>
              </div>

              <div className="student-plan-summary">
                <div>
                  <span>Valor</span>
                  <strong>{formatMoney(value?.vlVenda)}</strong>
                </div>
                <div>
                  <span>Frequencia</span>
                  <strong>{getText(plan.frequencia, 'dsFrequencia')}</strong>
                </div>
                <div>
                  <span>Pagamento</span>
                  <strong>{myPlan ? `Dia ${myPlan.nrDiaPagamento || '-'}` : '-'}</strong>
                </div>
                <div>
                  <span>Minha admissao</span>
                  <strong>{myPlan?.dtAdmissao ? formatDateDisplay(myPlan.dtAdmissao) : '-'}</strong>
                </div>
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
                  <h4>Beneficios do plano</h4>
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
