'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Activity, Building2, CreditCard, DollarSign, Package, Save, Tag } from 'lucide-react';
import { GRID_PAGE_SIZE, formatChildCell, formatChildSearchValue, formatDateInput, getLookupLabel, isImageFile, paginateItems } from '../../shared/registration/registrationHelpers';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import { RegistrationTabs } from '../../shared/registration/RegistrationTabs';
import type { CompanyChildRecord, CompanyChildTable, Frequency, LookupRecord, Plan } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

const planTabIcons = { values: DollarSign, products: Package, companies: Building2, activities: Activity, promotionPlans: Tag, promotionProducts: CreditCard };

const planRelatedTables: CompanyChildTable[] = [
  {
    key: 'values',
    endpoint: 'values',
    label: 'Valores',
    title: 'Valores do plano',
    columns: [
      { key: 'idEmpresa', label: 'Empresa', lookupLabelKey: 'dsEmpresa' },
      { key: 'vlVenda', label: 'Valor', type: 'money' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'vlVenda', label: 'Valor de venda', type: 'number' },
    ],
  },
  {
    key: 'products',
    endpoint: 'products',
    label: 'Produtos',
    title: 'Produtos do plano',
    columns: [
      { key: 'idEmpresa', label: 'Empresa', lookupLabelKey: 'dsEmpresa' },
      { key: 'idProduto', label: 'Produto', lookupLabelKey: 'dsProduto' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'idProduto', label: 'Produto', type: 'number', lookupEndpoint: 'products', lookupLabelKey: 'dsProduto' },
    ],
  },
  {
    key: 'companies',
    endpoint: 'companies',
    label: 'Empresas',
    title: 'Empresas do plano',
    columns: [
      { key: 'idEmpresa', label: 'Empresa', lookupLabelKey: 'dsEmpresa' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
    ],
  },
  {
    key: 'activities',
    endpoint: 'activities',
    label: 'Atividades',
    title: 'Atividades do plano',
    columns: [
      { key: 'idEmpresa', label: 'Empresa', lookupLabelKey: 'dsEmpresa' },
      { key: 'idAtividade', label: 'Atividade', lookupLabelKey: 'dsAtividade' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'idAtividade', label: 'Atividade', type: 'number', lookupEndpoint: 'activities', lookupLabelKey: 'dsAtividade' },
    ],
  },
  {
    key: 'promotionPlans',
    endpoint: 'promotion-plans',
    label: 'Promoções',
    title: 'Promoções do plano',
    columns: [
      { key: 'idEmpresa', label: 'Empresa', lookupLabelKey: 'dsEmpresa' },
      { key: 'idPromocao', label: 'Promoção', lookupLabelKey: 'dsPromocao' },
      { key: 'qtDisponivel', label: 'Qtd disponível' },
      { key: 'dtInicio', label: 'Início', type: 'date' },
      { key: 'dtEncerramento', label: 'Encerramento', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'idPromocao', label: 'Promoção', type: 'number', lookupEndpoint: 'promotions', lookupLabelKey: 'dsPromocao' },
      { key: 'qtDisponivel', label: 'Qtd disponível', type: 'number' },
      { key: 'dtInicio', label: 'Início', type: 'date' },
      { key: 'dtEncerramento', label: 'Encerramento', type: 'date' },
    ],
  },
  {
    key: 'promotionProducts',
    endpoint: 'promotion-products',
    label: 'Produtos Promoção',
    title: 'Produtos de promoção do plano',
    columns: [
      { key: 'idEmpresa', label: 'Empresa', lookupLabelKey: 'dsEmpresa' },
      { key: 'idPromocao', label: 'Promoção', lookupLabelKey: 'dsPromocao' },
      { key: 'idProduto', label: 'Produto', lookupLabelKey: 'dsProduto' },
      { key: 'qtDisponivel', label: 'Qtd disponível' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'idPromocao', label: 'Promoção', type: 'number', lookupEndpoint: 'promotions', lookupLabelKey: 'dsPromocao', required: true },
      { key: 'idProduto', label: 'Produto', type: 'number', lookupEndpoint: 'products', lookupLabelKey: 'dsProduto', required: true },
      { key: 'qtDisponivel', label: 'Qtd disponível', type: 'number' },
    ],
  },
  {
    key: 'promotionFiles',
    endpoint: 'promotion-files',
    label: 'Arquivos Promoção',
    title: 'Arquivos de promoção do plano',
    columns: [
      { key: 'idPromocao', label: 'Promoção', lookupLabelKey: 'dsPromocao' },
      { key: 'dsArquivo', label: 'Arquivo' },
      { key: 'idTiposArquivos', label: 'Tipo', lookupLabelKey: 'dsTipo' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idPromocao', label: 'Promoção', type: 'number', lookupEndpoint: 'promotions', lookupLabelKey: 'dsPromocao', required: true },
      { key: 'idTiposArquivos', label: 'Tipo de arquivo', type: 'number', lookupEndpoint: 'file-types', lookupLabelKey: 'dsTipo' },
    ],
  },
];

export function PlanRegistration() {
  const planFileInputRef = useRef<HTMLInputElement | null>(null);
  const planNameInputRef = useRef<HTMLInputElement | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansPage, setPlansPage] = useState(1);
  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planFrequencyId, setPlanFrequencyId] = useState('');
  const [isPlanActive, setIsPlanActive] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  type DrawerMode = 'plan' | 'related';
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('plan');
  const [selectedPlanRelatedTable, setSelectedPlanRelatedTable] = useState('');
  const [planRelatedRecords, setPlanRelatedRecords] = useState<CompanyChildRecord[]>([]);
  const [isLoadingPlanRelatedRecords, setIsLoadingPlanRelatedRecords] = useState(false);
  const [planRelatedSearchTerm, setPlanRelatedSearchTerm] = useState('');
  const [selectedPlanRelatedRecordId, setSelectedPlanRelatedRecordId] = useState<number | null>(null);
  const [isCreatingPlanRelated, setIsCreatingPlanRelated] = useState(false);
  const [planRelatedFormValues, setPlanRelatedFormValues] = useState<Record<string, string>>({});
  const [isPlanRelatedActive, setIsPlanRelatedActive] = useState(true);
  const [planRelatedFeedback, setPlanRelatedFeedback] = useState('');
  const [planRelatedLookups, setPlanRelatedLookups] = useState<Record<string, LookupRecord[]>>({});
  const [planRelatedFilePreviewUrls, setPlanRelatedFilePreviewUrls] = useState<Record<number, string>>({});
  const [planRelatedFileModal, setPlanRelatedFileModal] = useState<{ title: string; url: string } | null>(null);
  const [isUploadingPlanRelatedFile, setIsUploadingPlanRelatedFile] = useState(false);
  const isPlanRelatedFormEnabled =
    Boolean(selectedPlanId) && (selectedPlanRelatedRecordId !== null || isCreatingPlanRelated);
  const planRelatedConfig =
    planRelatedTables.find((table) => table.key === selectedPlanRelatedTable) ?? null;
  const isPlanRelatedFileTable = planRelatedConfig?.key === 'promotionFiles';
  const selectedPlanRelatedRecord = planRelatedRecords.find(
    (record) => record.id === selectedPlanRelatedRecordId,
  );
  const filteredPlanRelatedRecords = planRelatedRecords.filter((record) =>
    planRelatedConfig
      ? planRelatedConfig.columns.some((column) =>
        formatChildSearchValue(
          record,
          column,
          planRelatedLookups[column.key],
        ).includes(planRelatedSearchTerm.toLowerCase()),
      )
      : false,
  );
  const filteredPlans = plans.filter((plan) => {
    const search = searchTerm.toLowerCase();
    const frequency = frequencies.find((item) => item.id === plan.idFrequencia);

    return (
      plan.dsPlano.toLowerCase().includes(search) ||
      String(plan.idFrequencia ?? '').includes(searchTerm) ||
      String(frequency?.dsFrequencia ?? '').toLowerCase().includes(search) ||
      (plan.boInativo === 0 ? 'ativo' : 'inativo').includes(search)
    );
  });
  const plansTotalPages = Math.max(1, Math.ceil(filteredPlans.length / GRID_PAGE_SIZE));
  const paginatedPlans = paginateItems(filteredPlans, plansPage);

  async function loadPlans() {
    try {
      setIsLoadingPlans(true);
      const response = await fetch(`${apiUrl}/plans?includeInactive=true`);

      if (!response.ok) {
        await getApiError(response, 'Não foi possível carregar os planos.');
      }

      const data = (await response.json()) as Plan[];
      setPlans(data);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar planos.');
    } finally {
      setIsLoadingPlans(false);
    }
  }

  async function loadFrequencies() {
    try {
      const response = await fetch(`${apiUrl}/frequencies`);

      if (!response.ok) {
        await getApiError(response, 'Não foi possível carregar as frequências.');
      }

      setFrequencies((await response.json()) as Frequency[]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar frequências.');
    }
  }

  async function loadPlanRelatedRecords(
    planId = selectedPlanId,
    config = planRelatedConfig,
  ) {
    if (!config || !planId) {
      setPlanRelatedRecords([]);
      setIsLoadingPlanRelatedRecords(false);
      return;
    }

    try {
      setIsLoadingPlanRelatedRecords(true);
      const response = await fetch(`${apiUrl}/plans/${planId}/related/${config.endpoint}`);

      if (!response.ok) {
        await getApiError(response, 'Não foi possível carregar os registros relacionados.');
      }

      const data = (await response.json()) as CompanyChildRecord[];
      setPlanRelatedRecords(data);
      setPlanRelatedFilePreviewUrls({});

      if (config.key === 'promotionFiles') {
        const imageFiles = data.filter((file) => isImageFile(String(file.anCaminho ?? '')));
        const previewEntries = await Promise.all(
          imageFiles.map(async (file) => {
            const urlResponse = await fetch(
              `${apiUrl}/plans/${planId}/related/promotion-files/${file.id}/url`,
            );

            if (!urlResponse.ok) {
              return null;
            }

            const urlData = (await urlResponse.json()) as { url?: string };
            return urlData.url ? ([file.id, urlData.url] as const) : null;
          }),
        );

        setPlanRelatedFilePreviewUrls(
          Object.fromEntries(previewEntries.filter((entry): entry is readonly [number, string] => Boolean(entry))),
        );
      }
      setPlanRelatedFeedback('');
    } catch (error) {
      setPlanRelatedFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar registros relacionados.',
      );
      setPlanRelatedRecords([]);
    } finally {
      setIsLoadingPlanRelatedRecords(false);
    }
  }

  useEffect(() => {
    void loadPlans();
    void loadFrequencies();
  }, []);

  useEffect(() => {
    setSelectedPlanRelatedRecordId(null);
    setIsCreatingPlanRelated(false);
    setPlanRelatedFormValues({});
    setIsPlanRelatedActive(true);
    setPlanRelatedSearchTerm('');
    void loadPlanRelatedRecords();
  }, [selectedPlanId, selectedPlanRelatedTable]);

  useEffect(() => {
    async function loadPlanRelatedLookups() {
      if (!planRelatedConfig) {
        return;
      }

      const lookupFields = planRelatedConfig.fields.filter((field) => field.lookupEndpoint);
      const nextLookups: Record<string, LookupRecord[]> = {};

      await Promise.all(
        lookupFields.map(async (field) => {
          if (!field.lookupEndpoint) {
            return;
          }

          const response = await fetch(`${apiUrl}/${field.lookupEndpoint}`);

          if (!response.ok) {
            await getApiError(response, `Não foi possível carregar ${field.label}.`);
          }

          nextLookups[field.key] = (await response.json()) as LookupRecord[];
        }),
      );

      setPlanRelatedLookups((current) => ({
        ...current,
        ...nextLookups,
      }));
    }

    void loadPlanRelatedLookups().catch((error) => {
      setPlanRelatedFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar listas relacionadas.',
      );
    });
  }, [planRelatedConfig]);

  useEffect(() => {
    setPlansPage(1);
  }, [searchTerm, selectedPlanId]);

  useEffect(() => {
    if (plansPage > plansTotalPages) {
      setPlansPage(plansTotalPages);
    }
  }, [plansPage, plansTotalPages]);

  function clearForm() {
    setSelectedPlanId(null);
    setIsCreating(false);
    setPlanName('');
    setPlanFrequencyId('');
    setIsPlanActive(true);
    setFeedback('');
  }

  function handleNewPlan() {
    clearForm();
    setIsCreating(true);
    setIsPlanActive(true);
    setDrawerMode('plan');
    setIsDrawerOpen(true);
    setTimeout(() => planNameInputRef.current?.focus(), 0);
  }

  function handleSelectPlan(plan: Plan) {
    if (plan.id === selectedPlanId) {
      clearForm();
      return;
    }

    setSelectedPlanId(plan.id);
    setIsCreating(false);
    setPlanName(plan.dsPlano);
    setPlanFrequencyId(plan.idFrequencia ? String(plan.idFrequencia) : '');
    setIsPlanActive(plan.boInativo === 0);
    setFeedback('');
  }

  function handleEditPlan(plan: Plan) {
    if (plan.id !== selectedPlanId) handleSelectPlan(plan);
    setDrawerMode('plan');
    setIsDrawerOpen(true);
  }

  function handleSelectPlanRelatedTable(tableKey: string) {
    setSelectedPlanRelatedTable(tableKey);
    setPlanRelatedFeedback('');
  }

  function clearPlanRelatedForm() {
    setSelectedPlanRelatedRecordId(null);
    setIsCreatingPlanRelated(false);
    setPlanRelatedFormValues({});
    setIsPlanRelatedActive(true);
    if (planFileInputRef.current) {
      planFileInputRef.current.value = '';
    }
  }

  function handleNewPlanRelated() {
    setSelectedPlanRelatedRecordId(null);
    setIsCreatingPlanRelated(true);
    setPlanRelatedFormValues({});
    setIsPlanRelatedActive(true);
    setPlanRelatedFeedback('');
    if (planFileInputRef.current) {
      planFileInputRef.current.value = '';
    }
    setDrawerMode('related');
    setIsDrawerOpen(true);
  }

  function handleSelectPlanRelatedRecord(record: CompanyChildRecord) {
    if (!planRelatedConfig) {
      return;
    }

    const values = planRelatedConfig.fields.reduce<Record<string, string>>((current, field) => {
      const value = record[field.key];
      current[field.key] = field.type === 'date' ? formatDateInput(String(value ?? '')) : String(value ?? '');
      return current;
    }, {});

    setSelectedPlanRelatedRecordId(record.id);
    setIsCreatingPlanRelated(false);
    setPlanRelatedFormValues(values);
    setIsPlanRelatedActive(Number(record.boInativo ?? 0) === 0);
    setPlanRelatedFeedback('');
  }

  function handleEditPlanRelated(record: CompanyChildRecord) {
    if (record.id !== selectedPlanRelatedRecordId) handleSelectPlanRelatedRecord(record);
    setDrawerMode('related');
    setIsDrawerOpen(true);
  }

  async function handleTogglePlanStatus() {
    const nextActive = !isPlanActive;
    setIsPlanActive(nextActive);

    if (!selectedPlanId) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/plans/${selectedPlanId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          boInativo: nextActive ? 0 : 1,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível alterar o status.');
      }

      await loadPlans();
      setFeedback('Status do plano atualizado.');
    } catch (error) {
      setIsPlanActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSavePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!planName.trim()) {
      setFeedback('Informe o nome do plano.');
      return;
    }

    try {
      const payload = {
        dsPlano: planName.trim(),
        idFrequencia: planFrequencyId ? Number(planFrequencyId) : null,
        boInativo: isPlanActive ? 0 : 1,
      };
      const response = await fetch(
        isCreating ? `${apiUrl}/plans` : `${apiUrl}/plans/${selectedPlanId}`,
        {
          method: isCreating ? 'POST' : 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar o plano.');
      }

      const savedPlan = (await response.json()) as Plan;
      await loadPlans();
      setSelectedPlanId(savedPlan.id);
      setIsCreating(false);
      setFeedback('Plano salvo com sucesso.');
      setIsDrawerOpen(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar plano.');
    }
  }

  async function handleTogglePlanRelatedStatus() {
    if (!planRelatedConfig) {
      return;
    }

    const nextActive = !isPlanRelatedActive;
    setIsPlanRelatedActive(nextActive);

    if (!selectedPlanId || !selectedPlanRelatedRecordId) {
      return;
    }

    try {
      const response = await fetch(
        `${apiUrl}/plans/${selectedPlanId}/related/${planRelatedConfig.endpoint}/${selectedPlanRelatedRecordId}/status`,
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
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível alterar o status.');
      }

      const updated = (await response.json()) as CompanyChildRecord;
      setPlanRelatedRecords((current) =>
        current.map((record) => (record.id === updated.id ? updated : record)),
      );
    } catch (error) {
      setIsPlanRelatedActive(!nextActive);
      setPlanRelatedFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleUploadPlanRelatedFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!selectedPlanId) {
      setPlanRelatedFeedback('Selecione um plano antes de enviar o arquivo.');
      return;
    }

    if (!planRelatedFormValues.idPromocao) {
      setPlanRelatedFeedback('Informe a promoção antes de enviar o arquivo.');
      event.target.value = '';
      return;
    }

    try {
      setIsUploadingPlanRelatedFile(true);
      const formData = new FormData();
      formData.append('idPromocao', planRelatedFormValues.idPromocao);
      formData.append('idTiposArquivos', planRelatedFormValues.idTiposArquivos ?? '');
      formData.append('file', file);

      const isReplacingFile = Boolean(selectedPlanRelatedRecordId && !isCreatingPlanRelated);
      const response = await fetch(
        isReplacingFile
          ? `${apiUrl}/plans/${selectedPlanId}/related/promotion-files/${selectedPlanRelatedRecordId}`
          : `${apiUrl}/plans/${selectedPlanId}/related/promotion-files`,
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
      await loadPlanRelatedRecords(selectedPlanId, planRelatedConfig);
      setSelectedPlanRelatedRecordId(saved.id);
      setIsCreatingPlanRelated(false);
      setIsPlanRelatedActive(Number(saved.boInativo ?? 0) === 0);
      setPlanRelatedFormValues({
        idPromocao: saved.idPromocao ? String(saved.idPromocao) : '',
        idTiposArquivos: saved.idTiposArquivos ? String(saved.idTiposArquivos) : '',
      });
      setPlanRelatedFeedback(isReplacingFile ? 'Arquivo alterado com sucesso.' : 'Arquivo enviado com sucesso.');
      setIsDrawerOpen(false);
    } catch (error) {
      setPlanRelatedFeedback(error instanceof Error ? error.message : 'Erro ao enviar arquivo.');
    } finally {
      setIsUploadingPlanRelatedFile(false);
      event.target.value = '';
    }
  }

  async function handleOpenPlanRelatedFile(fileId: number) {
    if (!selectedPlanId) {
      return;
    }

    try {
      const response = await fetch(
        `${apiUrl}/plans/${selectedPlanId}/related/promotion-files/${fileId}/url`,
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível abrir o arquivo.');
      }

      const data = (await response.json()) as { url: string };
      const file = planRelatedRecords.find((record) => record.id === fileId);
      setPlanRelatedFileModal({ title: String(file?.dsArquivo ?? `Arquivo ${fileId}`), url: data.url });
    } catch (error) {
      setPlanRelatedFeedback(error instanceof Error ? error.message : 'Erro ao abrir arquivo.');
    }
  }

  async function handleRemovePlanRelatedFile(fileId: number) {
    if (!selectedPlanId) {
      return;
    }

    try {
      const response = await fetch(
        `${apiUrl}/plans/${selectedPlanId}/related/promotion-files/${fileId}`,
        { method: 'DELETE' },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível remover o arquivo.');
      }

      await loadPlanRelatedRecords(selectedPlanId, planRelatedConfig);
      clearPlanRelatedForm();
      setPlanRelatedFeedback('Arquivo removido com sucesso.');
    } catch (error) {
      setPlanRelatedFeedback(error instanceof Error ? error.message : 'Erro ao remover arquivo.');
    }
  }

  async function handleSavePlanRelated(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!planRelatedConfig) {
      setPlanRelatedFeedback('Selecione uma tabela relacionada antes de salvar.');
      return;
    }

    if (!selectedPlanId) {
      setPlanRelatedFeedback('Selecione um plano antes de salvar.');
      return;
    }

    try {
      const payload = planRelatedConfig.fields.reduce<Record<string, string | number | null>>(
        (current, field) => {
          const value = planRelatedFormValues[field.key] ?? '';
          current[field.key] = field.type === 'number' ? (value ? Number(value) : null) : value;
          return current;
        },
        {
          boInativo: isPlanRelatedActive ? 0 : 1,
        },
      );

      const response = await fetch(
        selectedPlanRelatedRecordId
          ? `${apiUrl}/plans/${selectedPlanId}/related/${planRelatedConfig.endpoint}/${selectedPlanRelatedRecordId}`
          : `${apiUrl}/plans/${selectedPlanId}/related/${planRelatedConfig.endpoint}`,
        {
          method: selectedPlanRelatedRecordId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar o registro relacionado.');
      }

      const saved = (await response.json()) as CompanyChildRecord;
      await loadPlanRelatedRecords(selectedPlanId, planRelatedConfig);
      setSelectedPlanRelatedRecordId(saved.id);
      setIsCreatingPlanRelated(false);
      setPlanRelatedFeedback(`${planRelatedConfig.label} salvo com sucesso.`);
      setIsDrawerOpen(false);
    } catch (error) {
      setPlanRelatedFeedback(error instanceof Error ? error.message : 'Erro ao salvar registro relacionado.');
    }
  }

  function getFrequencyLabel(frequencyId: number | null) {
    const frequency = frequencies.find((item) => item.id === frequencyId);
    return frequency?.dsFrequencia ? String(frequency.dsFrequencia) : '-';
  }

  return (
    <div className={`activity-page-layout${selectedPlanId !== null ? ' has-related' : ''}`}>
      <section className="data-grid-section company-grid-section">
        <RegistrationGrid<Plan>
          ariaLabel="Planos cadastrados"
          columns={[
            { label: 'Plano', render: (plan) => plan.dsPlano },
            { label: 'Frequência', render: (plan) => getFrequencyLabel(plan.idFrequencia) },
            {
              label: 'Status', render: (plan) => (
                <span className={`status-badge ${plan.boInativo === 0 ? 'active' : 'inactive'}`}>
                  {plan.boInativo === 0 ? 'Ativo' : 'Inativo'}
                </span>
              ),
            },
          ]}
          isLoading={isLoadingPlans}
          label="Planos"
          onEdit={handleEditPlan}
          onNew={handleNewPlan}
          onPageChange={setPlansPage}
          onSearch={setSearchTerm}
          onSelect={handleSelectPlan}
          page={plansPage}
          records={paginatedPlans}
          searchPlaceholder="Buscar plano"
          searchTerm={searchTerm}
          selectedId={selectedPlanId}
          totalItems={filteredPlans.length}
        />
      </section>

      {selectedPlanId !== null ? (
        <section className="data-grid-section">
          {planRelatedConfig ? (
            <RegistrationGrid<CompanyChildRecord>
              ariaLabel={planRelatedConfig.title}
              columns={planRelatedConfig.columns.map((col) => ({ label: col.label, render: (rec) => formatChildCell(rec, col, planRelatedLookups[col.key]) }))}
              isLoading={isLoadingPlanRelatedRecords}
              label={planRelatedConfig.label}
              newDisabled={!selectedPlanId}
              onNew={handleNewPlanRelated}
              onSearch={setPlanRelatedSearchTerm}
              onSelect={handleSelectPlanRelatedRecord}
              onEdit={handleEditPlanRelated}
              records={filteredPlanRelatedRecords}
              searchTerm={planRelatedSearchTerm}
              selectedId={selectedPlanRelatedRecordId}
              variant="child"
            />
          ) : (
            <div className="form-hint">Selecione uma aba para ver os registros.</div>
          )}
        </section>
      ) : null}

      {selectedPlanId !== null ? (
        <RegistrationTabs tabs={planRelatedTables} activeTab={selectedPlanRelatedTable} onTabChange={handleSelectPlanRelatedTable} icons={planTabIcons} ariaLabel="Tabelas relacionadas do plano" />
      ) : null}

      <RegistrationDrawer
        isOpen={isDrawerOpen}
        title={drawerMode === 'plan' ? (isCreating ? 'Novo Plano' : 'Editar Plano') : (planRelatedConfig?.label ?? 'Registro relacionado')}
        onClose={() => setIsDrawerOpen(false)}
      >
        {drawerMode === 'plan' ? (
          <form className="drawer-fields" onSubmit={handleSavePlan}>
            {feedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{feedback}</div> : null}
            <RegistrationField htmlFor="planName" label="Nome do plano" required size="full">
              <input id="planName" maxLength={255} onChange={(event) => setPlanName(event.target.value)} ref={planNameInputRef} required type="text" value={planName} />
            </RegistrationField>
            <RegistrationField htmlFor="planFrequency" label="Frequência" size="md">
              <select id="planFrequency" onChange={(event) => setPlanFrequencyId(event.target.value)} value={planFrequencyId}>
                <option value="">Selecione</option>
                {frequencies.map((frequency) => (<option key={frequency.id} value={frequency.id}>{frequency.dsFrequencia}</option>))}
              </select>
            </RegistrationField>
            <RegistrationField htmlFor="planStatus" label="Status" size="sm">
              <button aria-pressed={isPlanActive} className={`status-toggle ${isPlanActive ? 'active' : ''}`} id="planStatus" onClick={handleTogglePlanStatus} type="button">
                <span>{isPlanActive ? 'Ativo' : 'Inativo'}</span>
              </button>
            </RegistrationField>
            <div className="form-actions" style={{ flex: '1 1 100%' }}>
              <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
              <button type="submit"><Save size={16} />Salvar plano</button>
            </div>
          </form>
        ) : (
          <form className="drawer-fields" onSubmit={handleSavePlanRelated}>
            {planRelatedFeedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{planRelatedFeedback}</div> : null}
            {isPlanRelatedFileTable ? (
              <>
                <RegistrationField htmlFor="planPromotionFilePromotion" label="Promoção" required size="lg">
                  <select disabled={!isPlanRelatedFormEnabled} id="planPromotionFilePromotion" onChange={(event) => setPlanRelatedFormValues((current) => ({ ...current, idPromocao: event.target.value }))} required value={planRelatedFormValues.idPromocao ?? ''}>
                    <option value="">Selecione</option>
                    {(planRelatedLookups.idPromocao ?? []).map((option) => (<option key={option.id} value={option.id}>{getLookupLabel(option, planRelatedConfig!.fields.find((field) => field.key === 'idPromocao') ?? planRelatedConfig!.fields[0]!)}</option>))}
                  </select>
                </RegistrationField>
                <RegistrationField htmlFor="planPromotionFileType" label="Tipo de arquivo" size="md">
                  <select disabled={!isPlanRelatedFormEnabled} id="planPromotionFileType" onChange={(event) => setPlanRelatedFormValues((current) => ({ ...current, idTiposArquivos: event.target.value }))} value={planRelatedFormValues.idTiposArquivos ?? ''}>
                    <option value="">Selecione</option>
                    {(planRelatedLookups.idTiposArquivos ?? []).map((option) => (<option key={option.id} value={option.id}>{getLookupLabel(option, planRelatedConfig!.fields.find((field) => field.key === 'idTiposArquivos') ?? planRelatedConfig!.fields[0]!)}</option>))}
                  </select>
                </RegistrationField>
                <RegistrationField htmlFor="planPromotionFileName" label="Arquivo selecionado" size="full">
                  <input disabled id="planPromotionFileName" type="text" value={selectedPlanRelatedRecord ? String(selectedPlanRelatedRecord.dsArquivo ?? `Arquivo ${selectedPlanRelatedRecord.id}`) : ''} />
                </RegistrationField>
                <RegistrationField className="file-upload-field" htmlFor="planPromotionFileUpload" label={selectedPlanRelatedRecordId && !isCreatingPlanRelated ? 'Alterar arquivo' : 'Arquivo'} size="full">
                  <input disabled={!isPlanRelatedFormEnabled || isUploadingPlanRelatedFile} id="planPromotionFileUpload" onChange={handleUploadPlanRelatedFile} ref={planFileInputRef} type="file" />
                </RegistrationField>
                {selectedPlanRelatedRecord ? (
                  <div className="file-preview-card" style={{ flex: '1 1 100%' }}>
                    {planRelatedFilePreviewUrls[selectedPlanRelatedRecord.id] ? (
                      <button className="file-preview-button" onClick={() => handleOpenPlanRelatedFile(selectedPlanRelatedRecord.id)} type="button">
                        <img alt={String(selectedPlanRelatedRecord.dsArquivo ?? `Arquivo ${selectedPlanRelatedRecord.id}`)} src={planRelatedFilePreviewUrls[selectedPlanRelatedRecord.id]} />
                      </button>
                    ) : (
                      <div className="file-preview-placeholder">
                        <strong>{String(selectedPlanRelatedRecord.dsArquivo ?? `Arquivo ${selectedPlanRelatedRecord.id}`)}</strong>
                      </div>
                    )}
                    <div className="file-preview-actions">
                      <button className="secondary-button" onClick={() => handleOpenPlanRelatedFile(selectedPlanRelatedRecord.id)} type="button">Visualizar</button>
                      <button className="secondary-button" onClick={() => handleRemovePlanRelatedFile(selectedPlanRelatedRecord.id)} type="button">Remover</button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                {planRelatedConfig?.fields.map((field) => (
                  <RegistrationField htmlFor={`planRelated-${field.key}`} key={field.key} label={field.label} required={field.required} size="full">
                    {field.lookupEndpoint ? (
                      <select disabled={!isPlanRelatedFormEnabled} id={`planRelated-${field.key}`} onChange={(event) => setPlanRelatedFormValues((current) => ({ ...current, [field.key]: event.target.value }))} required={field.required} value={planRelatedFormValues[field.key] ?? ''}>
                        <option value="">Selecione</option>
                        {(planRelatedLookups[field.key] ?? []).map((option) => (<option key={option.id} value={option.id}>{getLookupLabel(option, field)}</option>))}
                      </select>
                    ) : (
                      <input disabled={!isPlanRelatedFormEnabled} id={`planRelated-${field.key}`} onChange={(event) => setPlanRelatedFormValues((current) => ({ ...current, [field.key]: event.target.value }))} required={field.required} type={field.type} value={planRelatedFormValues[field.key] ?? ''} />
                    )}
                  </RegistrationField>
                ))}
                <RegistrationField htmlFor="planRelatedStatus" label="Status" size="sm">
                  <button aria-pressed={isPlanRelatedActive} className={`status-toggle ${isPlanRelatedActive ? 'active' : ''}`} disabled={!isPlanRelatedFormEnabled} id="planRelatedStatus" onClick={handleTogglePlanRelatedStatus} type="button">
                    <span>{isPlanRelatedActive ? 'Ativo' : 'Inativo'}</span>
                  </button>
                </RegistrationField>
              </>
            )}
            <div className="form-actions" style={{ flex: '1 1 100%' }}>
              <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
              {!isPlanRelatedFileTable ? (<button disabled={!isPlanRelatedFormEnabled} type="submit"><Save size={16} />Salvar {planRelatedConfig?.label}</button>) : null}
            </div>
          </form>
        )}
      </RegistrationDrawer>

      {planRelatedFileModal ? (
        <div className="file-modal-overlay" role="dialog" aria-modal="true">
          <div className="file-modal">
            <div className="file-modal-header">
              <h3>{planRelatedFileModal.title}</h3>
              <button onClick={() => setPlanRelatedFileModal(null)} type="button">
                Fechar
              </button>
            </div>
            <img alt={planRelatedFileModal.title} src={planRelatedFileModal.url} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
