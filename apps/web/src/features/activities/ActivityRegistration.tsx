'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { paginateItems } from '../../shared/registration/registrationHelpers';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import type { Activity, Company, Sport } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type ActivityRegistrationProps = {
  readOnly?: boolean;
};

export function ActivityRegistration({ readOnly = false }: ActivityRegistrationProps) {
  const activityNameInputRef = useRef<HTMLInputElement | null>(null);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesPage, setActivitiesPage] = useState(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedSportId, setSelectedSportId] = useState('');
  const [activityName, setActivityName] = useState('');
  const [isActivityActive, setIsActivityActive] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isFormEnabled = !readOnly && (selectedActivityId !== null || isCreating);

  const filteredActivities = activities.filter((activity) => {
    const search = searchTerm.toLowerCase();
    const company = companies.find((c) => c.id === activity.idEmpresa);
    const sport = sports.find((s) => s.id === activity.idEsporte);
    return (
      activity.dsAtividade.toLowerCase().includes(search) ||
      String(company?.dsEmpresa ?? '').toLowerCase().includes(search) ||
      String(sport?.dsEsporte ?? '').toLowerCase().includes(search) ||
      (activity.boInativo === 0 ? 'ativo' : 'inativo').includes(search)
    );
  });
  const paginatedActivities = paginateItems(filteredActivities, activitiesPage);

  // ── Loaders ────────────────────────────────────────────────────
  async function loadActivities() {
    try {
      setIsLoadingActivities(true);
      const response = await fetch(`${apiUrl}/activities?includeInactive=true`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as atividades.');
      setActivities((await response.json()) as Activity[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar atividades.');
    } finally {
      setIsLoadingActivities(false);
    }
  }

  async function loadLookups() {
    try {
      const [companiesResponse, sportsResponse] = await Promise.all([
        fetch(`${apiUrl}/companies`),
        fetch(`${apiUrl}/sports`),
      ]);
      const failed = [companiesResponse, sportsResponse].find((r) => !r.ok);
      if (failed) await getApiError(failed, 'Não foi possível carregar empresas e esportes.');
      setCompanies(((await companiesResponse.json()) as Company[]).filter((c) => c.boInativo === 0));
      setSports(((await sportsResponse.json()) as Sport[]).filter((s) => s.boInativo === 0));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar listas.');
    }
  }

  // ── Effects ────────────────────────────────────────────────────
  useEffect(() => { void loadActivities(); void loadLookups(); }, []);
  useEffect(() => { setActivitiesPage(1); }, [searchTerm]);

  // ── Helpers ────────────────────────────────────────────────────
  function getSportLabel(sportId: number | null) {
    return sports.find((s) => s.id === sportId)?.dsEsporte ?? '-';
  }

  function clearActivityForm() {
    setSelectedActivityId(null);
    setIsCreating(false);
    setSelectedCompanyId('');
    setSelectedSportId('');
    setActivityName('');
    setIsActivityActive(true);
    setFeedback('');
  }

  // ── Handlers ───────────────────────────────────────────────────
  function handleNewActivity() {
    clearActivityForm();
    setIsCreating(true);
    setIsActivityActive(true);
    setIsDrawerOpen(true);
    setTimeout(() => activityNameInputRef.current?.focus(), 100);
  }

  function handleSelectActivity(activity: Activity) {
    if (activity.id === selectedActivityId) { clearActivityForm(); return; }
    setSelectedActivityId(activity.id);
    setIsCreating(false);
    setSelectedCompanyId(activity.idEmpresa ? String(activity.idEmpresa) : '');
    setSelectedSportId(activity.idEsporte ? String(activity.idEsporte) : '');
    setActivityName(activity.dsAtividade);
    setIsActivityActive(activity.boInativo === 0);
    setFeedback('');
  }

  function handleEditActivity(activity: Activity) {
    setSelectedActivityId(activity.id);
    setIsCreating(false);
    setSelectedCompanyId(activity.idEmpresa ? String(activity.idEmpresa) : '');
    setSelectedSportId(activity.idEsporte ? String(activity.idEsporte) : '');
    setActivityName(activity.dsAtividade);
    setIsActivityActive(activity.boInativo === 0);
    setFeedback('');
    setIsDrawerOpen(true);
  }

  // ── Save handlers ──────────────────────────────────────────────
  async function handleToggleActivityStatus() {
    const nextActive = !isActivityActive;
    setIsActivityActive(nextActive);
    if (!selectedActivityId) return;
    try {
      const response = await fetch(`${apiUrl}/activities/${selectedActivityId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: nextActive ? 0 : 1 }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível alterar o status.');
      const updated = (await response.json()) as Activity;
      setActivities((current) => current.map((a) => (a.id === updated.id ? updated : a)));
    } catch (error) {
      setIsActivityActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activityName.trim()) { setFeedback('Informe a atividade.'); return; }
    try {
      const payload = {
        idEmpresa: selectedCompanyId ? Number(selectedCompanyId) : null,
        idEsporte: selectedSportId ? Number(selectedSportId) : null,
        dsAtividade: activityName.trim(),
        boInativo: isActivityActive ? 0 : 1,
      };
      const response = await fetch(
        selectedActivityId ? `${apiUrl}/activities/${selectedActivityId}` : `${apiUrl}/activities`,
        { method: selectedActivityId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      );
      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar a atividade.');
      }
      const saved = (await response.json()) as Activity;
      await loadActivities();
      setSelectedActivityId(saved.id);
      setIsCreating(false);
      setFeedback('Atividade salva com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar atividade.');
    }
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="form-view">
      <div className="form-heading">
        <p className="section-label">Atividades</p>
      </div>

      <section className="data-grid-section">
        <RegistrationGrid<Activity>
          ariaLabel="Atividades cadastradas"
          label="Atividades"
          columns={[
            { label: 'Atividade', render: (a) => a.dsAtividade, tooltip: (a) => a.dsAtividade },
            { label: 'Esporte', render: (a) => getSportLabel(a.idEsporte), tooltip: (a) => getSportLabel(a.idEsporte) },
            { label: 'Status', render: (a) => <span className={`status-badge ${a.boInativo === 0 ? 'active' : 'inactive'}`}>{a.boInativo === 0 ? 'Ativo' : 'Inativo'}</span> },
          ]}
          records={paginatedActivities}
          isLoading={isLoadingActivities}
          selectedId={selectedActivityId}
          onSelect={handleSelectActivity}
          onEdit={readOnly ? undefined : handleEditActivity}
          searchTerm={searchTerm}
          onSearch={setSearchTerm}
          searchPlaceholder="Buscar atividade"
          onNew={handleNewActivity}
          showNewButton={!readOnly}
          page={activitiesPage}
          totalItems={filteredActivities.length}
          onPageChange={setActivitiesPage}
        />
      </section>

      {!readOnly ? (
        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title={isCreating ? 'Nova Atividade' : 'Editar Atividade'}
          onClose={() => { clearActivityForm(); setIsDrawerOpen(false); }}
        >
          <form className="drawer-fields" onSubmit={handleSaveActivity}>
            {feedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{feedback}</div> : null}
            <RegistrationField htmlFor="activityCompany" label="Empresa" size="lg">
              <select disabled={!isFormEnabled} id="activityCompany" onChange={(e) => setSelectedCompanyId(e.target.value)} value={selectedCompanyId}>
                <option value="">Selecione</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.dsEmpresa}</option>)}
              </select>
            </RegistrationField>
            <RegistrationField htmlFor="activitySport" label="Esporte" size="md">
              <select disabled={!isFormEnabled} id="activitySport" onChange={(e) => setSelectedSportId(e.target.value)} value={selectedSportId}>
                <option value="">Selecione</option>
                {sports.map((s) => <option key={s.id} value={s.id}>{s.dsEsporte}</option>)}
              </select>
            </RegistrationField>
            <RegistrationField htmlFor="activityName" label="Atividade" required size="full">
              <input disabled={!isFormEnabled} id="activityName" maxLength={255} onChange={(e) => setActivityName(e.target.value)} ref={activityNameInputRef} required type="text" value={activityName} />
            </RegistrationField>
            <RegistrationField htmlFor="activityStatus" label="Status" size="sm">
              <button aria-pressed={isActivityActive} className={`status-toggle ${isActivityActive ? 'active' : ''}`} disabled={!isFormEnabled} id="activityStatus" onClick={handleToggleActivityStatus} type="button">
                <span>{isActivityActive ? 'Ativo' : 'Inativo'}</span>
              </button>
            </RegistrationField>
            <div className="form-actions" style={{ flex: '1 1 100%' }}>
              <button className="secondary-button" onClick={() => { clearActivityForm(); setIsDrawerOpen(false); }} type="button">Limpar</button>
              <button disabled={!isFormEnabled} type="submit"><Save size={16} />Salvar atividade</button>
            </div>
          </form>
        </RegistrationDrawer>
      ) : null}
    </div>
  );
}
