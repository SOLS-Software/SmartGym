'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import type { Company } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type Pontuacao = {
  id: number;
  idEmpresa: number;
  dsPontuacao: string;
  qtPontos: number;
  boInativo: boolean;
};

export function PointsRegistration() {
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  const [points, setPoints] = useState<Pontuacao[]>([]);
  const [isLoadingPoints, setIsLoadingPoints] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [dsPontuacao, setDsPontuacao] = useState('');
  const [qtPontos, setQtPontos] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isFormEnabled = selectedPointId !== null || isCreating;
  const filteredPoints = points.filter((point) =>
    point.dsPontuacao.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  async function loadCompanies() {
    try {
      const response = await fetch(`${apiUrl}/companies`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as empresas.');
      const data = (await response.json()) as Company[];
      setCompanies(data.filter((company) => company.boInativo === false));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar empresas.');
    }
  }

  async function loadPoints(companyId = selectedCompanyId) {
    if (!companyId) {
      setPoints([]);
      return;
    }

    try {
      setIsLoadingPoints(true);
      const response = await fetch(`${apiUrl}/companies/${companyId}/children/points`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as pontuações.');
      setPoints((await response.json()) as Pontuacao[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar pontuações.');
    } finally {
      setIsLoadingPoints(false);
    }
  }

  useEffect(() => {
    void loadCompanies();
  }, []);

  useEffect(() => {
    setSelectedPointId(null);
    setIsCreating(false);
    void loadPoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  function handleNew() {
    if (!selectedCompanyId) {
      setFeedback('Selecione uma empresa antes de cadastrar.');
      return;
    }
    setSelectedPointId(null);
    setIsCreating(true);
    setDsPontuacao('');
    setQtPontos('');
    setIsActive(true);
    setFeedback('');
    setIsDrawerOpen(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function handleEdit(point: Pontuacao) {
    setSelectedPointId(point.id);
    setIsCreating(false);
    setDsPontuacao(point.dsPontuacao);
    setQtPontos(String(point.qtPontos ?? 0));
    setIsActive(point.boInativo === false);
    setFeedback('');
    setIsDrawerOpen(true);
  }

  async function handleToggleStatus() {
    const nextActive = !isActive;
    setIsActive(nextActive);
    if (!selectedCompanyId || !selectedPointId) return;

    try {
      const response = await fetch(
        `${apiUrl}/companies/${selectedCompanyId}/children/points/${selectedPointId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boInativo: nextActive ? false : true }),
        },
      );
      if (!response.ok) await getApiError(response, 'Não foi possível alterar o status.');
      const updated = (await response.json()) as Pontuacao;
      setPoints((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setIsActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompanyId) {
      setFeedback('Selecione uma empresa antes de salvar.');
      return;
    }

    try {
      const payload = {
        dsPontuacao: dsPontuacao.trim(),
        qtPontos: qtPontos ? Number(qtPontos) : 0,
        boInativo: isActive ? false : true,
      };

      const response = await fetch(
        selectedPointId
          ? `${apiUrl}/companies/${selectedCompanyId}/children/points/${selectedPointId}`
          : `${apiUrl}/companies/${selectedCompanyId}/children/points`,
        {
          method: selectedPointId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar.');
      }

      const saved = (await response.json()) as Pontuacao;
      setPoints((current) => {
        if (selectedPointId) return current.map((item) => (item.id === saved.id ? saved : item));
        return [...current, saved].sort((a, b) => a.dsPontuacao.localeCompare(b.dsPontuacao));
      });
      setSelectedPointId(saved.id);
      setIsCreating(false);
      setFeedback('Pontuação salva com sucesso.');
      setIsDrawerOpen(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Fidelidade</p>
        <h2 className="module-page-title">CADASTRO DE PONTUAÇÕES</h2>
      </header>
      <div className="form-view">
        <section className="data-grid-section">
          <div className="grid-toolbar">
            <div className="child-grid-toolbar-label">
              <p className="section-label">Empresa</p>
            </div>
            <div className="child-grid-toolbar-actions">
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
            </div>
          </div>

          {feedback ? <div className="form-feedback">{feedback}</div> : null}

          <RegistrationGrid<Pontuacao>
            ariaLabel="Pontuações cadastradas"
            label="Pontuações"
            columns={[
              { label: 'Descrição', render: (r) => r.dsPontuacao },
              { label: 'Pontos', render: (r) => String(r.qtPontos ?? 0) },
              {
                label: 'Status',
                render: (r) => (
                  <span className={`status-badge ${r.boInativo === false ? 'active' : 'inactive'}`}>
                    {r.boInativo === false ? 'Ativo' : 'Inativo'}
                  </span>
                ),
              },
            ]}
            records={filteredPoints}
            isLoading={isLoadingPoints}
            selectedId={selectedPointId}
            onSelect={handleEdit}
            onEdit={handleEdit}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            searchPlaceholder="Buscar pontuação"
            onNew={handleNew}
            newDisabled={!selectedCompanyId}
            emptyMessage={
              selectedCompanyId
                ? 'Nenhuma pontuação cadastrada para esta empresa.'
                : 'Selecione uma empresa para ver as pontuações.'
            }
          />
        </section>

        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title={isCreating ? 'Nova Pontuação' : 'Editar Pontuação'}
          onClose={() => setIsDrawerOpen(false)}
        >
          <form className="drawer-fields" onSubmit={handleSave}>
            {feedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{feedback}</div> : null}
            <RegistrationField htmlFor="pontuacaoDescricao" label="Descrição" size="full">
              <input
                disabled={!isFormEnabled}
                id="pontuacaoDescricao"
                maxLength={255}
                onChange={(event) => setDsPontuacao(event.target.value)}
                placeholder="Ex.: Check-in diário"
                ref={nameInputRef}
                required
                type="text"
                value={dsPontuacao}
              />
            </RegistrationField>
            <RegistrationField htmlFor="pontuacaoPontos" label="Pontos" size="sm">
              <input
                disabled={!isFormEnabled}
                id="pontuacaoPontos"
                inputMode="numeric"
                onChange={(event) => setQtPontos(event.target.value)}
                placeholder="0"
                type="number"
                value={qtPontos}
              />
            </RegistrationField>
            <RegistrationField htmlFor="pontuacaoStatus" label="Status" size="sm">
              <button
                aria-pressed={isActive}
                className={`status-toggle ${isActive ? 'active' : ''}`}
                disabled={!isFormEnabled}
                id="pontuacaoStatus"
                onClick={handleToggleStatus}
                type="button"
              >
                <span>{isActive ? 'Ativo' : 'Inativo'}</span>
              </button>
            </RegistrationField>
            <div className="form-actions" style={{ flex: '1 1 100%' }}>
              <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
              <button disabled={!isFormEnabled} type="submit"><Save size={16} />Salvar pontuação</button>
            </div>
          </form>
        </RegistrationDrawer>
      </div>
    </>
  );
}
