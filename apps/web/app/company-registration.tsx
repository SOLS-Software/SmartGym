'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { GRID_PAGE_SIZE, GridPagination, formatChildCell, formatChildSearchValue, formatDateInput, getLookupLabel, isImageFile, onlyDigits, paginateItems } from './registration-helpers';
import type { Company, CompanyChildColumn, CompanyChildField, CompanyChildRecord, CompanyChildTable, CompanyValidationErrors, CompanyValidationField, LookupRecord } from './registration-types';

const apiUrl = '/api/proxy';

const companyChildTables: [CompanyChildTable, ...CompanyChildTable[]] = [
  {
    key: 'promotions',
    endpoint: 'promotions',
    label: 'Promoções',
    title: 'Promoções da empresa',
    columns: [
      { key: 'dsPromocao', label: 'Promoção' },
      { key: 'qtPeriodo', label: 'Período' },
      { key: 'vlDesconto', label: 'Desconto R$', type: 'money' },
      { key: 'pcDesconto', label: 'Desconto %' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'dsPromocao', label: 'Promoção', type: 'text', required: true },
      { key: 'qtPeriodo', label: 'Período', type: 'number' },
      {
        key: 'idUnidadeTempo',
        label: 'Unidade de tempo',
        type: 'number',
        lookupEndpoint: 'time-units',
        lookupLabelKey: 'dsUnidadeTempo',
      },
      { key: 'vlDesconto', label: 'Desconto R$', type: 'number' },
      { key: 'pcDesconto', label: 'Desconto %', type: 'number' },
      { key: 'dtInicio', label: 'Início', type: 'date' },
      { key: 'dtEncerramento', label: 'Encerramento', type: 'date' },
    ],
  },
  {
    key: 'studentPlans',
    endpoint: 'student-plans',
    label: 'Planos de Alunos',
    title: 'Planos de alunos da empresa',
    columns: [
      { key: 'idAluno', label: 'ID aluno' },
      { key: 'idPlano', label: 'ID plano' },
      { key: 'nrDiaPagamento', label: 'Dia pgto' },
      { key: 'dtAdmissao', label: 'Admissão', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idAluno', label: 'Aluno', type: 'number', lookupEndpoint: 'students', lookupLabelKey: 'nmAluno' },
      { key: 'idPlano', label: 'Plano', type: 'number', lookupEndpoint: 'plans', lookupLabelKey: 'dsPlano' },
      {
        key: 'idPromocaoPlano',
        label: 'Promoção do plano',
        type: 'number',
        lookupEndpoint: 'promotion-plans',
        lookupLabelKey: 'id',
      },
      { key: 'nrDiaPagamento', label: 'Dia pagamento', type: 'number' },
      { key: 'dtAdmissao', label: 'Admissão', type: 'date' },
    ],
  },
  {
    key: 'payments',
    endpoint: 'payments',
    label: 'Pagamentos',
    title: 'Pagamentos da empresa',
    columns: [
      { key: 'idAlunoPlano', label: 'ID aluno plano' },
      { key: 'vlPagamento', label: 'Valor', type: 'money' },
      { key: 'dtPagamento', label: 'Pagamento', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      {
        key: 'idAlunoPlano',
        label: 'Aluno plano',
        type: 'number',
        lookupEndpoint: 'companies/{companyId}/children/student-plans',
        lookupLabelKey: 'id',
      },
      {
        key: 'idProdutoMovimentacao',
        label: 'Movimentação',
        type: 'number',
        lookupEndpoint: 'companies/{companyId}/children/product-movements',
        lookupLabelKey: 'id',
      },
      { key: 'vlPagamento', label: 'Valor', type: 'number' },
      {
        key: 'idStatusPagamento',
        label: 'Status pagamento',
        type: 'number',
        lookupEndpoint: 'payment-statuses',
        lookupLabelKey: 'dsStatusPagamento',
      },
      {
        key: 'idFormaPagamento',
        label: 'Forma pagamento',
        type: 'number',
        lookupEndpoint: 'payment-methods',
        lookupLabelKey: 'dsFormaPagamento',
      },
      { key: 'dtPagamento', label: 'Data pagamento', type: 'date' },
    ],
  },
  {
    key: 'productMovements',
    endpoint: 'product-movements',
    label: 'Movimentações de Produtos',
    title: 'Movimentações de produtos',
    columns: [
      { key: 'idProduto', label: 'ID produto' },
      { key: 'idAluno', label: 'ID aluno' },
      { key: 'qtMovimentada', label: 'Qtd' },
      { key: 'vlUnitario', label: 'Valor', type: 'money' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idProduto', label: 'Produto', type: 'number', lookupEndpoint: 'products', lookupLabelKey: 'dsProduto' },
      { key: 'idAluno', label: 'Aluno', type: 'number', lookupEndpoint: 'students', lookupLabelKey: 'nmAluno' },
      { key: 'qtMovimentada', label: 'Qtd movimentada', type: 'number' },
      { key: 'vlUnitario', label: 'Valor unitário', type: 'number' },
      { key: 'qtDisponivel', label: 'Qtd disponível', type: 'number' },
    ],
  },
  {
    key: 'companyFiles',
    endpoint: 'company-files',
    label: 'Arquivos da Empresa',
    title: 'Arquivos da empresa',
    columns: [
      { key: 'dsArquivo', label: 'Arquivo' },
      { key: 'idTiposArquivos', label: 'ID tipo' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      {
        key: 'idTiposArquivos',
        label: 'Tipo de arquivo',
        type: 'number',
        lookupEndpoint: 'file-types',
        lookupLabelKey: 'dsTipo',
      },
    ],
  },
  {
    key: 'studentCheckIns',
    endpoint: 'student-check-ins',
    label: 'Aluno Check-ins',
    title: 'Check-ins de alunos',
    columns: [
      { key: 'idAlunoPlano', label: 'ID aluno plano' },
      { key: 'idPontos', label: 'ID pontos' },
      { key: 'dtCadastro', label: 'Cadastro', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      {
        key: 'idAlunoPlano',
        label: 'Aluno plano',
        type: 'number',
        lookupEndpoint: 'companies/{companyId}/children/student-plans',
        lookupLabelKey: 'id',
      },
      {
        key: 'idAlunoTreinosSequencia',
        label: 'Sequência do treino',
        type: 'number',
        lookupEndpoint: 'student-training-sequences',
        lookupLabelKey: 'nrOrdem',
      },
      { key: 'idPontos', label: 'Pontos', type: 'number', lookupEndpoint: 'points', lookupLabelKey: 'dsPontos' },
    ],
  },
  {
    key: 'themes',
    endpoint: 'themes',
    label: 'Tema',
    title: 'Temas',
    columns: [
      { key: 'dsTema', label: 'Tema' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [{ key: 'dsTema', label: 'Tema', type: 'text', required: true }],
  },
];


function getSelectedRecord(records: CompanyChildRecord[], selectedId: number | null) {
  return selectedId ? records.find((record) => record.id === selectedId) ?? null : null;
}


function formatCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14);

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}


function isValidCnpj(value: string) {
  const cnpj = onlyDigits(value);

  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) {
    return false;
  }

  const calculateDigit = (size: number) => {
    const weights =
      size === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;

    for (let index = 0; index < size; index += 1) {
      sum += Number(cnpj[index]) * Number(weights[index]);
    }

    const rest = sum % 11;

    return rest < 2 ? 0 : 11 - rest;
  };

  return calculateDigit(12) === Number(cnpj[12]) && calculateDigit(13) === Number(cnpj[13]);
}


export function CompanyRegistration() {
  const companyFileInputRef = useRef<HTMLInputElement>(null);
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
  const isChildFormEnabled = Boolean(selectedCompanyId) && (selectedChildRecordId !== null || isCreatingChild);
  const selectedChildRecord = getSelectedRecord(childRecords, selectedChildRecordId);
  const filteredChildRecords = childRecords.filter((record) =>
    childTableConfig
      ? childTableConfig.columns.some((column) =>
        formatChildSearchValue(record, column).includes(childSearchTerm.toLowerCase()),
      )
      : false,
  );
  const filteredCompanies = companies.filter((company) => {
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
        throw new Error('Nao foi possivel carregar as empresas.');
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
  }, [searchTerm]);

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
          : `${apiUrl}/companies/${companyId}/children/${config.endpoint}`,
      );

      if (!response.ok) {
        throw new Error('Nao foi possivel carregar os registros filhos.');
      }

      const data = (await response.json()) as CompanyChildRecord[];
      setChildRecords(data);
      setChildFeedback('');

      if (config.key === 'companyFiles') {
        const imageFiles = data.filter((file) => isImageFile(String(file.anCaminho ?? '')));
        const urlEntries = await Promise.all(
          imageFiles.map(async (file) => {
            try {
              const urlResponse = await fetch(
                `${apiUrl}/companies/${companyId}/files/${file.id}/url`,
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
            throw new Error(`Nao foi possivel carregar ${field.label}.`);
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
        throw new Error('Nao foi possivel alterar o status do registro filho.');
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
        throw new Error(errorBody.message ?? 'Nao foi possivel salvar o registro filho.');
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
      formData.append('file', file);
      formData.append('idTiposArquivos', childFormValues.idTiposArquivos ?? '');

      const isReplacingFile = selectedChildRecordId !== null && !isCreatingChild;
      const response = await fetch(
        isReplacingFile
          ? `${apiUrl}/companies/${selectedCompanyId}/files/${selectedChildRecordId}`
          : `${apiUrl}/companies/${selectedCompanyId}/files`,
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
      await loadChildRecords(selectedCompanyId);
      setSelectedChildRecordId(saved.id);
      setIsCreatingChild(false);
      setChildFormValues({
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
      const response = await fetch(`${apiUrl}/companies/${selectedCompanyId}/files/${fileId}/url`);

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel abrir o arquivo.');
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
      const response = await fetch(`${apiUrl}/companies/${selectedCompanyId}/files/${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel remover o arquivo.');
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
  }

  function handleSelectCompany(company: Company) {
    setSelectedCompanyId(company.id);
    setIsCreating(false);
    setCompanyName(company.dsEmpresa);
    setCompanyCnpj(formatCnpj(company.caCNPJ));
    setIsCompanyActive(company.boInativo === 0);
    setFeedback('');
    setCompanyErrors({});
    setTouchedCompanyFields({});
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
        throw new Error('Nao foi possivel alterar o status.');
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
      errors.cnpj = 'Informe um CNPJ valido.';
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
        throw new Error(errorBody.message ?? 'Nao foi possivel salvar.');
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
        <p className="section-label">Cadastro Empresa </p>
      </div>

      <div className="registration-split-layout company-split-layout">
        <section className="data-grid-section company-grid-section">
          <div className="grid-toolbar">
            <div>
              <p className="section-label">Empresas</p>
              <h3>Empresas cadastradas</h3>
            </div>
            <label className="search-field">
              <span>Pesquisar</span>
              <input
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar empresa"
                type="search"
                value={searchTerm}
              />
            </label>
            <button className="new-button" onClick={handleNewCompany} type="button">
              Nova empresa
            </button>
          </div>

          <div className="product-table" role="table" aria-label="Empresas cadastradas">
            <div className="product-row company-grid header" role="row">
              <span role="columnheader">Empresa</span>
              <span role="columnheader">CNPJ</span>
              <span role="columnheader">Status</span>
            </div>

            {isLoadingCompanies ? (
              <div className="empty-row">Carregando empresas...</div>
            ) : null}

            {!isLoadingCompanies ? paginatedCompanies.map((company) => (
              <button
                className={`product-row company-grid selectable ${company.id === selectedCompanyId ? 'selected' : ''
                  }`}
                key={company.id}
                onClick={() => handleSelectCompany(company)}
                role="row"
                type="button"
              >
                <span role="cell">{company.dsEmpresa}</span>
                <span role="cell">{formatCnpj(company.caCNPJ)}</span>
                <span role="cell">
                  <span
                    className={`status-badge ${company.boInativo === 0 ? 'active' : 'inactive'
                      }`}
                  >
                    {company.boInativo === 0 ? 'Ativo' : 'Inativo'}
                  </span>
                </span>
              </button>
            )) : null}

            {!isLoadingCompanies && filteredCompanies.length === 0 ? (
              <div className="empty-row">Nenhuma empresa encontrada.</div>
            ) : null}
          </div>
          <GridPagination
            onChange={setCompaniesPage}
            page={companiesPage}
            totalItems={filteredCompanies.length}
          />

          <section className="company-child-grid-section">
            {!childTableConfig ? (
              <div className="form-hint">Selecione uma tabela filha ao lado.</div>
            ) : !selectedCompanyId ? (
              <div className="form-hint">
                Selecione uma empresa para visualizar os registros filhos.
              </div>
            ) : (
              <>
                <div className="grid-toolbar">
                  <div className="child-grid-toolbar-label">
                    <p className="section-label">{childTableConfig.label}</p>
                  </div>
                  <div className="child-grid-toolbar-actions">
                    <label className="search-field">
                      <span>Pesquisar</span>
                      <input
                        onChange={(event) => setChildSearchTerm(event.target.value)}
                        placeholder="Buscar registro"
                        type="search"
                        value={childSearchTerm}
                      />
                    </label>
                    <button
                      className="new-button"
                      disabled={!selectedCompanyId}
                      onClick={handleNewChild}
                      type="button"
                    >
                      Novo
                    </button>
                  </div>
                </div>

                <div
                  className="product-table company-child-grid-table"
                  role="table"
                  aria-label={childTableConfig.title}
                >
                  <div
                    className="product-row company-child-grid-row header"
                    role="row"
                    style={{
                      gridTemplateColumns: `repeat(${childTableConfig.columns.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {childTableConfig.columns.map((column) => (
                      <span key={column.key} role="columnheader">
                        {column.label}
                      </span>
                    ))}
                  </div>

                  {isLoadingChildRecords ? (
                    <div className="empty-row">Carregando {childTableConfig.label.toLowerCase()}...</div>
                  ) : null}

                  {!isLoadingChildRecords ? filteredChildRecords.map((record) => (
                    <button
                      className={`product-row company-child-grid-row selectable ${record.id === selectedChildRecordId ? 'selected' : ''
                        }`}
                      key={record.id}
                      onClick={() => handleSelectChild(record)}
                      role="row"
                      style={{
                        gridTemplateColumns: `repeat(${childTableConfig.columns.length}, minmax(0, 1fr))`,
                      }}
                      type="button"
                    >
                      {childTableConfig.columns.map((column) => (
                        <span key={column.key} role="cell">
                          {formatChildCell(record, column)}
                        </span>
                      ))}
                    </button>
                  )) : null}

                  {!isLoadingChildRecords && filteredChildRecords.length === 0 ? (
                    <div className="empty-row">
                      Nenhum registro de {childTableConfig.label.toLowerCase()} encontrado.
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </section>

        <div className="company-form-stack">
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

                <div className="field">
                  <label htmlFor="dsEmpresa">Empresa</label>
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
                    required
                    type="text"
                    value={companyName}
                  />
                  {touchedCompanyFields.name && companyErrors.name ? (
                    <span className="field-error">{companyErrors.name}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="caCNPJ">CNPJ</label>
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
                            : 'Informe um CNPJ valido.',
                        }));
                      }
                    }}
                    placeholder="00.000.000/0000-00"
                    required
                    type="text"
                    value={companyCnpj}
                  />
                  {touchedCompanyFields.cnpj && companyErrors.cnpj ? (
                    <span className="field-error">{companyErrors.cnpj}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="empresaStatus">Status</label>
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
                </div>

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
                    Salvar empresa
                  </button>
                </div>
              </>
            ) : null}
          </form>

          {childTableConfig ? (
            <form
              className={`registration-form company-child-form-panel ${isChildFieldsCollapsed ? 'collapsed' : ''}`}
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

                  {selectedChildTable === 'companyFiles' ? (
                    <>
                      <div className="company-child-fields">
                        <div className="field">
                          <label htmlFor="companyFileType">Tipo de arquivo</label>
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
                        </div>

                        <div className="field">
                          <label htmlFor="companyFileName">Arquivo selecionado</label>
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
                        </div>
                      </div>

                      <div className="field">
                        <label htmlFor="companyFile">
                          {selectedChildRecordId && !isCreatingChild ? 'Alterar arquivo' : 'Arquivo'}
                        </label>
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
                        {selectedChildRecordId && !isCreatingChild ? (
                          <span className="field-error">
                            Selecionar um novo arquivo vai alterar o arquivo selecionado.
                          </span>
                        ) : null}
                      </div>

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
                      <div className="company-child-fields">
                        {childTableConfig.fields.map((field) => (
                          <div className="field" key={field.key}>
                            <label htmlFor={`companyChild-${field.key}`}>
                              {field.label}
                              {field.required ? ' *' : ''}
                            </label>
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
                          </div>
                        ))}
                      </div>

                      {!isChildFormEnabled ? (
                        <div className="form-hint">
                          Selecione um registro filho acima ou clique em Novo.
                        </div>
                      ) : null}

                      <div className="field">
                        <label htmlFor="companyChildStatus">Status</label>
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
                      </div>

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

