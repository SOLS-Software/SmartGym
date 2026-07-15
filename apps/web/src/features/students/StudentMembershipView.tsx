'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  formatCpf,
  formatDateDisplay,
  isImageFile,
} from '../../shared/registration/registrationHelpers';
import type { Student, StudentFile } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type StudentMembershipViewProps = {
  studentId: number | null;
  studentName: string;
};

type NamedRecord = {
  id: number;
  boInativo?: number;
  [key: string]: unknown;
};

type StudentPlanView = {
  id: number;
  idPlano: number | null;
  nrDiaPagamento: number;
  dtAdmissao: string | null;
  dtCadastro: string;
  boInativo: number;
  empresa?: NamedRecord | null;
  promocaoPlano?: (NamedRecord & { promocao?: NamedRecord | null }) | null;
  plano?: (NamedRecord & {
    dsPlano?: string;
    frequencia?: NamedRecord | null;
    planoAtividades?: Array<NamedRecord & { atividade?: NamedRecord | null }>;
    planoProdutos?: Array<NamedRecord & { produto?: NamedRecord | null }>;
    planoEmpresas?: Array<NamedRecord & { empresa?: NamedRecord | null }>;
    planoValores?: Array<NamedRecord & { empresa?: NamedRecord | null; vlVenda?: number | string | null }>;
  }) | null;
};

function formatPhone(ddd: number | null | undefined, phone: string | null | undefined) {
  if (!phone) return '-';
  return ddd ? `(${ddd}) ${phone}` : phone;
}

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return '-';
  return Number(value).toLocaleString('pt-BR', {
    currency: 'BRL',
    style: 'currency',
  });
}

function getText(record: NamedRecord | null | undefined, key: string, fallback = '-') {
  const value = record?.[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

export function StudentMembershipView({ studentId, studentName }: StudentMembershipViewProps) {
  const [student, setStudent] = useState<Student | null>(null);
  const [plans, setPlans] = useState<StudentPlanView[]>([]);
  const [files, setFiles] = useState<StudentFile[]>([]);
  const [identificationUrl, setIdentificationUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const activePlan = useMemo(
    () => plans.find((plan) => plan.boInativo === 0) ?? plans[0] ?? null,
    [plans],
  );

  const planActivities = activePlan?.plano?.planoAtividades
    ?.filter((item) => Number(item.boInativo ?? 0) === 0)
    ?? [];
  const planProducts = activePlan?.plano?.planoProdutos
    ?.filter((item) => Number(item.boInativo ?? 0) === 0)
    ?? [];
  const planCompanies = activePlan?.plano?.planoEmpresas
    ?.filter((item) => Number(item.boInativo ?? 0) === 0)
    ?? [];
  const latestValue = activePlan?.plano?.planoValores?.[0] ?? null;

  useEffect(() => {
    if (!studentId) {
      setStudent(null);
      setPlans([]);
      setFiles([]);
      setIdentificationUrl('');
      return;
    }

    void loadMembership();
  }, [studentId]);

  async function loadMembership() {
    if (!studentId) return;

    try {
      setIsLoading(true);
      const [studentResponse, plansResponse, filesResponse] = await Promise.all([
        fetch(`${apiUrl}/students/${studentId}`),
        fetch(`${apiUrl}/students/${studentId}/related/plans`),
        fetch(`${apiUrl}/students/${studentId}/files`),
      ]);

      if (!studentResponse.ok) {
        await getApiError(studentResponse, 'Nao foi possivel carregar sua matricula.');
      }
      if (!plansResponse.ok) {
        await getApiError(plansResponse, 'Nao foi possivel carregar seu plano.');
      }
      if (!filesResponse.ok) {
        await getApiError(filesResponse, 'Nao foi possivel carregar sua foto.');
      }

      const nextStudent = (await studentResponse.json()) as Student;
      const nextPlans = (await plansResponse.json()) as StudentPlanView[];
      const nextFiles = (await filesResponse.json()) as StudentFile[];

      setStudent(nextStudent);
      setPlans(nextPlans);
      setFiles(nextFiles);
      setFeedback('');

      const identificationFile = nextFiles.find((file) => isImageFile(file.anCaminho));
      if (!identificationFile) {
        setIdentificationUrl('');
        return;
      }

      const urlResponse = await fetch(
        `${apiUrl}/students/${studentId}/files/${identificationFile.id}/url`,
      );
      if (urlResponse.ok) {
        const data = (await urlResponse.json()) as { url: string };
        setIdentificationUrl(data.url);
      } else {
        setIdentificationUrl('');
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar sua matricula.');
    } finally {
      setIsLoading(false);
    }
  }

  if (!studentId) {
    return (
      <div className="form-view">
        <div className="form-heading">
          <p className="section-label">Matricula</p>
          <h2>Sem acesso</h2>
          <p>Faca login como aluno para visualizar sua matricula.</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <header className="module-page-header">
      <p className="section-label">Alunos</p>
      <h2 className="module-page-title">MATRÍCULA</h2>
      <span className={`status-badge ${activePlan?.boInativo === 0 ? 'active' : 'inactive'}`}>
        {activePlan?.boInativo === 0 ? 'Plano ativo' : 'Sem plano ativo'}
      </span>
    </header>
    <div className="form-view membership-view">
      <p className="form-hint">Resumo da sua identificação, plano ativo e acessos liberados.</p>

      {feedback ? <div className="form-feedback">{feedback}</div> : null}

      <section className="membership-layout">
        <div className="membership-profile-panel">
          <div className="membership-photo-frame">
            {identificationUrl ? (
              <img alt="Foto de identificacao do aluno" src={identificationUrl} />
            ) : (
              <div className="membership-photo-placeholder" aria-hidden="true">
                {(student?.nmAluno ?? studentName)
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((name) => name[0])
                  .join('')
                  .toUpperCase()}
              </div>
            )}
          </div>

          <div className="membership-profile-data">
            <div>
              <span>CPF</span>
              <strong>{student?.caCPF ? formatCpf(student.caCPF) : '-'}</strong>
            </div>
            <div>
              <span>Nascimento</span>
              <strong>{student?.dtNascimento ? formatDateDisplay(student.dtNascimento) : '-'}</strong>
            </div>
            <div>
              <span>Contato</span>
              <strong>{formatPhone(student?.nrDDD, student?.nrContato)}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{student?.anEmail || '-'}</strong>
            </div>
          </div>
        </div>

        <div className="membership-plan-panel">
          <div className="membership-plan-header">
            <div>
              <p className="section-label">Plano contratado</p>
              <h3>{activePlan?.plano?.dsPlano ?? (isLoading ? 'Carregando...' : 'Nenhum plano encontrado')}</h3>
            </div>
            <span>{getText(activePlan?.plano?.frequencia, 'dsFrequencia')}</span>
          </div>

          <div className="membership-metrics">
            <div>
              <span>Valor</span>
              <strong>{formatMoney(latestValue?.vlVenda)}</strong>
            </div>
            <div>
              <span>Dia de pagamento</span>
              <strong>{activePlan?.nrDiaPagamento ?? '-'}</strong>
            </div>
            <div>
              <span>Admissao</span>
              <strong>{activePlan?.dtAdmissao ? formatDateDisplay(activePlan.dtAdmissao) : '-'}</strong>
            </div>
            <div>
              <span>Empresa</span>
              <strong>{getText(activePlan?.empresa ?? latestValue?.empresa, 'dsEmpresa')}</strong>
            </div>
          </div>

          <div className="membership-access-grid">
            <section>
              <h4>Atividades liberadas</h4>
              <div className="membership-chip-list">
                {planActivities.length > 0 ? (
                  planActivities.map((item) => (
                    <span key={item.id}>{getText(item.atividade, 'dsAtividade')}</span>
                  ))
                ) : (
                  <p>Nenhuma atividade vinculada ao plano.</p>
                )}
              </div>
            </section>

            <section>
              <h4>Unidades de acesso</h4>
              <div className="membership-chip-list">
                {planCompanies.length > 0 ? (
                  planCompanies.map((item) => (
                    <span key={item.id}>{getText(item.empresa, 'dsEmpresa')}</span>
                  ))
                ) : (
                  <p>Acesso padrao da academia.</p>
                )}
              </div>
            </section>

            <section>
              <h4>Produtos inclusos</h4>
              <div className="membership-chip-list">
                {planProducts.length > 0 ? (
                  planProducts.map((item) => (
                    <span key={item.id}>{getText(item.produto, 'dsProduto')}</span>
                  ))
                ) : (
                  <p>Nenhum produto vinculado ao plano.</p>
                )}
              </div>
            </section>

            <section>
              <h4>Arquivos da matricula</h4>
              <div className="membership-chip-list">
                <span>{files.length} arquivo(s)</span>
                {activePlan?.promocaoPlano?.promocao ? (
                  <span>{getText(activePlan.promocaoPlano.promocao, 'dsPromocao')}</span>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
    </>
  );
}
