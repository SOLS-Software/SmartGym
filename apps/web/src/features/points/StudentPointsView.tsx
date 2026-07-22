'use client';

import { useEffect, useState } from 'react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type NamedRecord = { id: number; [key: string]: unknown };

type Pontuacao = {
  id: number;
  idEmpresa: number;
  dsPontuacao: string;
  qtPontos: number;
  boInativo: boolean;
};

type Company = {
  id: number;
  dsEmpresa: string;
  boInativo: boolean;
};

function getText(record: NamedRecord | null | undefined, key: string, fallback = '-') {
  const value = record?.[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

export function StudentPointsView() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [points, setPoints] = useState<Pontuacao[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const activePoints = points.filter((point) => point.boInativo === false);

  useEffect(() => {
    void loadCompanies();
  }, []);

  useEffect(() => {
    void loadPoints();
  }, [selectedCompanyId]);

  async function loadCompanies() {
    try {
      const response = await fetch(`${apiUrl}/companies`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as empresas.');
      const data = (await response.json()) as Company[];
      const active = data.filter((company) => company.boInativo === false);
      setCompanies(active);
      if (active.length === 1) setSelectedCompanyId(active[0]!.id);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar empresas.');
    }
  }

  async function loadPoints() {
    if (!selectedCompanyId) {
      setPoints([]);
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`${apiUrl}/companies/${selectedCompanyId}/children/points`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as pontuações.');
      setPoints((await response.json()) as Pontuacao[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar pontuações.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Fidelidade</p>
        <h2 className="module-page-title">PONTUAÇÕES</h2>
      </header>
      <div className="form-view student-plans-view">
        <p className="form-hint">Confira as pontuações disponíveis na academia e quantos pontos cada ação vale.</p>

        {companies.length > 1 ? (
          <div className="drawer-fields" style={{ marginBottom: '1rem' }}>
            <div className="field field-size-sm">
              <label htmlFor="studentPointsCompany">Empresa</label>
              <select
                id="studentPointsCompany"
                onChange={(e) => setSelectedCompanyId(e.target.value ? Number(e.target.value) : null)}
                value={selectedCompanyId ?? ''}
              >
                <option value="">Selecione a empresa</option>
                {companies.map((company) => (
                  <option key={company.id} value={String(company.id)}>
                    {company.dsEmpresa}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {feedback ? <div className="form-feedback">{feedback}</div> : null}

        {isLoading ? <div className="form-hint">Carregando pontuações...</div> : null}

        {!isLoading && !selectedCompanyId ? (
          <div className="form-hint">Selecione uma empresa para ver as pontuações.</div>
        ) : null}

        {!isLoading && selectedCompanyId && activePoints.length === 0 ? (
          <div className="form-hint">Nenhuma pontuação ativa cadastrada para esta empresa.</div>
        ) : null}

        {!isLoading && activePoints.length > 0 ? (
          <section className="student-plan-cards" aria-label="Pontuações da academia">
            {activePoints.map((point) => (
              <article className="student-plan-card" key={point.id}>
                <div className="student-plan-card-header">
                  <div>
                    <span className="section-label">Pontuação</span>
                    <h3>{point.dsPontuacao}</h3>
                  </div>
                  <span className="status-badge active">{point.qtPontos} ponto{point.qtPontos !== 1 ? 's' : ''}</span>
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </>
  );
}
