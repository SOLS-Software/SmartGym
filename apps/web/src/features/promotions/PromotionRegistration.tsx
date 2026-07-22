'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CreditCard, FileImage, Package, Save } from 'lucide-react';
import {
  GRID_PAGE_SIZE,
  formatChildCell,
  formatChildSearchValue,
  formatDateInput,
  getLookupLabel,
  isImageFile,
  paginateItems,
} from '../../shared/registration/registrationHelpers';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import { RegistrationTabs } from '../../shared/registration/RegistrationTabs';
import { useToast } from '../../shared/components/Toast';

const promotionTabIcons = { promotionPlans: CreditCard, promotionProducts: Package, promotionFiles: FileImage };
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
    labelSingular: 'Plano',
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
    labelSingular: 'Produto',
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
    labelSingular: 'Arquivo',
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
  const { showToast } = useToast();
  const promotionFileInputRef = useRef<HTMLInputElement | null>(null);
  const promotionNameInputRef = useRef<HTMLInputElement | null>(null);
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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  type DrawerMode = 'promotion' | 'related';
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('promotion');
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
  const [relatedFilePreviewUrls, setRelatedFilePreviewUrls] = useState<Record<number, string>>({});
  const [relatedFileModal, setRelatedFileModal] = useState<{ title: string; url: string } | null>(null);
  const [isUploadingRelatedFile, setIsUploadingRelatedFile] = useState(false);
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
      (promotion.boInativo === false ? 'ativo' : 'inativo').includes(search)
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

      setCompanies(((await companiesResponse.json()) as Company[]).filter((company) => company.boInativo === false));
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
  }, [searchTerm, selectedPromotionId]);

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
    setTimeout(() => promotionNameInputRef.current?.focus(), 0);
    setDrawerMode('promotion');
    setIsDrawerOpen(true);
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
    setDrawerMode('related');
    setIsDrawerOpen(true);
  }

  function handleSelectPromotion(promotion: Promotion) {
    if (promotion.id === selectedPromotionId) {
      clearForm();
      return;
    }

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
    setIsPromotionActive(promotion.boInativo === false);
    setFeedback('');
  }

  function handleEditPromotion(promotion: Promotion) {
    if (promotion.id !== selectedPromotionId) handleSelectPromotion(promotion);
    setDrawerMode('promotion');
    setIsDrawerOpen(true);
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
    setIsRelatedActive((record.boInativo ?? false) === false);
    setRelatedFeedback('');
  }

  function handleEditRelated(record: CompanyChildRecord) {
    if (record.id !== selectedRelatedRecordId) handleSelectRelatedRecord(record);
    setDrawerMode('related');
    setIsDrawerOpen(true);
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
        body: JSON.stringify({ boInativo: nextActive ? false : true }),
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
          body: JSON.stringify({ boInativo: nextActive ? false : true }),
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
        boInativo: isPromotionActive ? false : true,
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
      showToast('Promoção salva com sucesso.');
      setIsDrawerOpen(false);
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
      const payload = relatedConfig.fields.reduce<Record<string, string | number | boolean | null>>(
        (current, field) => {
          const value = relatedFormValues[field.key] ?? '';
          current[field.key] = field.type === 'number' ? (value ? Number(value) : null) : value;
          return current;
        },
        { boInativo: isRelatedActive ? false : true },
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
      setRelatedFeedback(`${relatedConfig.labelSingular ?? relatedConfig.label} salvo com sucesso.`);
      setIsDrawerOpen(false);
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
      setIsRelatedActive((saved.boInativo ?? false) === false);
      setRelatedFormValues({
        idTiposArquivos: saved.idTiposArquivos ? String(saved.idTiposArquivos) : '',
      });
      setRelatedFeedback(isReplacingFile ? 'Arquivo alterado com sucesso.' : 'Arquivo enviado com sucesso.');
      setIsDrawerOpen(false);
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
    <>
    <header className="module-page-header">
      <p className="section-label">Alunos</p>
      <h2 className="module-page-title">CADASTRO DE PROMOÇÕES</h2>
    </header>
    <div className="form-view company-view">

      <div className={`activity-page-layout${selectedPromotionId !== null ? ' has-related' : ''}`}>
        <section className="data-grid-section company-grid-section">
          <RegistrationGrid<Promotion>
            ariaLabel="Promoções cadastradas"
            label="Promoções"
            columns={[
              { label: 'Promoção', render: (p) => p.dsPromocao, sortValue: (p) => p.dsPromocao },
              { label: 'Empresa', render: (p) => getCompanyLabel(p.idEmpresa) },
              { label: 'Status', render: (p) => <span className={`status-badge ${p.boInativo === false ? 'active' : 'inactive'}`}>{p.boInativo === false ? 'Ativo' : 'Inativo'}</span>, sortValue: (p) => (p.boInativo === false ? 0 : 1) },
            ]}
            records={paginatedPromotions}
            isLoading={isLoadingPromotions}
            selectedId={selectedPromotionId}
            onSelect={handleSelectPromotion}
            onEdit={handleEditPromotion}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            searchPlaceholder="Buscar promoção"
            onNew={handleNewPromotion}
            page={promotionsPage}
            totalItems={filteredPromotions.length}
            onPageChange={setPromotionsPage}
          />
        </section>

        {selectedPromotionId !== null ? (
          <section className="data-grid-section">
            {relatedConfig ? (
              <RegistrationGrid<CompanyChildRecord>
                ariaLabel={relatedConfig.title}
                label={relatedConfig.label}
                columns={relatedConfig.columns.map((column) => ({
                  label: column.label,
                  render: (record) => formatChildCell(record, column, relatedLookups[column.key]),
                }))}
                records={filteredRelatedRecords}
                isLoading={isLoadingRelatedRecords}
                selectedId={selectedRelatedRecordId}
                onSelect={handleSelectRelatedRecord}
                onEdit={handleEditRelated}
                searchTerm={relatedSearchTerm}
                onSearch={setRelatedSearchTerm}
                onNew={handleNewRelated}
                newDisabled={!selectedPromotionId}
                variant="child"
              />
            ) : (
              <div className="form-hint">Selecione uma aba para ver os registros relacionados.</div>
            )}
          </section>
        ) : null}

        {selectedPromotionId !== null ? (
          <RegistrationTabs
            tabs={promotionRelatedTables}
            activeTab={selectedRelatedTable}
            onTabChange={(key) => { setSelectedRelatedTable(key); setRelatedFeedback(''); }}
            icons={promotionTabIcons}
            ariaLabel="Tabelas relacionadas da promoção"
          />
        ) : null}

        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title={drawerMode === 'promotion' ? (isCreating ? 'Nova Promoção' : 'Editar Promoção') : (relatedConfig?.label ?? 'Registro relacionado')}
          onClose={() => setIsDrawerOpen(false)}
        >
          {drawerMode === 'promotion' ? (
            <form className="drawer-fields" onSubmit={handleSavePromotion}>
              {feedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{feedback}</div> : null}
              <RegistrationField htmlFor="promotionCompany" label="Empresa" required size="lg">
                <select id="promotionCompany" onChange={(event) => setPromotionCompanyId(event.target.value)} required value={promotionCompanyId}>
                  <option value="">Selecione</option>
                  {companies.map((company) => (<option key={company.id} value={company.id}>{company.dsEmpresa}</option>))}
                </select>
              </RegistrationField>
              <RegistrationField htmlFor="promotionName" label="Promoção" required size="full">
                <input id="promotionName" maxLength={255} onChange={(event) => setPromotionName(event.target.value)} ref={promotionNameInputRef} required type="text" value={promotionName} />
              </RegistrationField>
              <RegistrationField htmlFor="periodAmount" label="Período" size="sm">
                <input id="periodAmount" min={0} onChange={(event) => setPeriodAmount(event.target.value)} type="number" value={periodAmount} />
              </RegistrationField>
              <RegistrationField htmlFor="timeUnit" label="Unidade de tempo" size="md">
                <select id="timeUnit" onChange={(event) => setTimeUnitId(event.target.value)} value={timeUnitId}>
                  <option value="">Selecione</option>
                  {timeUnits.map((timeUnit) => (<option key={timeUnit.id} value={timeUnit.id}>{getLookupLabel(timeUnit, { key: 'idUnidadeTempo', label: 'Unidade de tempo', lookupLabelKey: 'dsUnidadeTempo', type: 'number' })}</option>))}
                </select>
              </RegistrationField>
              <RegistrationField htmlFor="discountValue" label="Valor desconto" size="sm">
                <input id="discountValue" min={0} onChange={(event) => setDiscountValue(event.target.value)} step="0.01" type="number" value={discountValue} />
              </RegistrationField>
              <RegistrationField htmlFor="discountPercent" label="% desconto" size="sm">
                <input id="discountPercent" max={100} min={0} onChange={(event) => setDiscountPercent(event.target.value)} step="0.01" type="number" value={discountPercent} />
              </RegistrationField>
              <RegistrationField htmlFor="startDate" label="Início" size="sm">
                <input id="startDate" onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
              </RegistrationField>
              <RegistrationField htmlFor="endDate" label="Encerramento" size="sm">
                <input id="endDate" onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} />
              </RegistrationField>
              <RegistrationField htmlFor="promotionStatus" label="Status" size="sm">
                <button aria-pressed={isPromotionActive} className={`status-toggle ${isPromotionActive ? 'active' : ''}`} id="promotionStatus" onClick={handleTogglePromotionStatus} type="button">
                  <span>{isPromotionActive ? 'Ativo' : 'Inativo'}</span>
                </button>
              </RegistrationField>
              <div className="form-actions" style={{ flex: '1 1 100%' }}>
                <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
                <button type="submit"><Save size={16} />Salvar promoção</button>
              </div>
            </form>
          ) : (
            <form className="drawer-fields" onSubmit={handleSaveRelated}>
              {relatedFeedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{relatedFeedback}</div> : null}
              {isFileTable ? (
                <>
                  <RegistrationField htmlFor="promotionFileType" label="Tipo de arquivo" size="md">
                    <select disabled={!isRelatedFormEnabled || isUploadingRelatedFile} id="promotionFileType" onChange={(event) => setRelatedFormValues((current) => ({ ...current, idTiposArquivos: event.target.value }))} value={relatedFormValues.idTiposArquivos ?? ''}>
                      <option value="">Selecione</option>
                      {(relatedLookups.idTiposArquivos ?? []).map((option) => (<option key={option.id} value={option.id}>{getLookupLabel(option, relatedConfig!.fields[0]!)}</option>))}
                    </select>
                  </RegistrationField>
                  <RegistrationField htmlFor="promotionFileName" label="Arquivo selecionado" size="full">
                    <input disabled id="promotionFileName" type="text" value={selectedRelatedRecord ? String(selectedRelatedRecord.dsArquivo ?? `Arquivo ${selectedRelatedRecord.id}`) : ''} />
                  </RegistrationField>
                  <RegistrationField className="file-upload-field" htmlFor="promotionFileUpload" label={selectedRelatedRecordId && !isCreatingRelated ? 'Alterar arquivo' : 'Arquivo'} size="full">
                    <input disabled={!isRelatedFormEnabled || isUploadingRelatedFile} id="promotionFileUpload" onChange={handleUploadRelatedFile} ref={promotionFileInputRef} type="file" />
                  </RegistrationField>
                  {selectedRelatedRecord ? (
                    <div className="file-preview-card" style={{ flex: '1 1 100%' }}>
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
                        <button className="secondary-button" onClick={() => handleOpenRelatedFile(selectedRelatedRecord.id)} type="button">Visualizar</button>
                        <button className="secondary-button" onClick={() => handleRemoveRelatedFile(selectedRelatedRecord.id)} type="button">Remover</button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  {relatedConfig?.fields.map((field) => (
                    <RegistrationField htmlFor={`promotionRelated-${field.key}`} key={field.key} label={field.label} required={field.required} size="full">
                      {field.lookupEndpoint ? (
                        <select disabled={!isRelatedFormEnabled} id={`promotionRelated-${field.key}`} onChange={(event) => setRelatedFormValues((current) => ({ ...current, [field.key]: event.target.value }))} required={field.required} value={relatedFormValues[field.key] ?? ''}>
                          <option value="">Selecione</option>
                          {(relatedLookups[field.key] ?? []).map((option) => (<option key={option.id} value={option.id}>{getLookupLabel(option, field)}</option>))}
                        </select>
                      ) : (
                        <input disabled={!isRelatedFormEnabled} id={`promotionRelated-${field.key}`} onChange={(event) => setRelatedFormValues((current) => ({ ...current, [field.key]: event.target.value }))} required={field.required} type={field.type} value={relatedFormValues[field.key] ?? ''} />
                      )}
                    </RegistrationField>
                  ))}
                  <RegistrationField htmlFor="promotionRelatedStatus" label="Status" size="sm">
                    <button aria-pressed={isRelatedActive} className={`status-toggle ${isRelatedActive ? 'active' : ''}`} disabled={!isRelatedFormEnabled} id="promotionRelatedStatus" onClick={handleToggleRelatedStatus} type="button">
                      <span>{isRelatedActive ? 'Ativo' : 'Inativo'}</span>
                    </button>
                  </RegistrationField>
                </>
              )}
              <div className="form-actions" style={{ flex: '1 1 100%' }}>
                <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
                {!isFileTable ? (<button disabled={!isRelatedFormEnabled} type="submit"><Save size={16} />Salvar {relatedConfig?.labelSingular ?? relatedConfig?.label}</button>) : null}
              </div>
            </form>
          )}
        </RegistrationDrawer>
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
    </>
  );
}
