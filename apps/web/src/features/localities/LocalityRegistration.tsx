'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, Save } from 'lucide-react';
import { GRID_PAGE_SIZE, GridPagination, paginateItems } from '../../shared/registration/registrationHelpers';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import {
  AddressLocationPicker,
  emptyAddressLocation,
  type AddressLocationValue,
} from '../../shared/registration/AddressLocationPicker';
import type { Company, Localidade } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

const LOCALITY_TYPE_OPTIONS = [
  { value: '1', label: 'Sala' },
  { value: '2', label: 'Quadra' },
];

type LocalityRegistrationProps = {
  readOnly?: boolean;
};

export function LocalityRegistration({ readOnly = false }: LocalityRegistrationProps) {
  const localityNameInputRef = useRef<HTMLInputElement | null>(null);

  const [localities, setLocalities] = useState<Localidade[]>([]);
  const [localitiesPage, setLocalitiesPage] = useState(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedLocalityId, setSelectedLocalityId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [localityName, setLocalityName] = useState('');
  const [localityDescription, setLocalityDescription] = useState('');
  const [localityType, setLocalityType] = useState('1');
  const [addressValue, setAddressValue] = useState<AddressLocationValue>(emptyAddressLocation);
  const [isLocalityActive, setIsLocalityActive] = useState(false);
  const [feedback, setFeedback] = useState('');

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isFormEnabled = selectedLocalityId !== null || isCreating;

  const filteredLocalities = localities.filter((locality) =>
    locality.nmLocalidade.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const localitiesTotalPages = Math.max(1, Math.ceil(filteredLocalities.length / GRID_PAGE_SIZE));
  const paginatedLocalities = paginateItems(filteredLocalities, localitiesPage);

  const getCompanyLabel = (companyId: number | null) =>
    companies.find((c) => c.id === companyId)?.dsEmpresa ?? '-';

  async function loadLocalities() {
    try {
      const response = await fetch(`${apiUrl}/localities`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as localidades.');
      setLocalities((await response.json()) as Localidade[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar localidades.');
    }
  }

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

  useEffect(() => {
    void loadLocalities();
    void loadCompanies();
  }, []);

  useEffect(() => {
    setLocalitiesPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (localitiesPage > localitiesTotalPages) setLocalitiesPage(localitiesTotalPages);
  }, [localitiesPage, localitiesTotalPages]);

  function clearForm() {
    setSelectedLocalityId(null);
    setIsCreating(false);
    setSelectedCompanyId('');
    setLocalityName('');
    setLocalityDescription('');
    setLocalityType('1');
    setAddressValue(emptyAddressLocation);
    setIsLocalityActive(false);
    setFeedback('');
  }

  function handleNewLocality() {
    clearForm();
    setIsCreating(true);
    setIsLocalityActive(true);
    setIsDrawerOpen(true);
    setTimeout(() => localityNameInputRef.current?.focus(), 100);
  }

  function handleEditLocality(locality: Localidade) {
    setSelectedLocalityId(locality.id);
    setIsCreating(false);
    setSelectedCompanyId(locality.idEmpresa ? String(locality.idEmpresa) : '');
    setLocalityName(locality.nmLocalidade);
    setLocalityDescription(locality.dsLocalidade);
    setLocalityType(String(locality.cnLocalidadeTP || 1));
    setAddressValue({
      ...emptyAddressLocation,
      latitude: String(locality.latitude ?? ''),
      longitude: String(locality.longitude ?? ''),
      hasPickedLocation: Boolean(locality.latitude || locality.longitude),
    });
    setIsLocalityActive(locality.boInativo === false);
    setFeedback('');
    setIsDrawerOpen(true);
  }

  function handleCloseDrawer() {
    setIsDrawerOpen(false);
  }

  async function handleToggleStatus() {
    const nextActive = !isLocalityActive;
    setIsLocalityActive(nextActive);
    if (!selectedLocalityId) return;

    try {
      const response = await fetch(`${apiUrl}/localities/${selectedLocalityId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: nextActive ? false : true }),
      });

      if (!response.ok) await getApiError(response, 'Não foi possível alterar o status.');
      const updated = (await response.json()) as Localidade;
      setLocalities((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setIsLocalityActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveLocality(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      if (!selectedCompanyId) {
        setFeedback('Selecione a empresa.');
        return;
      }

      const latitudeValue = Number(addressValue.latitude);
      const longitudeValue = Number(addressValue.longitude);

      if (!addressValue.hasPickedLocation || !Number.isFinite(latitudeValue) || latitudeValue < -90 || latitudeValue > 90) {
        setFeedback('Busque o endereço ou ajuste o pino no mapa para definir a localização.');
        return;
      }
      if (!Number.isFinite(longitudeValue) || longitudeValue < -180 || longitudeValue > 180) {
        setFeedback('Informe uma longitude válida.');
        return;
      }

      const payload = {
        idEmpresa: selectedCompanyId ? Number(selectedCompanyId) : null,
        nmLocalidade: localityName,
        dsLocalidade: localityDescription,
        cnLocalidadeTP: Number(localityType || 0),
        latitude: latitudeValue,
        longitude: longitudeValue,
        boInativo: isLocalityActive ? false : true,
      };

      const response = await fetch(
        selectedLocalityId ? `${apiUrl}/localities/${selectedLocalityId}` : `${apiUrl}/localities`,
        {
          method: selectedLocalityId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar.');
      }

      const saved = (await response.json()) as Localidade;
      setLocalities((current) => {
        if (selectedLocalityId) return current.map((item) => (item.id === saved.id ? saved : item));
        return [...current, saved].sort((a, b) => a.nmLocalidade.localeCompare(b.nmLocalidade));
      });
      setSelectedLocalityId(saved.id);
      setIsCreating(false);
      setFeedback('Localidade salva com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  return (
    <>
    <header className="module-page-header">
      <p className="section-label">Localidades</p>
      <h2 className="module-page-title">CADASTRO DE LOCALIDADES</h2>
    </header>
    <div className="form-view">

      <section className="data-grid-section">
        <div className="grid-toolbar">
          <div className="child-grid-toolbar-label">
            <p className="section-label">Localidades cadastradas</p>
          </div>
          <div className="child-grid-toolbar-actions">
            <label className="search-field">
              <span>Pesquisar</span>
              <input
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar localidade"
                type="search"
                value={searchTerm}
              />
            </label>
            {!readOnly ? (
              <button className="new-button" onClick={handleNewLocality} type="button">
                <Plus size={16} />
                Novo
              </button>
            ) : null}
          </div>
        </div>

        <div aria-label="Localidades cadastradas" className="product-table" role="table">
          <div
            className="product-row header"
            role="row"
            style={readOnly ? undefined : { gridTemplateColumns: 'minmax(0, 1fr) 6.875rem 6.875rem 2.75rem' }}
          >
            <span role="columnheader">Localidade</span>
            <span role="columnheader">Empresa</span>
            <span role="columnheader">Status</span>
            {!readOnly ? <span role="columnheader" /> : null}
          </div>

          {paginatedLocalities.map((locality) => (
            <div
              className={`product-row selectable${locality.id === selectedLocalityId ? ' selected' : ''}`}
              key={locality.id}
              onClick={() => !readOnly && handleEditLocality(locality)}
              onKeyDown={(e) => {
                if (!readOnly && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleEditLocality(locality);
                }
              }}
              role="row"
              style={{ gridTemplateColumns: 'minmax(0, 1fr) 6.875rem 6.875rem 2.75rem' }}
              tabIndex={0}
            >
              <span role="cell" title={locality.nmLocalidade}>{locality.nmLocalidade}</span>
              <span role="cell" title={getCompanyLabel(locality.idEmpresa)}>{getCompanyLabel(locality.idEmpresa)}</span>
              <span role="cell">
                <span className={`status-badge ${locality.boInativo === false ? 'active' : 'inactive'}`}>
                  {locality.boInativo === false ? 'Ativo' : 'Inativo'}
                </span>
              </span>
              {!readOnly ? (
                <span role="cell" className="grid-row-actions">
                  <button
                    aria-label="Editar localidade"
                    className="grid-edit-button"
                    onClick={(e) => { e.stopPropagation(); handleEditLocality(locality); }}
                    type="button"
                  >
                    <Pencil size={13} />
                  </button>
                </span>
              ) : null}
            </div>
          ))}

          {paginatedLocalities.length === 0 ? (
            <div className="empty-row">Nenhuma localidade encontrada.</div>
          ) : null}
        </div>

        <GridPagination onChange={setLocalitiesPage} page={localitiesPage} totalItems={filteredLocalities.length} />
      </section>

      {!readOnly ? (
        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title={isCreating ? 'Nova Localidade' : 'Editar Localidade'}
          onClose={handleCloseDrawer}
        >
          <form className="drawer-form" onSubmit={handleSaveLocality}>
            {feedback ? <div className="form-feedback">{feedback}</div> : null}

            <div className="field">
              <label htmlFor="localityName">Nome da localidade</label>
              <input
                disabled={!isFormEnabled}
                id="localityName"
                maxLength={255}
                onChange={(e) => setLocalityName(e.target.value)}
                placeholder="Ex.: Unidade Centro"
                ref={localityNameInputRef}
                required
                type="text"
                value={localityName}
              />
            </div>

            <div className="field">
              <label htmlFor="localityCompany">Empresa</label>
              <select
                disabled={!isFormEnabled}
                id="localityCompany"
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                required
                value={selectedCompanyId}
              >
                <option value="">Selecione</option>
                {companies.map((company) => (
                  <option key={company.id} value={String(company.id)}>
                    {company.dsEmpresa}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="localityDescription">Descrição</label>
              <input
                disabled={!isFormEnabled}
                id="localityDescription"
                maxLength={255}
                onChange={(e) => setLocalityDescription(e.target.value)}
                placeholder="Detalhes da localidade"
                type="text"
                value={localityDescription}
              />
            </div>

            <div className="field">
              <label htmlFor="localityType">Tipo</label>
              <select
                disabled={!isFormEnabled}
                id="localityType"
                onChange={(e) => setLocalityType(e.target.value)}
                value={localityType}
              >
                {LOCALITY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <AddressLocationPicker
              disabled={!isFormEnabled}
              onChange={setAddressValue}
              value={addressValue}
            />

            <div className="field">
              <label htmlFor="localityStatus">Status</label>
              <button
                aria-pressed={isLocalityActive}
                className={`status-toggle ${isLocalityActive ? 'active' : ''}`}
                disabled={!isFormEnabled}
                id="localityStatus"
                onClick={handleToggleStatus}
                type="button"
              >
                <span>{isLocalityActive ? 'Ativo' : 'Inativo'}</span>
              </button>
            </div>

            <div className="form-actions">
              <button
                className="secondary-button"
                onClick={() => { clearForm(); handleCloseDrawer(); }}
                type="button"
              >
                Limpar
              </button>
              <button disabled={!isFormEnabled} type="submit">
                <Save size={16} />
                Salvar localidade
              </button>
            </div>
          </form>
        </RegistrationDrawer>
      ) : null}
    </div>
    </>
  );
}
