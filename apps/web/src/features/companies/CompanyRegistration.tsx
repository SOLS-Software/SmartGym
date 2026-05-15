'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { GRID_PAGE_SIZE, formatChildCell, formatChildSearchValue, formatDateInput, getLookupLabel, isImageFile, onlyDigits, paginateItems } from '../../shared/registration/registrationHelpers';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import type { Company, CompanyChildColumn, CompanyChildField, CompanyChildRecord, CompanyValidationErrors, CompanyValidationField, LookupRecord } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { companyChildTables } from './companyChildTables';
import { formatCnpj, getSelectedRecord, isValidCnpj } from './companyUtils';


export function CompanyRegistration() {
  const companyFileInputRef = useRef<HTMLInputElement>(null);
  const companyNameInputRef = useRef<HTMLInputElement | null>(null);
  const companyChildFormRef = useRef<HTMLDivElement | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesPage, setCompaniesPage] = useState(1);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyCnpj, setCompanyCnpj] = useState('');
  const [isCompanyActive, setIsCompanyActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [companyErrors, setCompanyErrors] = useState<CompanyValidationErrors>({});
  const [touchedCompanyFields, setTouchedCompanyFields] = useState<
    Partial<Record<CompanyValidationField, boolean>>
  >({});
  const [selectedChildTable, setSelectedChildTable] = useState('');
  const [childRecords, setChildRecords] = useState<CompanyChildRecord[]>([]);
  const [isLoadingChildRecords, setIsLoadingChildRecords] = useState(false);
  const [childSearchTerm, setChildSearchTerm] = useState('');
  const [selectedChildRecordId, setSelectedChildRecordId] = useState<number | null>(null);
  const [childFormValues, setChildFormValues] = useState<Record<string, string>>({});
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [isChildActive, setIsChildActive] = useState(true);
  const [childFeedback, setChildFeedback] = useState('');
  const [childLookups, setChildLookups] = useState<Record<string, LookupRecord[]>>({});
  const [companyFilePreviewUrls, setCompanyFilePreviewUrls] = useState<Record<number, string>>({});
  const [isUploadingCompanyFile, setIsUploadingCompanyFile] = useState(false);
  const [companyFileModal, setCompanyFileModal] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const [isCompanyFieldsCollapsed, setIsCompanyFieldsCollapsed] = useState(false);
  const [isChildFieldsCollapsed, setIsChildFieldsCollapsed] = useState(false);
  const isFormEnabled = selectedCompanyId !== null || isCreating;
  const childTableConfig = companyChildTables.find((table) => table.key === selectedChildTable) ?? null;
  const isFileChildTable = selectedChildTable === 'companyFiles' || selectedChildTable === 'promotionFiles';
  const isChildFormEnabled = Boolean(selectedCompanyId) && (selectedChildRecordId !== null || isCreatingChild);
  const selectedChildRecord = getSelectedRecord(childRecords, selectedChildRecordId);
  const filteredChildRecords = childRecords.filter((record) =>
    childTableConfig
      ? childTableConfig.columns.some((column) =>
        formatChildSearchValue(
          record,
          column,
          childLookups[column.key],
        ).includes(childSearchTerm.toLowerCase()),
      )
      : false,
  );
  const filteredCompanies = companies.filter((company) => {
    if (selectedChildTable && selectedCompanyId !== null) {
      return company.id === selectedCompanyId;
    }

    const search = searchTerm.toLowerCase();

    return (
      company.dsEmpresa.toLowerCase().includes(search) ||
      company.caCNPJ.includes(searchTerm.replace(/\D/g, ''))
    );
  });
  const companiesTotalPages = Math.max(1, Math.ceil(filteredCompanies.length / GRID_PAGE_SIZE));
  const paginatedCompanies = paginateItems(filteredCompanies, companiesPage);

  async function loadCompanies() {
    try {
      setIsLoadingCompanies(true);
      const response = await fetch(`${apiUrl}/companies`);

      if (!response.ok) {
        await getApiError(response, 'Não foi possível carregar as empresas.');
      }

      const data = (await response.json()) as Company[];
      setCompanies(data);
      setFeedback('');
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar empresas.',
      );
    } finally {
      setIsLoadingCompanies(false);
    }
  }

  useEffect(() => {
    void loadCompanies();
  }, []);

  useEffect(() => {
    setCompaniesPage(1);
  }, [searchTerm, selectedCompanyId]);

  useEffect(() => {
    if (companiesPage > companiesTotalPages) {
      setCompaniesPage(companiesTotalPages);
    }
  }, [companiesPage, companiesTotalPages]);

  async function loadChildRecords(companyId = selectedCompanyId, config = childTableConfig) {
    if (!config) {
      setChildRecords([]);
      setCompanyFilePreviewUrls({});
      setIsLoadingChildRecords(false);
      return;
    }

    if (!companyId) {
      setChildRecords([]);
      setCompanyFilePreviewUrls({});
      setIsLoadingChildRecords(false);
      return;
    }

    try {
      setIsLoadingChildRecords(true);
      const response = await fetch(
        config.key === 'companyFiles'
          ? `${apiUrl}/companies/${companyId}/files`
          : config.key === 'promotionFiles'
            ? `${apiUrl}/companies/${companyId}/promotion-files`
          : `${apiUrl}/companies/${companyId}/children/${config.endpoint}`,
      );

      if (!response.ok) {
        await getApiError(response, 'Não foi possível carregar os registros filhos.');
      }

      const data = (await response.json()) as CompanyChildRecord[];
      setChildRecords(data);
      setChildFeedback('');

      if (config.key === 'companyFiles' || config.key === 'promotionFiles') {
        const imageFiles = data.filter((file) => isImageFile(String(file.anCaminho ?? '')));
        const urlEntries = await Promise.all(
          imageFiles.map(async (file) => {
            try {
              const urlResponse = await fetch(
                config.key === 'companyFiles'
                  ? `${apiUrl}/companies/${companyId}/files/${file.id}/url`
                  : `${apiUrl}/companies/${companyId}/promotion-files/${file.id}/url`,
              );

              if (!urlResponse.ok) {
                return null;
              }

              const urlData = (await urlResponse.json()) as { url: string };
              return [file.id, urlData.url] as const;
            } catch {
              return null;
            }
          }),
        );
        const urls: Record<number, string> = {};

        for (const entry of urlEntries) {
          if (entry) {
            urls[entry[0]] = entry[1];
          }
        }

        setCompanyFilePreviewUrls(urls);
      } else {
        setCompanyFilePreviewUrls({});
      }
    } catch (error) {
      setChildFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar registros filhos.',
      );
    } finally {
      setIsLoadingChildRecords(false);
    }
  }

  useEffect(() => {
    setSelectedChildRecordId(null);
    setIsCreatingChild(false);
    setChildFormValues({});
    setIsChildActive(true);
    setChildSearchTerm('');
    void loadChildRecords();
  }, [selectedCompanyId, selectedChildTable]);

  useEffect(() => {
    async function loadLookups() {
      if (!childTableConfig) {
        return;
      }

      const lookupFields = childTableConfig.fields.filter((field) => field.lookupEndpoint);

      if (lookupFields.length === 0) {
        return;
      }

      const nextLookups: Record<string, LookupRecord[]> = {};

      await Promise.all(
        lookupFields.map(async (field) => {
          if (!field.lookupEndpoint) {
            return;
          }

          if (field.lookupEndpoint.includes('{companyId}') && !selectedCompanyId) {
            nextLookups[field.key] = [];
            return;
          }

          const endpoint = field.lookupEndpoint.replace(
            '{companyId}',
            String(selectedCompanyId ?? ''),
          );
          const response = await fetch(`${apiUrl}/${endpoint}`);

          if (!response.ok) {
            await getApiError(response, `Não foi possível carregar ${field.label}.`);
          }

          nextLookups[field.key] = (await response.json()) as LookupRecord[];
        }),
      );

      setChildLookups((current) => ({
        ...current,
        ...nextLookups,
      }));
    }

    void loadLookups().catch((error) => {
      setChildFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar listas dos campos filhos.',
      );
    });
  }, [childTableConfig, selectedCompanyId]);

  function clearChildForm() {
    setSelectedChildRecordId(null);
    setIsCreatingChild(false);
    setChildFormValues({});
    setIsChildActive(true);
  }

  function handleNewChild() {
    setSelectedChildRecordId(null);
    setIsCreatingChild(true);
    setChildFormValues({});
    setIsChildActive(true);
    setChildFeedback('');
    setIsCompanyFieldsCollapsed(true);
    setIsChildFieldsCollapsed(false);
    setTimeout(() => { companyChildFormRef.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled])')?.focus(); }, 0);
  }

  function handleSelectChild(record: CompanyChildRecord) {
    if (!childTableConfig) {
      return;
    }

    const values = childTableConfig.fields.reduce<Record<string, string>>((current, field) => {
      const value = record[field.key];
      current[field.key] = field.type === 'date' ? formatDateInput(String(value ?? '')) : String(value ?? '');
      return current;
    }, {});

    setSelectedChildRecordId(record.id);
    setIsCreatingChild(false);
    setChildFormValues(values);
    setIsChildActive(Number(record.boInativo ?? 0) === 0);
    setChildFeedback('');
    setIsCompanyFieldsCollapsed(true);
    setIsChildFieldsCollapsed(false);
  }

  async function handleToggleChildStatus() {
    if (!childTableConfig) {
      return;
    }

    const nextActive = !isChildActive;
    setIsChildActive(nextActive);

    if (!selectedCompanyId || !selectedChildRecordId) {
      return;
    }

    try {
      const response = await fetch(
        `${apiUrl}/companies/${selectedCompanyId}/children/${childTableConfig.endpoint}/${selectedChildRecordId}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            boInativo: nextActive ? 0 : 1,
          }),
        },
      );

      if (!response.ok) {
        await getApiError(response, 'Não foi possível alterar o status do registro filho.');
      }

      const updated = (await response.json()) as CompanyChildRecord;
      setChildRecords((current) =>
        current.map((record) => (record.id === updated.id ? updated : record)),
      );
    } catch (error) {
      setIsChildActive(!nextActive);
      setChildFeedback(
        error instanceof Error ? error.message : 'Erro ao alterar status do registro filho.',
      );
    }
  }

  async function handleSaveChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!childTableConfig) {
      setChildFeedback('Selecione uma tabela filha antes de salvar.');
      return;
    }

    if (!selectedCompanyId) {
      setChildFeedback('Selecione uma empresa antes de salvar.');
      return;
    }

    try {
      const payload = childTableConfig.fields.reduce<Record<string, string | number | null>>(
        (current, field) => {
          const value = childFormValues[field.key] ?? '';
          current[field.key] = field.type === 'number' ? (value ? Number(value) : null) : value;
          return current;
        },
        {
          boInativo: isChildActive ? 0 : 1,
        },
      );

      const response = await fetch(
        selectedChildRecordId
          ? `${apiUrl}/companies/${selectedCompanyId}/children/${childTableConfig.endpoint}/${selectedChildRecordId}`
          : `${apiUrl}/companies/${selectedCompanyId}/children/${childTableConfig.endpoint}`,
        {
          method: selectedChildRecordId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar o registro filho.');
      }

      const saved = (await response.json()) as CompanyChildRecord;
      setChildRecords((current) => {
        if (selectedChildRecordId) {
          return current.map((record) => (record.id === saved.id ? saved : record));
        }

        return [saved, ...current];
      });
      setSelectedChildRecordId(saved.id);
      setIsCreatingChild(false);
      setChildFeedback(`${childTableConfig.label} salvo com sucesso.`);
    } catch (error) {
      setChildFeedback(error instanceof Error ? error.message : 'Erro ao salvar registro filho.');
    }
  }

  async function handleUploadCompanyFile(file: File | null) {
    if (!file) {
      return;
    }

    if (!selectedCompanyId) {
      setChildFeedback('Selecione uma empresa antes de anexar arquivos.');
      return;
    }

    try {
      setIsUploadingCompanyFile(true);
      setChildFeedback('');

      const formData = new FormData();
      formData.append('idTiposArquivos', childFormValues.idTiposArquivos ?? '');
      formData.append('idPromocao', childFormValues.idPromocao ?? '');
      formData.append('file', file);

      const isReplacingFile = selectedChildRecordId !== null && !isCreatingChild;
      const response = await fetch(
        selectedChildTable === 'promotionFiles'
          ? isReplacingFile
            ? `${apiUrl}/companies/${selectedCompanyId}/promotion-files/${selectedChildRecordId}`
            : `${apiUrl}/companies/${selectedCompanyId}/promotion-files`
          : isReplacingFile
            ? `${apiUrl}/companies/${selectedCompanyId}/files/${selectedChildRecordId}`
            : `${apiUrl}/companies/${selectedCompanyId}/files`,
        {
          method: isReplacingFile ? 'PUT' : 'POST',
          body: formData,
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível enviar o arquivo.');
      }

      const saved = (await response.json()) as CompanyChildRecord;
      await loadChildRecords(selectedCompanyId);
      setSelectedChildRecordId(saved.id);
      setIsCreatingChild(false);
      setChildFormValues({
        idPromocao: saved.idPromocao ? String(saved.idPromocao) : '',
        idTiposArquivos: saved.idTiposArquivos ? String(saved.idTiposArquivos) : '',
      });
      setChildFeedback(isReplacingFile ? 'Arquivo alterado com sucesso.' : 'Arquivo enviado com sucesso.');
    } catch (error) {
      setChildFeedback(
        error instanceof Error ? error.message : 'Erro ao enviar arquivo.',
      );
    } finally {
      setIsUploadingCompanyFile(false);

      if (companyFileInputRef.current) {
        companyFileInputRef.current.value = '';
      }
    }
  }

  async function handleOpenCompanyFile(fileId: number) {
    if (!selectedCompanyId) {
      return;
    }

    try {
      const response = await fetch(
        selectedChildTable === 'promotionFiles'
          ? `${apiUrl}/companies/${selectedCompanyId}/promotion-files/${fileId}/url`
          : `${apiUrl}/companies/${selectedCompanyId}/files/${fileId}/url`,
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível abrir o arquivo.');
      }

      const data = (await response.json()) as { url: string };
      const file = childRecords.find((record) => record.id === fileId);
      setCompanyFileModal({
        title: String(file?.dsArquivo ?? `Arquivo ${fileId}`),
        url: data.url,
      });
    } catch (error) {
      setChildFeedback(error instanceof Error ? error.message : 'Erro ao abrir arquivo.');
    }
  }

  async function handleRemoveCompanyFile(fileId: number) {
    if (!selectedCompanyId) {
      return;
    }

    try {
      const response = await fetch(selectedChildTable === 'promotionFiles'
        ? `${apiUrl}/companies/${selectedCompanyId}/promotion-files/${fileId}`
        : `${apiUrl}/companies/${selectedCompanyId}/files/${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível remover o arquivo.');
      }

      await loadChildRecords(selectedCompanyId);
      setChildFeedback('Arquivo removido com sucesso.');
    } catch (error) {
      setChildFeedback(error instanceof Error ? error.message : 'Erro ao remover arquivo.');
    }
  }

  function clearForm() {
    setSelectedCompanyId(null);
    setIsCreating(false);
    setCompanyName('');
    setCompanyCnpj('');
    setIsCompanyActive(false);
    setCompanyErrors({});
    setTouchedCompanyFields({});
  }

  function handleNewCompany() {
    setSelectedCompanyId(null);
    setIsCreating(true);
    setCompanyName('');
    setCompanyCnpj('');
    setIsCompanyActive(true);
    setFeedback('');
    setCompanyErrors({});
    setTouchedCompanyFields({});
    setIsCompanyFieldsCollapsed(false);
    setIsChildFieldsCollapsed(true);
    setTimeout(() => companyNameInputRef.current?.focus(), 0);
  }

  function handleSelectCompany(company: Company) {
    if (company.id === selectedCompanyId) {
      clearForm();
      return;
    }

    setSelectedCompanyId(company.id);
    setIsCreating(false);
    setCompanyName(company.dsEmpresa);
    setCompanyCnpj(formatCnpj(company.caCNPJ));
    setIsCompanyActive(company.boInativo === 0);
    setFeedback('');
    setCompanyErrors({});
    setTouchedCompanyFields({});
    setIsCompanyFieldsCollapsed(false);
    setIsChildFieldsCollapsed(true);
  }

  async function handleToggleStatus() {
    const nextActive = !isCompanyActive;
    setIsCompanyActive(nextActive);

    if (!selectedCompanyId) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/companies/${selectedCompanyId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          boInativo: nextActive ? 0 : 1,
        }),
      });

      if (!response.ok) {
        await getApiError(response, 'Não foi possível alterar o status.');
      }

      const updatedCompany = (await response.json()) as Company;
      setCompanies((current) =>
        current.map((company) =>
          company.id === updatedCompany.id ? updatedCompany : company,
        ),
      );
    } catch (error) {
      setIsCompanyActive(!nextActive);
      setFeedback(
        error instanceof Error ? error.message : 'Erro ao alterar status.',
      );
    }
  }

  function getCompanyValidationErrors() {
    const errors: CompanyValidationErrors = {};
    const trimmedName = companyName.trim();

    if (!trimmedName) {
      errors.name = 'Informe o nome da empresa.';
    } else if (trimmedName.length > 100) {
      errors.name = 'Use no maximo 100 caracteres.';
    }

    if (!companyCnpj.trim()) {
      errors.cnpj = 'Informe o CNPJ.';
    } else if (!isValidCnpj(companyCnpj)) {
      errors.cnpj = 'Informe um CNPJ válido.';
    }

    return errors;
  }

  function validateCompanyField(field: CompanyValidationField) {
    const errors = getCompanyValidationErrors();

    setTouchedCompanyFields((current) => ({
      ...current,
      [field]: true,
    }));
    setCompanyErrors((current) => ({
      ...current,
      [field]: errors[field],
    }));

    return !errors[field];
  }

  async function handleSaveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const errors = getCompanyValidationErrors();

      if (Object.keys(errors).length > 0) {
        setCompanyErrors(errors);
        setTouchedCompanyFields({
          cnpj: true,
          name: true,
        });
        setFeedback(Object.values(errors)[0] ?? 'Revise os campos destacados.');
        return;
      }

      const payload = {
        dsEmpresa: companyName.trim(),
        caCNPJ: onlyDigits(companyCnpj),
        boInativo: isCompanyActive ? 0 : 1,
      };
      const response = await fetch(
        selectedCompanyId
          ? `${apiUrl}/companies/${selectedCompanyId}`
          : `${apiUrl}/companies`,
        {
          method: selectedCompanyId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar.');
      }

      const savedCompany = (await response.json()) as Company;
      setCompanies((current) => {
        if (selectedCompanyId) {
          return current.map((company) =>
            company.id === savedCompany.id ? savedCompany : company,
          );
        }

        return [...current, savedCompany].sort((a, b) =>
          a.dsEmpresa.localeCompare(b.dsEmpresa),
        );
      });
      setSelectedCompanyId(savedCompany.id);
      setIsCreating(false);
      setFeedback('Empresa salva com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  return (
    <div className="form-view">
      <div className="form-heading">
        <p className="section-label">Cadastro de Empresa</p>
      </div>

      <div className="registration-split-layout plan-split-layout">
        <section className="data-grid-section company-grid-section">
          <RegistrationGrid<Company>
            ariaLabel="Empresas cadastradas"
            label="Empresas"
            columns={[
              { label: 'Empresa', render: (c) => c.dsEmpresa },
              { label: 'CNPJ', render: (c) => formatCnpj(c.caCNPJ) },
              { label: 'Status', render: (c) => <span className={`status-badge ${c.boInativo === 0 ? 'active' : 'inactive'}`}>{c.boInativo === 0 ? 'Ativo' : 'Inativo'}</span> },
            ]}
            records={paginatedCompanies}
            isLoading={isLoadingCompanies}
            selectedId={selectedCompanyId}
            onSelect={handleSelectCompany}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            searchPlaceholder="Buscar empresa"
            onNew={handleNewCompany}
            page={companiesPage}
            totalItems={filteredCompanies.length}
            onPageChange={setCompaniesPage}
          />

          <section className="company-child-grid-section">
            {!childTableConfig ? (
              <div className="form-hint">Selecione uma tabela filha ao lado.</div>
            ) : !selectedCompanyId ? (
              <div className="form-hint">
                Selecione uma empresa para visualizar os registros filhos.
              </div>
            ) : (
              <RegistrationGrid<CompanyChildRecord>
                ariaLabel={childTableConfig.title}
                label={childTableConfig.label}
                columns={childTableConfig.columns.map((column) => ({
                  label: column.label,
                  render: (record) => formatChildCell(record, column, childLookups[column.key]),
                }))}
                records={filteredChildRecords}
                isLoading={isLoadingChildRecords}
                selectedId={selectedChildRecordId}
                onSelect={handleSelectChild}
                searchTerm={childSearchTerm}
                onSearch={setChildSearchTerm}
                onNew={handleNewChild}
                newDisabled={!selectedCompanyId}
                variant="child"
              />
            )}
          </section>
        </section>

        <div className="split-form-stack">
          <form
            className={`registration-form split-form-panel company-form-panel ${isCompanyFieldsCollapsed ? 'collapsed' : ''}`}
            onSubmit={handleSaveCompany}
          >
            <div className="collapsible-panel-header">
              <div>
                <p className="section-label">Empresa</p>
              </div>
              <button
                aria-expanded={!isCompanyFieldsCollapsed}
                className="secondary-button"
                onClick={() => setIsCompanyFieldsCollapsed((current) => !current)}
                type="button"
              >
                {isCompanyFieldsCollapsed ? '+' : '-'}
              </button>
            </div>

            {!isCompanyFieldsCollapsed ? (
              <>
                {!isFormEnabled ? (
                  <div className="form-hint">
                    Selecione uma empresa acima para editar ou clique em Nova empresa.
                  </div>
                ) : null}

                {feedback ? <div className="form-feedback">{feedback}</div> : null}

                <RegistrationField error={companyErrors.name} htmlFor="dsEmpresa" label="Empresa" touched={touchedCompanyFields.name}>
                  <input
                    className={touchedCompanyFields.name && companyErrors.name ? 'invalid' : ''}
                    disabled={!isFormEnabled}
                    id="dsEmpresa"
                    maxLength={100}
                    name="dsEmpresa"
                    onBlur={() => validateCompanyField('name')}
                    onChange={(event) => {
                      const value = event.target.value.slice(0, 100);
                      setCompanyName(value);

                      if (touchedCompanyFields.name) {
                        setCompanyErrors((current) => ({
                          ...current,
                          name: value.trim() ? undefined : 'Informe o nome da empresa.',
                        }));
                      }
                    }}
                    placeholder="Ex.: Academia Cliente"
                    ref={companyNameInputRef}
                    required
                    type="text"
                    value={companyName}
                  />
                </RegistrationField>

                <RegistrationField error={companyErrors.cnpj} htmlFor="caCNPJ" label="CNPJ" touched={touchedCompanyFields.cnpj}>
                  <input
                    className={touchedCompanyFields.cnpj && companyErrors.cnpj ? 'invalid' : ''}
                    disabled={!isFormEnabled}
                    id="caCNPJ"
                    maxLength={18}
                    name="caCNPJ"
                    onBlur={() => validateCompanyField('cnpj')}
                    onChange={(event) => {
                      const formattedCnpj = formatCnpj(event.target.value);
                      setCompanyCnpj(formattedCnpj);

                      if (touchedCompanyFields.cnpj) {
                        setCompanyErrors((current) => ({
                          ...current,
                          cnpj: isValidCnpj(formattedCnpj)
                            ? undefined
                            : 'Informe um CNPJ válido.',
                        }));
                      }
                    }}
                    placeholder="00.000.000/0000-00"
                    required
                    type="text"
                    value={companyCnpj}
                  />
                </RegistrationField>

                <RegistrationField htmlFor="empresaStatus" label="Status">
                  <button
                    aria-pressed={isCompanyActive}
                    className={`status-toggle ${isCompanyActive ? 'active' : ''}`}
                    disabled={!isFormEnabled}
                    id="empresaStatus"
                    onClick={handleToggleStatus}
                    type="button"
                  >
                    <span>{isCompanyActive ? 'Ativo' : 'Inativo'}</span>
                  </button>
                </RegistrationField>

                <div className="form-actions">
                  <button
                    className="secondary-button"
                    disabled={!isFormEnabled}
                    onClick={clearForm}
                    type="button"
                  >
                    Limpar
                  </button>
                  <button disabled={!isFormEnabled} type="submit">
                    <Save size={16} />
                    Salvar empresa
                  </button>
                </div>
              </>
            ) : null}
          </form>

          {childTableConfig ? (
            <form
              className={`registration-form split-form-panel company-child-form-panel ${isChildFieldsCollapsed ? 'collapsed' : ''}`}
              onSubmit={handleSaveChild}
            >
              <div className="collapsible-panel-header">
                <div>
                  <p className="section-label">{childTableConfig.label}</p>
                </div>
                <button
                  aria-expanded={!isChildFieldsCollapsed}
                  className="secondary-button"
                  onClick={() => setIsChildFieldsCollapsed((current) => !current)}
                  type="button"
                >
                  {isChildFieldsCollapsed ? '+' : '-'}
                </button>
              </div>

              {!isChildFieldsCollapsed ? (
                <>
                  {!selectedCompanyId ? (
                    <div className="form-hint">
                      Selecione uma empresa para preencher os campos filhos.
                    </div>
                  ) : null}

                  {childFeedback ? <div className="form-feedback">{childFeedback}</div> : null}

                  {isFileChildTable ? (
                    <>
                      <div className="company-child-fields">
                        {selectedChildTable === 'promotionFiles' ? (
                          <RegistrationField htmlFor="promotionFilePromotion" label="Promoção">
                            <select
                              disabled={!selectedCompanyId || isUploadingCompanyFile}
                              id="promotionFilePromotion"
                              onChange={(event) =>
                                setChildFormValues((current) => ({
                                  ...current,
                                  idPromocao: event.target.value,
                                }))
                              }
                              value={childFormValues.idPromocao ?? ''}
                            >
                              <option value="">Selecione</option>
                              {(childLookups.idPromocao ?? []).map((option) => (
                                <option key={option.id} value={option.id}>
                                  {getLookupLabel(option, {
                                    key: 'idPromocao',
                                    label: 'Promoção',
                                    lookupLabelKey: 'dsPromocao',
                                    type: 'number',
                                  })}
                                </option>
                              ))}
                            </select>
                          </RegistrationField>
                        ) : null}

                        <RegistrationField htmlFor="companyFileType" label="Tipo de arquivo">
                          <select
                            disabled={!selectedCompanyId || isUploadingCompanyFile}
                            id="companyFileType"
                            onChange={(event) =>
                              setChildFormValues((current) => ({
                                ...current,
                                idTiposArquivos: event.target.value,
                              }))
                            }
                            value={childFormValues.idTiposArquivos ?? ''}
                          >
                            <option value="">Selecione</option>
                            {(childLookups.idTiposArquivos ?? []).map((option) => (
                              <option key={option.id} value={option.id}>
                                {getLookupLabel(option, {
                                  key: 'idTiposArquivos',
                                  label: 'Tipo arquivo',
                                  lookupLabelKey: 'dsTipo',
                                  type: 'number',
                                })}
                              </option>
                            ))}
                          </select>
                        </RegistrationField>

                        <RegistrationField htmlFor="companyFileName" label="Arquivo selecionado">
                          <input
                            disabled
                            id="companyFileName"
                            type="text"
                            value={
                              selectedChildRecord
                                ? String(selectedChildRecord.dsArquivo ?? `Arquivo ${selectedChildRecord.id}`)
                                : 'Selecione no grid ou clique em Novo'
                            }
                          />
                        </RegistrationField>
                      </div>

                      <RegistrationField
                        error="Selecionar um novo arquivo vai alterar o arquivo selecionado."
                        htmlFor="companyFile"
                        label={selectedChildRecordId && !isCreatingChild ? 'Alterar arquivo' : 'Arquivo'}
                        touched={Boolean(selectedChildRecordId && !isCreatingChild)}
                      >
                        <div className="file-upload-controls">
                          <input
                            disabled={!selectedCompanyId || isUploadingCompanyFile}
                            id="companyFile"
                            onChange={(event) =>
                              void handleUploadCompanyFile(event.target.files?.[0] ?? null)
                            }
                            ref={companyFileInputRef}
                            type="file"
                          />
                        </div>
                      </RegistrationField>

                      {selectedChildRecord ? (
                        <div className="student-files-list">
                          <div className="student-file-row">
                            {companyFilePreviewUrls[selectedChildRecord.id] ? (
                              <button
                                className="file-preview-button"
                                onClick={() => void handleOpenCompanyFile(selectedChildRecord.id)}
                                type="button"
                              >
                                <img
                                  alt={String(
                                    selectedChildRecord.dsArquivo ??
                                    selectedChildRecord.anCaminho ??
                                    `Arquivo ${selectedChildRecord.id}`,
                                  )}
                                  className="student-file-preview"
                                  src={companyFilePreviewUrls[selectedChildRecord.id]}
                                />
                              </button>
                            ) : null}
                            <div className="student-file-row-info">
                              <strong>
                                {String(
                                  selectedChildRecord.dsArquivo ??
                                  selectedChildRecord.anCaminho ??
                                  `Arquivo ${selectedChildRecord.id}`,
                                )}
                              </strong>
                            </div>
                            <div className="student-file-actions">
                              <button
                                className="secondary-button"
                                onClick={() => void handleOpenCompanyFile(selectedChildRecord.id)}
                                type="button"
                              >
                                Visualizar
                              </button>
                              <button
                                className="secondary-button"
                                onClick={() => {
                                  companyFileInputRef.current?.click();
                                }}
                                type="button"
                              >
                                Alterar
                              </button>
                              <button
                                className="danger"
                                onClick={() => void handleRemoveCompanyFile(selectedChildRecord.id)}
                                type="button"
                              >
                                Remover
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : selectedCompanyId && childRecords.length === 0 ? (
                        <div className="empty-row">Nenhum arquivo anexado.</div>
                      ) : selectedCompanyId ? (
                        <div className="form-hint">Selecione um arquivo no grid para visualizar ou alterar.</div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className="company-child-fields" ref={companyChildFormRef}>
                        {childTableConfig.fields.map((field) => (
                          <RegistrationField htmlFor={`companyChild-${field.key}`} key={field.key} label={field.label} required={field.required}>
                            {field.lookupEndpoint ? (
                              <select
                                disabled={!isChildFormEnabled}
                                id={`companyChild-${field.key}`}
                                onChange={(event) =>
                                  setChildFormValues((current) => ({
                                    ...current,
                                    [field.key]: event.target.value,
                                  }))
                                }
                                required={field.required}
                                value={childFormValues[field.key] ?? ''}
                              >
                                <option value="">Selecione</option>
                                {(childLookups[field.key] ?? []).map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {getLookupLabel(option, field)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                disabled={!isChildFormEnabled}
                                id={`companyChild-${field.key}`}
                                onChange={(event) =>
                                  setChildFormValues((current) => ({
                                    ...current,
                                    [field.key]: event.target.value,
                                  }))
                                }
                                required={field.required}
                                type={field.type}
                                value={childFormValues[field.key] ?? ''}
                              />
                            )}
                          </RegistrationField>
                        ))}
                      </div>

                      {!isChildFormEnabled ? (
                        <div className="form-hint">
                          Selecione um registro filho acima ou clique em Novo.
                        </div>
                      ) : null}

                      <RegistrationField htmlFor="companyChildStatus" label="Status">
                        <button
                          aria-pressed={isChildActive}
                          className={`status-toggle ${isChildActive ? 'active' : ''}`}
                          disabled={!isChildFormEnabled}
                          id="companyChildStatus"
                          onClick={handleToggleChildStatus}
                          type="button"
                        >
                          <span>{isChildActive ? 'Ativo' : 'Inativo'}</span>
                        </button>
                      </RegistrationField>

                      <div className="form-actions">
                        <button
                          className="secondary-button"
                          disabled={!selectedCompanyId}
                          onClick={clearChildForm}
                          type="button"
                        >
                          Limpar
                        </button>
                        <button disabled={!isChildFormEnabled} type="submit">
                          <Save size={16} />
                          Salvar {childTableConfig.label}
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : null}
            </form>
          ) : null}
        </div>

        <section className="company-child-tabs" aria-label="Tabelas filhas da empresa">
          {/* <div className="company-child-tabs-header">
            <p className="section-label"></p>
            <h3>Filhas</h3>
          </div> */}

          <div className="company-child-tabs-list" role="tablist" aria-label="Tabelas filhas">
            {companyChildTables.map((table) => (
              <button
                aria-selected={selectedChildTable === table.key}
                className={selectedChildTable === table.key ? 'active' : ''}
                key={table.key}
                onClick={() => setSelectedChildTable(table.key)}
                role="tab"
                type="button"
              >
                {table.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      {companyFileModal ? (
        <div className="file-modal-overlay" role="dialog" aria-modal="true">
          <div className="file-modal">
            <div className="file-modal-header">
              <h3>{companyFileModal.title}</h3>
              <button
                aria-label="Fechar visualização"
                onClick={() => setCompanyFileModal(null)}
                type="button"
              >
                Fechar
              </button>
            </div>
            <img alt={companyFileModal.title} src={companyFileModal.url} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

