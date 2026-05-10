'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  GRID_PAGE_SIZE,
  GridPagination,
  formatChildCell,
  formatChildSearchValue,
  formatDateInput,
  getLookupLabel,
  isImageFile,
  paginateItems,
} from '../../shared/registration/registrationHelpers';
import type {
  Company,
  CompanyChildRecord,
  CompanyChildTable,
  LookupRecord,
  Promotion,
} from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

const promotionRelatedTables: CompanyChildTable[] = [
  {
    key: 'promotionPlans',
    endpoint: 'promotion-plans',
    label: 'Planos',
    title: 'Planos da promoção',
    columns: [
      { key: 'idEmpresa', label: 'Empresa', lookupLabelKey: 'dsEmpresa' },
      { key: 'idPlano', label: 'Plano', lookupLabelKey: 'dsPlano' },
      { key: 'qtDisponivel', label: 'Qtd disponível' },
      { key: 'dtInicio', label: 'Início', type: 'date' },
      { key: 'dtEncerramento', label: 'Encerramento', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'idPlano', label: 'Plano', type: 'number', lookupEndpoint: 'plans', lookupLabelKey: 'dsPlano', required: true },
      { key: 'qtDisponivel', label: 'Qtd disponível', type: 'number' },
      { key: 'dtInicio', label: 'Início', type: 'date' },
      { key: 'dtEncerramento', label: 'Encerramento', type: 'date' },
    ],
  },
  {
    key: 'promotionProducts',
    endpoint: 'promotion-products',
    label: 'Produtos',
    title: 'Produtos da promoção',
    columns: [
      { key: 'idEmpresa', label: 'Empresa', lookupLabelKey: 'dsEmpresa' },
      { key: 'idProduto', label: 'Produto', lookupLabelKey: 'dsProduto' },
      { key: 'qtDisponivel', label: 'Qtd disponível' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'idProduto', label: 'Produto', type: 'number', lookupEndpoint: 'products', lookupLabelKey: 'dsProduto', required: true },
      { key: 'qtDisponivel', label: 'Qtd disponível', type: 'number' },
    ],
  },
  {
    key: 'promotionFiles',
    endpoint: 'promotion-files',
    label: 'Arquivos',
    title: 'Arquivos da promoção',
    columns: [
      { key: 'dsArquivo', label: 'Arquivo' },
      { key: 'idTiposArquivos', label: 'Tipo', lookupLabelKey: 'dsTipo' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idTiposArquivos', label: 'Tipo de arquivo', type: 'number', lookupEndpoint: 'file-types', lookupLabelKey: 'dsTipo' },
    ],
  },
];

export function PromotionRegistration() {
  const promotionFileInputRef = useRef<HTMLInputElement | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [timeUnits, setTimeUnits] = useState<LookupRecord[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promotionsPage, setPromotionsPage] = useState(1);
  const [isLoadingPromotions, setIsLoadingPromotions] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [promotionCompanyId, setPromotionCompanyId] = useState('');
  const [selectedPromotionId, setSelectedPromotionId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [promotionName, setPromotionName] = useState('');
  const [periodAmount, setPeriodAmount] = useState('0');
  const [timeUnitId, setTimeUnitId] = useState('');
  const [discountValue, setDiscountValue] = useState('0');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isPromotionActive, setIsPromotionActive] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [isPromotionFieldsCollapsed, setIsPromotionFieldsCollapsed] = useState(false);
  const [selectedRelatedTable, setSelectedRelatedTable] = useState('');
  const [relatedRecords, setRelatedRecords] = useState<CompanyChildRecord[]>([]);
  const [isLoadingRelatedRecords, setIsLoadingRelatedRecords] = useState(false);
  const [relatedSearchTerm, setRelatedSearchTerm] = useState('');
  const [selectedRelatedRecordId, setSelectedRelatedRecordId] = useState<number | null>(null);
  const [isCreatingRelated, setIsCreatingRelated] = useState(false);
  const [relatedFormValues, setRelatedFormValues] = useState<Record<string, string>>({});
  const [isRelatedActive, setIsRelatedActive] = useState(true);
  const [relatedFeedback, setRelatedFeedback] = useState('');
  const [relatedLookups, setRelatedLookups] = useState<Record<string, LookupRecord[]>>({});
  const [isRelatedFieldsCollapsed, setIsRelatedFieldsCollapsed] = useState(false);
  const [relatedFilePreviewUrls, setRelatedFilePreviewUrls] = useState<Record<number, string>>({});
  const [relatedFileModal, setRelatedFileModal] = useState<{ title: string; url: string } | null>(null);
  const [isUploadingRelatedFile, setIsUploadingRelatedFile] = useState(false);
  const isFormEnabled = selectedPromotionId !== null || isCreating;
  const relatedConfig = promotionRelatedTables.find((table) => table.key === selectedRelatedTable) ?? null;
  const isFileTable = relatedConfig?.key === 'promotionFiles';
  const isRelatedFormEnabled = Boolean(selectedPromotionId) && (selectedRelatedRecordId !== null || isCreatingRelated);
  const selectedRelatedRecord = relatedRecords.find((record) => record.id === selectedRelatedRecordId);
  const filteredRelatedRecords = relatedRecords.filter((record) =>
    relatedConfig
      ? relatedConfig.columns.some((column) =>
        formatChildSearchValue(record, column, relatedLookups[column.key]).includes(relatedSearchTerm.toLowerCase()),
      )
      : false,
  );
  const filteredPromotions = promotions.filter((promotion) => {
    const search = searchTerm.toLowerCase();
    const company = companies.find((item) => item.id === promotion.idEmpresa);

    return (
      promotion.dsPromocao.toLowerCase().includes(search) ||
      String(company?.dsEmpresa ?? '').toLowerCase().includes(search) ||
      (promotion.boInativo === 0 ? 'ativo' : 'inativo').includes(search)
    );
  });
  const promotionsTotalPages = Math.max(1, Math.ceil(filteredPromotions.length / GRID_PAGE_SIZE));
  const paginatedPromotions = paginateItems(filteredPromotions, promotionsPage);

  async function loadLookups() {
    try {
      const [companiesResponse, timeUnitsResponse] = await Promise.all([
        fetch(`${apiUrl}/companies`),
        fetch(`${apiUrl}/time-units`),
      ]);

      const failedLookup = [companiesResponse, timeUnitsResponse].find((response) => !response.ok);
      if (failedLookup) {
        await getApiError(failedLookup, 'Nao foi possivel carregar empresas e unidades de tempo.');
      }

      setCompanies(((await companiesResponse.json()) as Company[]).filter((company) => company.boInativo === 0));
      setTimeUnits((await timeUnitsResponse.json()) as LookupRecord[]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar listas.');
    }
  }

  async function loadPromotions(companyId = selectedCompanyId) {
    try {
      setIsLoadingPromotions(true);
      const query = new URLSearchParams({ includeInactive: 'true' });
      if (companyId) {
        query.set('companyId', companyId);
      }
      const response = await fetch(`${apiUrl}/promotions?${query.toString()}`);

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar as promocoes.');
      }

      setPromotions((await response.json()) as Promotion[]);
      setFeedback('');
    } catch (error) {
      setPromotions([]);
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar promocoes.');
    } finally {
      setIsLoadingPromotions(false);
    }
  }

  async function loadRelatedRecords(promotionId = selectedPromotionId, config = relatedConfig) {
    if (!promotionId || !config) {
      setRelatedRecords([]);
      setIsLoadingRelatedRecords(false);
      return;
    }

    try {
      setIsLoadingRelatedRecords(true);
      const response = await fetch(`${apiUrl}/promotions/${promotionId}/related/${config.endpoint}`);

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar os registros relacionados.');
      }

      const data = (await response.json()) as CompanyChildRecord[];
      setRelatedRecords(data);
      setRelatedFilePreviewUrls({});

      if (config.key === 'promotionFiles') {
        const imageFiles = data.filter((file) => isImageFile(String(file.anCaminho ?? '')));
        const previewEntries = await Promise.all(
          imageFiles.map(async (file) => {
            const urlResponse = await fetch(
              `${apiUrl}/promotions/${promotionId}/related/promotion-files/${file.id}/url`,
            );
            if (!urlResponse.ok) return null;
            const urlData = (await urlResponse.json()) as { url?: string };
            return urlData.url ? ([file.id, urlData.url] as const) : null;
          }),
        );
        setRelatedFilePreviewUrls(
          Object.fromEntries(previewEntries.filter((entry): entry is readonly [number, string] => Boolean(entry))),
        );
      }
      setRelatedFeedback('');
    } catch (error) {
      setRelatedRecords([]);
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao carregar registros relacionados.');
    } finally {
      setIsLoadingRelatedRecords(false);
    }
  }

  useEffect(() => {
    void loadLookups();
  }, []);

  useEffect(() => {
    clearForm(false);
    void loadPromotions();
  }, [selectedCompanyId]);

  useEffect(() => {
    setPromotionsPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (promotionsPage > promotionsTotalPages) {
      setPromotionsPage(promotionsTotalPages);
    }
  }, [promotionsPage, promotionsTotalPages]);

  useEffect(() => {
    setSelectedRelatedRecordId(null);
    setIsCreatingRelated(false);
    setRelatedFormValues({});
    setIsRelatedActive(true);
    setRelatedSearchTerm('');
    void loadRelatedRecords();
  }, [selectedPromotionId, selectedRelatedTable]);

  useEffect(() => {
    async function loadRelatedLookups() {
      if (!relatedConfig) return;
      const lookupFields = relatedConfig.fields.filter((field) => field.lookupEndpoint);
      const nextLookups: Record<string, LookupRecord[]> = {};

      await Promise.all(
        lookupFields.map(async (field) => {
          if (!field.lookupEndpoint) return;
          const response = await fetch(`${apiUrl}/${field.lookupEndpoint}`);
          if (!response.ok) {
            await getApiError(response, `Nao foi possivel carregar ${field.label}.`);
          }
          nextLookups[field.key] = (await response.json()) as LookupRecord[];
        }),
      );

      setRelatedLookups((current) => ({ ...current, ...nextLookups }));
    }

    void loadRelatedLookups().catch((error) => {
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao carregar listas relacionadas.');
    });
  }, [relatedConfig]);

  function clearForm(clearFeedback = true) {
    setSelectedPromotionId(null);
    setIsCreating(false);
    setPromotionCompanyId('');
    setPromotionName('');
    setPeriodAmount('0');
    setTimeUnitId('');
    setDiscountValue('0');
    setDiscountPercent('0');
    setStartDate('');
    setEndDate('');
    setIsPromotionActive(true);

    if (clearFeedback) {
      setFeedback('');
    }
  }

  function clearRelatedForm() {
    setSelectedRelatedRecordId(null);
    setIsCreatingRelated(false);
    setRelatedFormValues({});
    setIsRelatedActive(true);
    if (promotionFileInputRef.current) {
      promotionFileInputRef.current.value = '';
    }
  }

  function handleNewPromotion() {
    clearForm();
    setIsCreating(true);
    setPromotionCompanyId(selectedCompanyId);
    setStartDate(new Date().toISOString().slice(0, 10));
  }

  function handleNewRelated() {
    setSelectedRelatedRecordId(null);
    setIsCreatingRelated(true);
    setRelatedFormValues({});
    setIsRelatedActive(true);
    setRelatedFeedback('');
    if (promotionFileInputRef.current) {
      promotionFileInputRef.current.value = '';
    }
  }

  function handleSelectPromotion(promotion: Promotion) {
    setSelectedPromotionId(promotion.id);
    setIsCreating(false);
    setPromotionCompanyId(promotion.idEmpresa ? String(promotion.idEmpresa) : '');
    setPromotionName(promotion.dsPromocao);
    setPeriodAmount(String(promotion.qtPeriodo ?? 0));
    setTimeUnitId(promotion.idUnidadeTempo ? String(promotion.idUnidadeTempo) : '');
    setDiscountValue(String(promotion.vlDesconto ?? 0));
    setDiscountPercent(String(promotion.pcDesconto ?? 0));
    setStartDate(formatDateInput(promotion.dtInicio));
    setEndDate(formatDateInput(promotion.dtEncerramento));
    setIsPromotionActive(promotion.boInativo === 0);
    setFeedback('');
  }

  function handleSelectRelatedRecord(record: CompanyChildRecord) {
    if (!relatedConfig) return;
    const values = relatedConfig.fields.reduce<Record<string, string>>((current, field) => {
      const value = record[field.key];
      current[field.key] = field.type === 'date' ? formatDateInput(String(value ?? '')) : String(value ?? '');
      return current;
    }, {});

    setSelectedRelatedRecordId(record.id);
    setIsCreatingRelated(false);
    setRelatedFormValues(values);
    setIsRelatedActive(Number(record.boInativo ?? 0) === 0);
    setRelatedFeedback('');
  }

  function getCompanyLabel(companyId: number | null) {
    return companies.find((company) => company.id === companyId)?.dsEmpresa ?? '-';
  }

  async function handleTogglePromotionStatus() {
    const nextActive = !isPromotionActive;
    setIsPromotionActive(nextActive);

    if (!selectedPromotionId) return;

    try {
      const response = await fetch(`${apiUrl}/promotions/${selectedPromotionId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: nextActive ? 0 : 1 }),
      });

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel alterar o status.');
      }

      const updated = (await response.json()) as Promotion;
      setPromotions((current) => current.map((promotion) => (promotion.id === updated.id ? updated : promotion)));
    } catch (error) {
      setIsPromotionActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleToggleRelatedStatus() {
    if (!relatedConfig) return;
    const nextActive = !isRelatedActive;
    setIsRelatedActive(nextActive);

    if (!selectedPromotionId || !selectedRelatedRecordId) return;

    try {
      const response = await fetch(
        `${apiUrl}/promotions/${selectedPromotionId}/related/${relatedConfig.endpoint}/${selectedRelatedRecordId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boInativo: nextActive ? 0 : 1 }),
        },
      );

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel alterar o status.');
      }

      const updated = (await response.json()) as CompanyChildRecord;
      setRelatedRecords((current) => current.map((record) => (record.id === updated.id ? updated : record)));
    } catch (error) {
      setIsRelatedActive(!nextActive);
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSavePromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!promotionCompanyId) {
      setFeedback('Selecione uma empresa para a promocao.');
      return;
    }

    if (!promotionName.trim()) {
      setFeedback('Informe a promocao.');
      return;
    }

    try {
      const payload = {
        dsPromocao: promotionName.trim(),
        qtPeriodo: Number(periodAmount || 0),
        idUnidadeTempo: timeUnitId ? Number(timeUnitId) : null,
        idEmpresa: Number(promotionCompanyId),
        vlDesconto: Number(discountValue || 0),
        pcDesconto: Number(discountPercent || 0),
        dtInicio: startDate || null,
        dtEncerramento: endDate || null,
        boInativo: isPromotionActive ? 0 : 1,
      };
      const response = await fetch(
        selectedPromotionId ? `${apiUrl}/promotions/${selectedPromotionId}` : `${apiUrl}/promotions`,
        {
          method: selectedPromotionId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel salvar a promocao.');
      }

      const saved = (await response.json()) as Promotion;
      await loadPromotions(selectedCompanyId);
      setSelectedPromotionId(saved.id);
      setIsCreating(false);
      setFeedback('Promocao salva com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar promocao.');
    }
  }

  async function handleSaveRelated(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!relatedConfig) {
      setRelatedFeedback('Selecione uma tabela relacionada antes de salvar.');
      return;
    }

    if (!selectedPromotionId) {
      setRelatedFeedback('Selecione uma promocao antes de salvar.');
      return;
    }

    try {
      const payload = relatedConfig.fields.reduce<Record<string, string | number | null>>(
        (current, field) => {
          const value = relatedFormValues[field.key] ?? '';
          current[field.key] = field.type === 'number' ? (value ? Number(value) : null) : value;
          return current;
        },
        { boInativo: isRelatedActive ? 0 : 1 },
      );

      const response = await fetch(
        selectedRelatedRecordId
          ? `${apiUrl}/promotions/${selectedPromotionId}/related/${relatedConfig.endpoint}/${selectedRelatedRecordId}`
          : `${apiUrl}/promotions/${selectedPromotionId}/related/${relatedConfig.endpoint}`,
        {
          method: selectedRelatedRecordId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel salvar o registro relacionado.');
      }

      const saved = (await response.json()) as CompanyChildRecord;
      await loadRelatedRecords(selectedPromotionId, relatedConfig);
      setSelectedRelatedRecordId(saved.id);
      setIsCreatingRelated(false);
      setRelatedFeedback(`${relatedConfig.label} salvo com sucesso.`);
    } catch (error) {
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao salvar registro relacionado.');
    }
  }

  async function handleUploadRelatedFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!selectedPromotionId) {
      setRelatedFeedback('Selecione uma promocao antes de enviar o arquivo.');
      return;
    }

    try {
      setIsUploadingRelatedFile(true);
      const formData = new FormData();
      formData.append('idTiposArquivos', relatedFormValues.idTiposArquivos ?? '');
      formData.append('file', file);

      const isReplacingFile = Boolean(selectedRelatedRecordId && !isCreatingRelated);
      const response = await fetch(
        isReplacingFile
          ? `${apiUrl}/promotions/${selectedPromotionId}/related/promotion-files/${selectedRelatedRecordId}`
          : `${apiUrl}/promotions/${selectedPromotionId}/related/promotion-files`,
        {
          method: isReplacingFile ? 'PUT' : 'POST',
          body: formData,
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel enviar o arquivo.');
      }

      const saved = (await response.json()) as CompanyChildRecord;
      await loadRelatedRecords(selectedPromotionId, relatedConfig);
      setSelectedRelatedRecordId(saved.id);
      setIsCreatingRelated(false);
      setIsRelatedActive(Number(saved.boInativo ?? 0) === 0);
      setRelatedFormValues({
        idTiposArquivos: saved.idTiposArquivos ? String(saved.idTiposArquivos) : '',
      });
      setRelatedFeedback(isReplacingFile ? 'Arquivo alterado com sucesso.' : 'Arquivo enviado com sucesso.');
    } catch (error) {
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao enviar arquivo.');
    } finally {
      setIsUploadingRelatedFile(false);
      event.target.value = '';
    }
  }

  async function handleOpenRelatedFile(fileId: number) {
    if (!selectedPromotionId) return;

    try {
      const response = await fetch(
        `${apiUrl}/promotions/${selectedPromotionId}/related/promotion-files/${fileId}/url`,
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel abrir o arquivo.');
      }

      const data = (await response.json()) as { url: string };
      const file = relatedRecords.find((record) => record.id === fileId);
      setRelatedFileModal({ title: String(file?.dsArquivo ?? `Arquivo ${fileId}`), url: data.url });
    } catch (error) {
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao abrir arquivo.');
    }
  }

  async function handleRemoveRelatedFile(fileId: number) {
    if (!selectedPromotionId) return;

    try {
      const response = await fetch(
        `${apiUrl}/promotions/${selectedPromotionId}/related/promotion-files/${fileId}`,
        { method: 'DELETE' },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel remover o arquivo.');
      }

      await loadRelatedRecords(selectedPromotionId, relatedConfig);
      clearRelatedForm();
      setRelatedFeedback('Arquivo removido com sucesso.');
    } catch (error) {
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao remover arquivo.');
    }
  }

  return (
    <div className="form-view company-view">
      <div className="form-heading">
        <p className="section-label">Promoções</p>
      </div>

      <div className="registration-split-layout plan-split-layout">
        <section className="data-grid-section company-grid-section">
          <div className="grid-toolbar">
            <div className="child-grid-toolbar-label">
              <p className="section-label">Promoções</p>
            </div>
            <div className="child-grid-toolbar-actions">
              <label className="search-field">
                <span>Pesquisar</span>
                <input
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar promoção"
                  type="search"
                  value={searchTerm}
                />
              </label>
              <button className="new-button" onClick={handleNewPromotion} type="button">
                Novo
              </button>
            </div>
          </div>

          <div className="product-table" key={`promotions-${searchTerm}-${promotionsPage}-${selectedCompanyId}`} role="table" aria-label="Promoções cadastradas">
            <div className="product-row header" role="row">
              <span role="columnheader">Promoção</span>
              <span role="columnheader">Empresa</span>
              <span role="columnheader">Status</span>
            </div>

            {isLoadingPromotions ? <div className="empty-row">Carregando promoções...</div> : null}

            {!isLoadingPromotions
              ? paginatedPromotions.map((promotion) => (
                <button
                  className={`product-row selectable ${promotion.id === selectedPromotionId ? 'selected' : ''}`}
                  key={promotion.id}
                  onClick={() => handleSelectPromotion(promotion)}
                  role="row"
                  type="button"
                >
                  <span role="cell">{promotion.dsPromocao}</span>
                  <span role="cell">{getCompanyLabel(promotion.idEmpresa)}</span>
                  <span role="cell">
                    <span className={`status-badge ${promotion.boInativo === 0 ? 'active' : 'inactive'}`}>
                      {promotion.boInativo === 0 ? 'Ativo' : 'Inativo'}
                    </span>
                  </span>
                </button>
              ))
              : null}

            {!isLoadingPromotions && filteredPromotions.length === 0 ? (
              <div className="empty-row">Nenhuma promoção encontrada.</div>
            ) : null}
          </div>

          <GridPagination onChange={setPromotionsPage} page={promotionsPage} totalItems={filteredPromotions.length} />

          {relatedConfig ? (
            <section className="company-child-grid-section">
              {!selectedPromotionId ? (
                <div className="form-hint">
                  Selecione uma promoção para visualizar os registros relacionados.
                </div>
              ) : (
                <>
                  <div className="grid-toolbar">
                    <div className="child-grid-toolbar-label">
                      <p className="section-label">{relatedConfig.label}</p>
                    </div>
                    <div className="child-grid-toolbar-actions">
                      <label className="search-field">
                        <span>Pesquisar</span>
                        <input
                          onChange={(event) => setRelatedSearchTerm(event.target.value)}
                          placeholder="Buscar registro"
                          type="search"
                          value={relatedSearchTerm}
                        />
                      </label>
                      <button className="new-button" disabled={!selectedPromotionId} onClick={handleNewRelated} type="button">
                        Novo
                      </button>
                    </div>
                  </div>

                  <div className="product-table company-child-grid-table" key={`promotion-related-${relatedConfig.key}-${relatedSearchTerm}-${selectedPromotionId}`} role="table" aria-label={relatedConfig.title}>
                    <div
                      className="product-row company-child-grid-row header"
                      role="row"
                      style={{ gridTemplateColumns: `repeat(${relatedConfig.columns.length}, minmax(0, 1fr))` }}
                    >
                      {relatedConfig.columns.map((column) => (
                        <span key={column.key} role="columnheader">
                          {column.label}
                        </span>
                      ))}
                    </div>

                    {isLoadingRelatedRecords ? <div className="empty-row">Carregando {relatedConfig.label.toLowerCase()}...</div> : null}

                    {!isLoadingRelatedRecords
                      ? filteredRelatedRecords.map((record) => (
                        <button
                          className={`product-row company-child-grid-row selectable ${record.id === selectedRelatedRecordId ? 'selected' : ''}`}
                          key={record.id}
                          onClick={() => handleSelectRelatedRecord(record)}
                          role="row"
                          style={{ gridTemplateColumns: `repeat(${relatedConfig.columns.length}, minmax(0, 1fr))` }}
                          type="button"
                        >
                          {relatedConfig.columns.map((column) => (
                            <span key={column.key} role="cell">
                              {formatChildCell(record, column, relatedLookups[column.key])}
                            </span>
                          ))}
                        </button>
                      ))
                      : null}

                    {!isLoadingRelatedRecords && filteredRelatedRecords.length === 0 ? (
                      <div className="empty-row">Nenhum registro de {relatedConfig.label.toLowerCase()} encontrado.</div>
                    ) : null}
                  </div>
                </>
              )}
            </section>
          ) : null}
        </section>

        <div className="split-form-stack">
          <form className={`registration-form split-form-panel company-form-panel ${isPromotionFieldsCollapsed ? 'collapsed' : ''}`} onSubmit={handleSavePromotion}>
            <div className="collapsible-panel-header">
              <div>
                <p className="section-label">Cadastro de Promoção</p>
              </div>
              <button aria-expanded={!isPromotionFieldsCollapsed} className="secondary-button" onClick={() => setIsPromotionFieldsCollapsed((current) => !current)} type="button">
                {isPromotionFieldsCollapsed ? '+' : '-'}
              </button>
            </div>

            {!isPromotionFieldsCollapsed ? (
              <>
                {!isFormEnabled ? <div className="form-hint">Selecione uma promoção acima ou clique em Novo.</div> : null}
                {feedback ? <div className="form-feedback">{feedback}</div> : null}

                <div className="field">
                  <label htmlFor="promotionCompany">Empresa *</label>
                  <select disabled={!isFormEnabled} id="promotionCompany" onChange={(event) => setPromotionCompanyId(event.target.value)} required value={promotionCompanyId}>
                    <option value="">Selecione</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.dsEmpresa}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="promotionName">Promoção *</label>
                  <input disabled={!isFormEnabled} id="promotionName" maxLength={255} onChange={(event) => setPromotionName(event.target.value)} required type="text" value={promotionName} />
                </div>

                <div className="field two-columns">
                  <div>
                    <label htmlFor="periodAmount">Período</label>
                    <input disabled={!isFormEnabled} id="periodAmount" onChange={(event) => setPeriodAmount(event.target.value)} type="number" value={periodAmount} />
                  </div>
                  <div>
                    <label htmlFor="timeUnit">Unidade de tempo</label>
                    <select disabled={!isFormEnabled} id="timeUnit" onChange={(event) => setTimeUnitId(event.target.value)} value={timeUnitId}>
                      <option value="">Selecione</option>
                      {timeUnits.map((timeUnit) => (
                        <option key={timeUnit.id} value={timeUnit.id}>
                          {getLookupLabel(timeUnit, {
                            key: 'idUnidadeTempo',
                            label: 'Unidade de tempo',
                            lookupLabelKey: 'dsUnidadeTempo',
                            type: 'number',
                          })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field two-columns">
                  <div>
                    <label htmlFor="discountValue">Valor desconto</label>
                    <input disabled={!isFormEnabled} id="discountValue" onChange={(event) => setDiscountValue(event.target.value)} step="0.01" type="number" value={discountValue} />
                  </div>
                  <div>
                    <label htmlFor="discountPercent">Percentual desconto</label>
                    <input disabled={!isFormEnabled} id="discountPercent" onChange={(event) => setDiscountPercent(event.target.value)} step="0.01" type="number" value={discountPercent} />
                  </div>
                </div>

                <div className="field two-columns">
                  <div>
                    <label htmlFor="startDate">Início</label>
                    <input disabled={!isFormEnabled} id="startDate" onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
                  </div>
                  <div>
                    <label htmlFor="endDate">Encerramento</label>
                    <input disabled={!isFormEnabled} id="endDate" onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="promotionStatus">Status</label>
                  <button aria-pressed={isPromotionActive} className={`status-toggle ${isPromotionActive ? 'active' : ''}`} disabled={!isFormEnabled} id="promotionStatus" onClick={handleTogglePromotionStatus} type="button">
                    <span>{isPromotionActive ? 'Ativo' : 'Inativo'}</span>
                  </button>
                </div>

                <div className="form-actions">
                  <button className="secondary-button" disabled={!isFormEnabled} onClick={() => clearForm()} type="button">
                    Limpar
                  </button>
                  <button disabled={!isFormEnabled} type="submit">
                    Salvar promoção
                  </button>
                </div>
              </>
            ) : null}
          </form>

          {relatedConfig ? (
            <form className={`registration-form split-form-panel company-child-form-panel ${isRelatedFieldsCollapsed ? 'collapsed' : ''}`} onSubmit={handleSaveRelated}>
              <div className="collapsible-panel-header">
                <div>
                  <p className="section-label">{relatedConfig.label}</p>
                </div>
                <button aria-expanded={!isRelatedFieldsCollapsed} className="secondary-button" onClick={() => setIsRelatedFieldsCollapsed((current) => !current)} type="button">
                  {isRelatedFieldsCollapsed ? '+' : '-'}
                </button>
              </div>

              {!isRelatedFieldsCollapsed ? (
                <>
                  {relatedFeedback ? <div className="form-feedback">{relatedFeedback}</div> : null}

                  {isFileTable ? (
                    <div className="company-child-fields">
                      <div className="field">
                        <label htmlFor="promotionFileType">Tipo de arquivo</label>
                        <select
                          disabled={!isRelatedFormEnabled}
                          id="promotionFileType"
                          onChange={(event) => setRelatedFormValues((current) => ({ ...current, idTiposArquivos: event.target.value }))}
                          value={relatedFormValues.idTiposArquivos ?? ''}
                        >
                          <option value="">Selecione</option>
                          {(relatedLookups.idTiposArquivos ?? []).map((option) => (
                            <option key={option.id} value={option.id}>
                              {getLookupLabel(option, relatedConfig.fields[0]!)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field">
                        <label htmlFor="promotionFileName">Arquivo selecionado</label>
                        <input disabled id="promotionFileName" type="text" value={selectedRelatedRecord ? String(selectedRelatedRecord.dsArquivo ?? `Arquivo ${selectedRelatedRecord.id}`) : ''} />
                      </div>

                      <div className="field file-upload-field">
                        <label htmlFor="promotionFileUpload">
                          {selectedRelatedRecordId && !isCreatingRelated ? 'Alterar arquivo' : 'Arquivo'}
                        </label>
                        <input disabled={!isRelatedFormEnabled || isUploadingRelatedFile} id="promotionFileUpload" onChange={handleUploadRelatedFile} ref={promotionFileInputRef} type="file" />
                      </div>

                      {selectedRelatedRecord ? (
                        <div className="file-preview-card">
                          {relatedFilePreviewUrls[selectedRelatedRecord.id] ? (
                            <button className="file-preview-button" onClick={() => handleOpenRelatedFile(selectedRelatedRecord.id)} type="button">
                              <img alt={String(selectedRelatedRecord.dsArquivo ?? `Arquivo ${selectedRelatedRecord.id}`)} src={relatedFilePreviewUrls[selectedRelatedRecord.id]} />
                            </button>
                          ) : (
                            <div className="file-preview-placeholder">
                              <strong>{String(selectedRelatedRecord.dsArquivo ?? `Arquivo ${selectedRelatedRecord.id}`)}</strong>
                            </div>
                          )}
                          <div className="file-preview-actions">
                            <button className="secondary-button" onClick={() => handleOpenRelatedFile(selectedRelatedRecord.id)} type="button">
                              Visualizar
                            </button>
                            <button className="secondary-button" onClick={() => handleRemoveRelatedFile(selectedRelatedRecord.id)} type="button">
                              Remover
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="company-child-fields">
                      {relatedConfig.fields.map((field) => (
                        <div className="field" key={field.key}>
                          <label htmlFor={`promotionRelated-${field.key}`}>
                            {field.label}
                            {field.required ? ' *' : ''}
                          </label>
                          {field.lookupEndpoint ? (
                            <select
                              disabled={!isRelatedFormEnabled}
                              id={`promotionRelated-${field.key}`}
                              onChange={(event) => setRelatedFormValues((current) => ({ ...current, [field.key]: event.target.value }))}
                              required={field.required}
                              value={relatedFormValues[field.key] ?? ''}
                            >
                              <option value="">Selecione</option>
                              {(relatedLookups[field.key] ?? []).map((option) => (
                                <option key={option.id} value={option.id}>
                                  {getLookupLabel(option, field)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              disabled={!isRelatedFormEnabled}
                              id={`promotionRelated-${field.key}`}
                              onChange={(event) => setRelatedFormValues((current) => ({ ...current, [field.key]: event.target.value }))}
                              required={field.required}
                              type={field.type}
                              value={relatedFormValues[field.key] ?? ''}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {!isRelatedFormEnabled ? <div className="form-hint">Selecione um registro relacionado acima ou clique em Novo.</div> : null}

                  {!isFileTable ? (
                    <div className="field">
                      <label htmlFor="promotionRelatedStatus">Status</label>
                      <button aria-pressed={isRelatedActive} className={`status-toggle ${isRelatedActive ? 'active' : ''}`} disabled={!isRelatedFormEnabled} id="promotionRelatedStatus" onClick={handleToggleRelatedStatus} type="button">
                        <span>{isRelatedActive ? 'Ativo' : 'Inativo'}</span>
                      </button>
                    </div>
                  ) : null}

                  <div className="form-actions">
                    <button className="secondary-button" disabled={!selectedPromotionId} onClick={clearRelatedForm} type="button">
                      Limpar
                    </button>
                    {!isFileTable ? (
                      <button disabled={!isRelatedFormEnabled} type="submit">
                        Salvar {relatedConfig.label}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </form>
          ) : null}
        </div>

        <section className="company-child-tabs" aria-label="Tabelas relacionadas da promoção">
          <div className="company-child-tabs-list" role="tablist" aria-label="Tabelas relacionadas da promoção">
            {promotionRelatedTables.map((table) => (
              <button
                aria-selected={selectedRelatedTable === table.key}
                className={selectedRelatedTable === table.key ? 'active' : ''}
                key={table.key}
                onClick={() => {
                  setSelectedRelatedTable(table.key);
                  setRelatedFeedback('');
                }}
                role="tab"
                type="button"
              >
                {table.label}
              </button>
            ))}
          </div>
        </section>
      </div>
      {relatedFileModal ? (
        <div className="file-modal-overlay" role="dialog" aria-modal="true">
          <div className="file-modal">
            <div className="file-modal-header">
              <h3>{relatedFileModal.title}</h3>
              <button onClick={() => setRelatedFileModal(null)} type="button">
                Fechar
              </button>
            </div>
            <img alt={relatedFileModal.title} src={relatedFileModal.url} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
