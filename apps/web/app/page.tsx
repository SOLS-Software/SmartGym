'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';
const GRID_PAGE_SIZE = 20;

const menuGroups = [
  {
    title: 'EMPRESA',
    items: ['Empresas'],
  },
  {
    title: 'TREINO',
    items: ['Exercícios', 'Treino', 'Meu Treino'],
  },
  {
    title: 'ESTOQUE',
    items: ['Produtos', 'Compras'],
  },
  {
    title: 'ALUNOS',
    items: ['Matrículas'],
  },
  {
    title: 'RH',
    items: ['Profissionais'],
  },
  {
    title: 'DOMÍNIOS',
    items: ['Domínios'],
  },
];

type Product = {
  id: number;
  idEmpresa: number | null;
  dsProduto: string;
  qtEstoque: number;
  boInativo: number;
};

type Company = {
  id: number;
  dsEmpresa: string;
  caCNPJ: string;
  boInativo: number;
};

type CompanyChildRecord = {
  id: number;
  boInativo: number;
  [key: string]: unknown;
};

type CompanyChildField = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date';
  required?: boolean;
  lookupEndpoint?: string;
  lookupLabelKey?: string;
};

type CompanyChildColumn = {
  key: string;
  label: string;
  type?: 'date' | 'money' | 'status';
};

type CompanyChildTable = {
  key: string;
  endpoint: string;
  label: string;
  title: string;
  columns: CompanyChildColumn[];
  fields: CompanyChildField[];
};

type LookupRecord = {
  id: number;
  [key: string]: unknown;
};

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

type StudentRelatedTable = {
  key: string;
  endpoint: string;
  label: string;
  title: string;
  columns: CompanyChildColumn[];
};

const studentRelatedTables: StudentRelatedTable[] = [
  {
    key: 'files',
    endpoint: 'files',
    label: 'Arquivos',
    title: 'Arquivos do aluno',
    columns: [
      { key: 'dsArquivo', label: 'Arquivo' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
  },
  {
    key: 'plans',
    endpoint: 'plans',
    label: 'Planos',
    title: 'Planos do aluno',
    columns: [
      { key: 'idPlano', label: 'ID plano' },
      { key: 'nrDiaPagamento', label: 'Dia pgto' },
      { key: 'dtAdmissao', label: 'Admissão', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
  },
  {
    key: 'payments',
    endpoint: 'payments',
    label: 'Pagamentos',
    title: 'Pagamentos do aluno',
    columns: [
      { key: 'idAlunoPlano', label: 'ID plano aluno' },
      { key: 'vlPagamento', label: 'Valor', type: 'money' },
      { key: 'dtPagamento', label: 'Pagamento', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
  },
  {
    key: 'checkIns',
    endpoint: 'check-ins',
    label: 'Check-ins',
    title: 'Check-ins do aluno',
    columns: [
      { key: 'idAlunoPlano', label: 'ID plano aluno' },
      { key: 'idPontos', label: 'ID pontos' },
      { key: 'dtCadastro', label: 'Cadastro', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
  },
];

type Student = {
  id: number;
  nmAluno: string;
  caCPF: string;
  dtNascimento: string | null;
  nrDDD: number;
  nrContato: string | null;
  anEmail: string;
  anCEP: string;
  anLogradouro: string;
  nrEndereco: number | null;
  boInativo: number;
};

type StudentFile = {
  id: number;
  idAluno: number | null;
  dsArquivo?: string;
  anCaminho: string;
  dtCadastro: string;
  boInativo: number;
};

type Exercise = {
  id: number;
  idEmpresa: number | null;
  dsExercicio: string;
  boInativo: number;
};

type ExerciseFile = {
  id: number;
  idExercicio: number | null;
  dsArquivo?: string;
  anCaminho: string;
  dtCadastro: string;
  boInativo: number;
};

type StudentValidationField = 'name' | 'cpf' | 'birthDate' | 'email';
type StudentValidationErrors = Partial<Record<StudentValidationField, string>>;
type CompanyValidationField = 'name' | 'cnpj';
type CompanyValidationErrors = Partial<Record<CompanyValidationField, string>>;

const domainItems = [
  'Cargo',
  'Tema',
  'Frequencia',
  'Nivel',
  'UnidadeTempo',
  'StatusPagamento',
  'FormaPagamento',
  'MetodoTreino',
  'TipoArquivo',
];

type DomainRecord = {
  id: number;
  name: string;
  boInativo: number;
  description?: string;
};

const domainConfig: Record<
  string,
  {
    endpoint: string;
    field: string;
    label: string;
    saveLabel: string;
    secondField?: string;
    secondFieldLabel?: string;
  }
> = {
  Cargo: { endpoint: 'roles', field: 'dsCargo', label: 'Cargo', saveLabel: 'Salvar cargo' },
  Frequencia: { endpoint: 'frequencies', field: 'dsFrequencia', label: 'Frequência', saveLabel: 'Salvar frequência' },
  Nivel: { endpoint: 'levels', field: 'dsNivel', label: 'Nível', saveLabel: 'Salvar nível' },
  UnidadeTempo: { endpoint: 'time-units', field: 'dsUnidadeTempo', label: 'Unidade de tempo', saveLabel: 'Salvar unidade' },
  StatusPagamento: { endpoint: 'payment-statuses', field: 'dsStatusPagamento', label: 'Status de pagamento', saveLabel: 'Salvar status' },
  FormaPagamento: { endpoint: 'payment-methods', field: 'dsFormaPagamento', label: 'Forma de pagamento', saveLabel: 'Salvar forma' },
  MetodoTreino: {
    endpoint: 'training-methods',
    field: 'nmMetodoTreino',
    label: 'Método de treino',
    saveLabel: 'Salvar método',
    secondField: 'dsMetodoTreino',
    secondFieldLabel: 'Descrição',
  },
  TipoArquivo: { endpoint: 'file-types', field: 'dsTipo', label: 'Tipo de arquivo', saveLabel: 'Salvar tipo' },
};

function paginateItems<T>(items: T[], page: number, pageSize = GRID_PAGE_SIZE) {
  const safePage = page < 1 ? 1 : page;
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function GridPagination({
  page,
  totalItems,
  onChange,
  pageSize = GRID_PAGE_SIZE,
}: {
  page: number;
  totalItems: number;
  onChange: (nextPage: number) => void;
  pageSize?: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="grid-pagination" aria-label="Paginação da tabela">
      <p>
        {start}-{end} de {totalItems}
      </p>
      <div>
        <button
          className="secondary-button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          type="button"
        >
          Anterior
        </button>
        <span>
          Página {page} de {totalPages}
        </span>
        <button
          className="secondary-button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          type="button"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

function DomainRegistration() {
  const [selectedDomain, setSelectedDomain] = useState(domainItems[0]);
  const [records, setRecords] = useState<DomainRecord[]>([]);
  const [recordsPage, setRecordsPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const config = domainConfig[selectedDomain as keyof typeof domainConfig];
  const isFormEnabled = Boolean(config) && (selectedRecordId !== null || isCreating);
  const filteredRecords = records.filter((record) =>
    record.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const recordsTotalPages = Math.max(1, Math.ceil(filteredRecords.length / GRID_PAGE_SIZE));
  const paginatedRecords = paginateItems(filteredRecords, recordsPage);

  async function loadRecords() {
    if (!config) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/${config.endpoint}`);

      if (!response.ok) {
        throw new Error('Nao foi possivel carregar o dominio.');
      }

      const data = (await response.json()) as Array<Record<string, unknown>>;
      setRecords(
        data.map((item) => {
          const secondField = config.secondField;
          const description =
            secondField && item[secondField] ? String(item[secondField]) : '';

          return {
            id: Number(item.id),
            name: String(item[config.field] ?? ''),
            description,
            boInativo: Number(item.boInativo ?? 0),
          };
        }),
      );
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar dominio.');
    }
  }

  useEffect(() => {
    if (config) void loadRecords();
  }, [selectedDomain]);

  useEffect(() => {
    setRecordsPage(1);
  }, [searchTerm, selectedDomain]);

  useEffect(() => {
    if (recordsPage > recordsTotalPages) {
      setRecordsPage(recordsTotalPages);
    }
  }, [recordsPage, recordsTotalPages]);

  function clearForm() {
    setSelectedRecordId(null);
    setIsCreating(false);
    setName('');
    setDescription('');
    setIsActive(false);
  }

  function handleNew() {
    setSelectedRecordId(null);
    setIsCreating(true);
    setName('');
    setDescription('');
    setIsActive(true);
    setFeedback('');
  }

  function handleSelect(record: DomainRecord) {
    setSelectedRecordId(record.id);
    setIsCreating(false);
    setName(record.name);
    setDescription(record.description ?? '');
    setIsActive(record.boInativo === 0);
    setFeedback('');
  }

  async function handleToggleStatus() {
    if (!config || !selectedRecordId) return;

    const nextActive = !isActive;
    setIsActive(nextActive);

    try {
      const response = await fetch(`${apiUrl}/${config.endpoint}/${selectedRecordId}/status`, {
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

      const updated = (await response.json()) as Record<string, unknown>;
      setRecords((current) =>
        current.map((record) => {
          const secondField = config.secondField;
          const updatedDescription =
            secondField && updated[secondField] ? String(updated[secondField]) : '';

          return record.id === Number(updated.id)
            ? {
              id: Number(updated.id),
              name: String(updated[config.field] ?? ''),
              description: updatedDescription,
              boInativo: Number(updated.boInativo ?? 0),
            }
            : record;
        }),
      );
    } catch (error) {
      setIsActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config) return;

    try {
      const payload: Record<string, unknown> = {
        [config.field]: name,
        boInativo: isActive ? 0 : 1,
      };
      if (config.secondField) payload[config.secondField] = description;

      const response = await fetch(
        selectedRecordId
          ? `${apiUrl}/${config.endpoint}/${selectedRecordId}`
          : `${apiUrl}/${config.endpoint}`,
        {
          method: selectedRecordId ? 'PUT' : 'POST',
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

      const saved = (await response.json()) as Record<string, unknown>;
      const secondField = config.secondField;
      const mapped: DomainRecord = {
        id: Number(saved.id),
        name: String(saved[config.field] ?? ''),
        description: secondField && saved[secondField] ? String(saved[secondField]) : '',
        boInativo: Number(saved.boInativo ?? 0),
      };

      setRecords((current) => {
        if (selectedRecordId) {
          return current.map((record) => (record.id === mapped.id ? mapped : record));
        }

        return [...current, mapped].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
      });
      setSelectedRecordId(mapped.id);
      setIsCreating(false);
      setFeedback(`${config.label} salvo com sucesso.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  return (
    <div className="form-view company-view">
      <div className="form-heading">
        <p className="section-label">Domínios</p>
        <h2>Cadastro de Domínios</h2>
        <p>Tabelas de apoio para tipos e configurações gerais do sistema.</p>
      </div>

      {config ? (
        <section className="domain-workspace">
          <div className="domain-panel">
            <section className="data-grid-section">
              <div className="grid-toolbar">
                <div>
                  <p className="section-label">Domínios</p>
                  <h3>Selecione um domínio</h3>
                </div>
              </div>

              <div className="domain-select-table" role="table" aria-label="Domínios">
                <div className="domain-select-row header" role="row">
                  <span role="columnheader">Nome</span>
                </div>

                {domainItems.map((item) => (
                  <button
                    className={`domain-select-row selectable ${item === selectedDomain ? 'selected' : ''
                      }`}
                    key={item}
                    onClick={() => setSelectedDomain(item)}
                    role="row"
                    type="button"
                  >
                    <span role="cell">{item}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="domain-panel">
            <section className="data-grid-section">
              <div className="grid-toolbar">
                <div>
                  <p className="section-label">{selectedDomain}</p>
                  <h3>Itens cadastrados</h3>
                </div>
                <button className="new-button" onClick={handleNew} type="button">
                  Novo
                </button>
                <label className="search-field">
                  <span>Pesquisar</span>
                  <input
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar item"
                    type="search"
                    value={searchTerm}
                  />
                </label>
              </div>

              <div className="product-table domain-records-table" role="table" aria-label="Itens cadastrados">
                <div className="product-row domain-records-row header" role="row">
                  <span role="columnheader">{config.label}</span>
                  <span role="columnheader">Status</span>
                </div>

                {paginatedRecords.map((record) => (
                  <button
                    className={`product-row domain-records-row selectable ${record.id === selectedRecordId ? 'selected' : ''
                      }`}
                    key={record.id}
                    onClick={() => handleSelect(record)}
                    role="row"
                    type="button"
                  >
                    <span role="cell">{record.name}</span>
                    <span role="cell">
                      <span className={`status-badge ${record.boInativo === 0 ? 'active' : 'inactive'}`}>
                        {record.boInativo === 0 ? 'Ativo' : 'Inativo'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <GridPagination
                onChange={setRecordsPage}
                page={recordsPage}
                totalItems={filteredRecords.length}
              />
            </section>
          </div>

          <form className="registration-form domain-panel domain-form-panel" onSubmit={handleSave}>
            {!isFormEnabled ? (
              <div className="form-hint">Selecione um item acima ou clique em Novo.</div>
            ) : null}
            {feedback ? <div className="form-feedback">{feedback}</div> : null}

            <div className="field">
              <label htmlFor="domainName">{config.label}</label>
              <input
                disabled={!isFormEnabled}
                id="domainName"
                maxLength={255}
                onChange={(event) => setName(event.target.value)}
                placeholder="Digite aqui"
                type="text"
                value={name}
              />
            </div>
            {config.secondField ? (
              <div className="field">
                <label htmlFor="domainDescription">{config.secondFieldLabel}</label>
                <input
                  disabled={!isFormEnabled}
                  id="domainDescription"
                  maxLength={255}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Digite aqui"
                  type="text"
                  value={description}
                />
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="domainStatus">Status</label>
              <button
                aria-pressed={isActive}
                className={`status-toggle ${isActive ? 'active' : ''}`}
                disabled={!isFormEnabled}
                id="domainStatus"
                onClick={handleToggleStatus}
                type="button"
              >
                <span>{isActive ? 'Ativo' : 'Inativo'}</span>
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
                {config.saveLabel}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="registration-form">
          <div className="form-hint">
            Domínio selecionado: <strong>{selectedDomain}</strong>
          </div>
        </section>
      )}
    </div>
  );
}

function CompanyRegistration() {
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

function ProductRegistration() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productsPage, setProductsPage] = useState(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [productName, setProductName] = useState('');
  const [productStock, setProductStock] = useState('');
  const [isProductActive, setIsProductActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const isFormEnabled = selectedProductId !== null || isCreating;
  const filteredProducts = products.filter((product) =>
    product.dsProduto.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const productsTotalPages = Math.max(1, Math.ceil(filteredProducts.length / GRID_PAGE_SIZE));
  const paginatedProducts = paginateItems(filteredProducts, productsPage);

  async function loadProducts() {
    try {
      const response = await fetch(`${apiUrl}/products`);

      if (!response.ok) {
        throw new Error('Nao foi possivel carregar os produtos.');
      }

      const data = (await response.json()) as Product[];
      setProducts(data);
      setFeedback('');
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar produtos.',
      );
    }
  }

  async function loadCompanies() {
    try {
      const response = await fetch(`${apiUrl}/companies`);

      if (!response.ok) {
        throw new Error('Nao foi possivel carregar as empresas.');
      }

      const data = (await response.json()) as Company[];
      setCompanies(data.filter((company) => company.boInativo === 0));
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar empresas.',
      );
    }
  }

  useEffect(() => {
    void loadProducts();
    void loadCompanies();
  }, []);

  useEffect(() => {
    setProductsPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (productsPage > productsTotalPages) {
      setProductsPage(productsTotalPages);
    }
  }, [productsPage, productsTotalPages]);

  function clearForm() {
    setSelectedProductId(null);
    setIsCreating(false);
    setSelectedCompanyId('');
    setProductName('');
    setProductStock('');
    setIsProductActive(false);
  }

  function handleNewProduct() {
    setSelectedProductId(null);
    setIsCreating(true);
    setSelectedCompanyId('');
    setProductName('');
    setProductStock('0');
    setIsProductActive(true);
    setFeedback('');
  }

  function handleSelectProduct(product: Product) {
    setSelectedProductId(product.id);
    setIsCreating(false);
    setSelectedCompanyId(product.idEmpresa ? String(product.idEmpresa) : '');
    setProductName(product.dsProduto);
    setProductStock(String(product.qtEstoque));
    setIsProductActive(product.boInativo === 0);
    setFeedback('');
  }

  async function handleToggleStatus() {
    const nextActive = !isProductActive;
    setIsProductActive(nextActive);

    if (!selectedProductId) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/products/${selectedProductId}/status`, {
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

      const updatedProduct = (await response.json()) as Product;
      setProducts((current) =>
        current.map((product) =>
          product.id === updatedProduct.id ? updatedProduct : product,
        ),
      );
    } catch (error) {
      setIsProductActive(!nextActive);
      setFeedback(
        error instanceof Error ? error.message : 'Erro ao alterar status.',
      );
    }
  }

  async function handleSaveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const payload = {
        idEmpresa: selectedCompanyId ? Number(selectedCompanyId) : null,
        dsProduto: productName,
        qtEstoque: Number(productStock || 0),
        boInativo: isProductActive ? 0 : 1,
      };
      const response = await fetch(
        selectedProductId
          ? `${apiUrl}/products/${selectedProductId}`
          : `${apiUrl}/products`,
        {
          method: selectedProductId ? 'PUT' : 'POST',
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

      const savedProduct = (await response.json()) as Product;
      setProducts((current) => {
        if (selectedProductId) {
          return current.map((product) =>
            product.id === savedProduct.id ? savedProduct : product,
          );
        }

        return [...current, savedProduct].sort((a, b) =>
          a.dsProduto.localeCompare(b.dsProduto),
        );
      });
      setSelectedProductId(savedProduct.id);
      setIsCreating(false);
      setFeedback('Produto salvo com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  return (
    <div className="form-view">
      <div className="form-heading">
        <p className="section-label">Estoque</p>
        <h2>Cadastro de Produto</h2>
        <p>
          Informe os dados basicos do produto para controlar estoque e
          movimentacoes.
        </p>
      </div>

      <div className="registration-split-layout">
        <section className="data-grid-section">
          <div className="grid-toolbar">
            <div>
              <p className="section-label">Produtos</p>
              <h3>Produtos cadastrados</h3>
            </div>
            <label className="search-field">
              <span>Pesquisar</span>
              <input
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar produto"
                type="search"
                value={searchTerm}
              />
            </label>
            <button className="new-button" onClick={handleNewProduct} type="button">
              Novo produto
            </button>
          </div>

          <div className="product-table" role="table" aria-label="Produtos cadastrados">
            <div className="product-row header" role="row">
              <span role="columnheader">Produto</span>
              <span role="columnheader">Estoque</span>
              <span role="columnheader">Status</span>
            </div>

            {paginatedProducts.map((product) => (
              <button
                className={`product-row selectable ${product.id === selectedProductId ? 'selected' : ''
                  }`}
                key={product.id}
                onClick={() => handleSelectProduct(product)}
                role="row"
                type="button"
              >
                <span role="cell">{product.dsProduto}</span>
                <span role="cell">{product.qtEstoque}</span>
                <span role="cell">
                  <span
                    className={`status-badge ${product.boInativo === 0 ? 'active' : 'inactive'
                      }`}
                  >
                    {product.boInativo === 0 ? 'Ativo' : 'Inativo'}
                  </span>
                </span>
              </button>
            ))}

            {filteredProducts.length === 0 ? (
              <div className="empty-row">Nenhum produto encontrado.</div>
            ) : null}
          </div>
          <GridPagination
            onChange={setProductsPage}
            page={productsPage}
            totalItems={filteredProducts.length}
          />
        </section>

        <form className="registration-form split-form-panel" onSubmit={handleSaveProduct}>
          {!isFormEnabled ? (
            <div className="form-hint">
              Selecione um produto acima para editar ou clique em Novo produto.
            </div>
          ) : null}

          {feedback ? <div className="form-feedback">{feedback}</div> : null}

          <div className="field">
            <label htmlFor="idEmpresa">Empresa</label>
            <select
              disabled={!isFormEnabled}
              id="idEmpresa"
              name="idEmpresa"
              onChange={(event) => setSelectedCompanyId(event.target.value)}
              value={selectedCompanyId}
            >
              <option value="">Sem empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.dsEmpresa}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="dsProduto">Produto</label>
            <input
              id="dsProduto"
              maxLength={255}
              name="dsProduto"
              disabled={!isFormEnabled}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="Ex.: Whey Protein 900g"
              type="text"
              value={productName}
            />
          </div>

          <div className="field two-columns">
            <div>
              <label htmlFor="qtEstoque">Quantidade em estoque</label>
              <input
                id="qtEstoque"
                min="0"
                name="qtEstoque"
                disabled={!isFormEnabled}
                onChange={(event) => setProductStock(event.target.value)}
                placeholder="0"
                type="number"
                value={productStock}
              />
            </div>

            <div>
              <label htmlFor="boInativo">Status</label>
              <input
                name="boInativo"
                type="hidden"
                value={isProductActive ? '0' : '1'}
              />
              <button
                aria-pressed={isProductActive}
                className={`status-toggle ${isProductActive ? 'active' : ''}`}
                disabled={!isFormEnabled}
                onClick={handleToggleStatus}
                type="button"
              >
                <span>{isProductActive ? 'Ativo' : 'Inativo'}</span>
              </button>
            </div>
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
              Salvar produto
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatDateInput(value: string | null) {
  return value ? value.slice(0, 10) : '';
}

function formatChildCell(record: CompanyChildRecord, column: CompanyChildColumn) {
  const value = record[column.key];

  if (column.type === 'status') {
    const isActive = Number(value ?? 0) === 0;

    return (
      <span className={`status-badge ${isActive ? 'active' : 'inactive'}`}>
        {isActive ? 'Ativo' : 'Inativo'}
      </span>
    );
  }

  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (column.type === 'date') {
    return formatDateInput(String(value));
  }

  if (column.type === 'money') {
    return Number(value).toLocaleString('pt-BR', {
      currency: 'BRL',
      style: 'currency',
    });
  }

  return String(value);
}

function formatChildSearchValue(record: CompanyChildRecord, column: CompanyChildColumn) {
  const value = record[column.key];

  if (column.type === 'status') {
    return Number(value ?? 0) === 0 ? 'ativo' : 'inativo';
  }

  if (value === null || value === undefined) {
    return '';
  }

  if (column.type === 'date') {
    return formatDateInput(String(value)).toLowerCase();
  }

  return String(value).toLowerCase();
}

function getLookupLabel(option: LookupRecord, field: CompanyChildField) {
  const labelValue = field.lookupLabelKey ? option[field.lookupLabelKey] : undefined;

  if (labelValue === undefined || labelValue === null || labelValue === '') {
    return String(option.id);
  }

  return `${option.id} - ${String(labelValue)}`;
}

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

function ExerciseRegistration() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exercisesPage, setExercisesPage] = useState(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [exerciseFiles, setExerciseFiles] = useState<ExerciseFile[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [isExerciseActive, setIsExerciseActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [fileFeedback, setFileFeedback] = useState('');
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const isFormEnabled = selectedExerciseId !== null || isCreating;
  const filteredExercises = exercises.filter((exercise) =>
    exercise.dsExercicio.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const exercisesTotalPages = Math.max(1, Math.ceil(filteredExercises.length / GRID_PAGE_SIZE));
  const paginatedExercises = paginateItems(filteredExercises, exercisesPage);

  async function loadExercises() {
    try {
      const response = await fetch(`${apiUrl}/exercises`);
      if (!response.ok) throw new Error('Não foi possível carregar os exercícios.');
      const data = (await response.json()) as Exercise[];
      setExercises(data);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar exercícios.');
    }
  }

  async function loadCompanies() {
    try {
      const response = await fetch(`${apiUrl}/companies`);
      if (!response.ok) throw new Error('Nao foi possivel carregar as empresas.');
      const data = (await response.json()) as Company[];
      setCompanies(data.filter((company) => company.boInativo === 0));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar empresas.');
    }
  }

  useEffect(() => {
    void loadExercises();
    void loadCompanies();
  }, []);

  useEffect(() => {
    setExercisesPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (exercisesPage > exercisesTotalPages) {
      setExercisesPage(exercisesTotalPages);
    }
  }, [exercisesPage, exercisesTotalPages]);

  useEffect(() => {
    if (!selectedExerciseId) {
      setExerciseFiles([]);
      setPreviewUrls({});
      setFileFeedback('');
      return;
    }

    void loadExerciseFiles(selectedExerciseId);
  }, [selectedExerciseId]);

  async function loadExerciseFiles(exerciseId: number) {
    try {
      const response = await fetch(`${apiUrl}/exercises/${exerciseId}/files`);
      if (!response.ok) throw new Error('Não foi possível carregar os arquivos do exercício.');
      const data = (await response.json()) as ExerciseFile[];
      setExerciseFiles(data);
      setFileFeedback('');

      const imageFiles = data.filter((file) => isImageFile(file.anCaminho));
      const urlEntries = await Promise.all(
        imageFiles.map(async (file) => {
          try {
            const urlResponse = await fetch(`${apiUrl}/exercises/${exerciseId}/files/${file.id}/url`);
            if (!urlResponse.ok) return null;
            const urlData = (await urlResponse.json()) as { url: string };
            return [file.id, urlData.url] as const;
          } catch {
            return null;
          }
        }),
      );

      const urls: Record<number, string> = {};
      for (const entry of urlEntries) {
        if (entry) urls[entry[0]] = entry[1];
      }
      setPreviewUrls(urls);
    } catch (error) {
      setFileFeedback(error instanceof Error ? error.message : 'Erro ao carregar arquivos.');
    }
  }

  function clearForm() {
    setSelectedExerciseId(null);
    setIsCreating(false);
    setSelectedCompanyId('');
    setExerciseName('');
    setIsExerciseActive(false);
    setFeedback('');
    setFileFeedback('');
    setExerciseFiles([]);
    setPreviewUrls({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleNewExercise() {
    clearForm();
    setIsCreating(true);
    setIsExerciseActive(true);
  }

  function handleSelectExercise(exercise: Exercise) {
    setSelectedExerciseId(exercise.id);
    setIsCreating(false);
    setSelectedCompanyId(exercise.idEmpresa ? String(exercise.idEmpresa) : '');
    setExerciseName(exercise.dsExercicio);
    setIsExerciseActive(exercise.boInativo === 0);
    setFeedback('');
    setFileFeedback('');
  }

  async function handleToggleStatus() {
    const nextActive = !isExerciseActive;
    setIsExerciseActive(nextActive);
    if (!selectedExerciseId) return;

    try {
      const response = await fetch(`${apiUrl}/exercises/${selectedExerciseId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: nextActive ? 0 : 1 }),
      });

      if (!response.ok) throw new Error('Nao foi possivel alterar o status.');
      const updated = (await response.json()) as Exercise;
      setExercises((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setIsExerciseActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const payload = {
        idEmpresa: selectedCompanyId ? Number(selectedCompanyId) : null,
        dsExercicio: exerciseName,
        boInativo: isExerciseActive ? 0 : 1,
      };

      const response = await fetch(
        selectedExerciseId ? `${apiUrl}/exercises/${selectedExerciseId}` : `${apiUrl}/exercises`,
        {
          method: selectedExerciseId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel salvar.');
      }

      const saved = (await response.json()) as Exercise;
      setExercises((current) => {
        if (selectedExerciseId) return current.map((item) => (item.id === saved.id ? saved : item));
        return [...current, saved].sort((a, b) => a.dsExercicio.localeCompare(b.dsExercicio));
      });
      setSelectedExerciseId(saved.id);
      setIsCreating(false);
      setFeedback('Exercicio salvo com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  async function handleUploadExerciseFile(file: File | null) {
    if (!file) return;
    if (!selectedExerciseId) {
      setFileFeedback('Salve o exercício antes de anexar arquivos.');
      return;
    }

    try {
      setIsUploadingFile(true);
      setFileFeedback('');
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiUrl}/exercises/${selectedExerciseId}/files`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel enviar o arquivo.');
      }

      await loadExerciseFiles(selectedExerciseId);
      setFileFeedback('Arquivo enviado com sucesso.');
    } catch (error) {
      setFileFeedback(error instanceof Error ? error.message : 'Erro ao enviar arquivo.');
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleOpenExerciseFile(fileId: number) {
    if (!selectedExerciseId) return;

    try {
      const response = await fetch(`${apiUrl}/exercises/${selectedExerciseId}/files/${fileId}/url`);
      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel abrir o arquivo.');
      }

      const data = (await response.json()) as { url: string };
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setFileFeedback(error instanceof Error ? error.message : 'Erro ao abrir arquivo.');
    }
  }

  async function handleRemoveExerciseFile(fileId: number) {
    if (!selectedExerciseId) return;

    try {
      const response = await fetch(`${apiUrl}/exercises/${selectedExerciseId}/files/${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel remover o arquivo.');
      }

      await loadExerciseFiles(selectedExerciseId);
      setFileFeedback('Arquivo removido.');
    } catch (error) {
      setFileFeedback(error instanceof Error ? error.message : 'Erro ao remover arquivo.');
    }
  }

  return (
    <div className="form-view">
      <div className="form-heading">
        <p className="section-label">Treino</p>
        <h2>Cadastro de Exercício</h2>
        <p>Cadastre os exercícios e anexe arquivos de apoio como imagens e vídeos.</p>
      </div>

      <div className="registration-split-layout">
        <section className="data-grid-section">
          <div className="grid-toolbar">
            <div>
              <p className="section-label">Exercícios</p>
              <h3>Exercícios cadastrados</h3>
            </div>
            <label className="search-field">
              <span>Pesquisar</span>
              <input
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar exercício"
                type="search"
                value={searchTerm}
              />
            </label>
            <button className="new-button" onClick={handleNewExercise} type="button">
              Novo exercício
            </button>
          </div>

          <div className="product-table" role="table" aria-label="Exercícios cadastrados">
            <div className="product-row header" role="row">
              <span role="columnheader">Exercício</span>
              <span role="columnheader">Empresa</span>
              <span role="columnheader">Status</span>
            </div>

            {paginatedExercises.map((exercise) => (
              <button
                className={`product-row selectable ${exercise.id === selectedExerciseId ? 'selected' : ''}`}
                key={exercise.id}
                onClick={() => handleSelectExercise(exercise)}
                role="row"
                type="button"
              >
                <span role="cell">{exercise.dsExercicio}</span>
                <span role="cell">
                  {companies.find((company) => company.id === exercise.idEmpresa)?.dsEmpresa ?? '-'}
                </span>
                <span role="cell">
                  <span className={`status-badge ${exercise.boInativo === 0 ? 'active' : 'inactive'}`}>
                    {exercise.boInativo === 0 ? 'Ativo' : 'Inativo'}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <GridPagination
            onChange={setExercisesPage}
            page={exercisesPage}
            totalItems={filteredExercises.length}
          />
        </section>

        <form className="registration-form split-form-panel" onSubmit={handleSaveExercise}>
          {!isFormEnabled ? <div className="form-hint">Selecione um exercício acima ou clique em Novo.</div> : null}
          {feedback ? <div className="form-feedback">{feedback}</div> : null}

          <div className="field">
            <label htmlFor="exerciseCompany">Empresa</label>
            <select
              disabled={!isFormEnabled}
              id="exerciseCompany"
              onChange={(event) => setSelectedCompanyId(event.target.value)}
              value={selectedCompanyId}
            >
              <option value="">Selecione uma empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.dsEmpresa}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="exerciseName">Nome do exercício</label>
            <input
              disabled={!isFormEnabled}
              id="exerciseName"
              maxLength={255}
              onChange={(event) => setExerciseName(event.target.value)}
              placeholder="Ex.: Supino reto"
              type="text"
              value={exerciseName}
            />
          </div>

          <div className="field">
            <label htmlFor="exerciseStatus">Status</label>
            <button
              aria-pressed={isExerciseActive}
              className={`status-toggle ${isExerciseActive ? 'active' : ''}`}
              disabled={!isFormEnabled}
              id="exerciseStatus"
              onClick={handleToggleStatus}
              type="button"
            >
              <span>{isExerciseActive ? 'Ativo' : 'Inativo'}</span>
            </button>
          </div>

          <div className="form-actions">
            <button className="secondary-button" disabled={!isFormEnabled} onClick={clearForm} type="button">
              Limpar
            </button>
            <button disabled={!isFormEnabled} type="submit">
              Salvar exercício
            </button>
          </div>

          <section className="student-files-section" aria-label="Arquivos do exercício">
            <div className="student-files-header">
              <h3>Arquivos do exercício</h3>
            </div>
            {!selectedExerciseId ? (
              <div className="form-hint">Salve ou selecione um exercício para anexar arquivos.</div>
            ) : null}
            {fileFeedback ? <div className="form-feedback">{fileFeedback}</div> : null}
            <div className="file-upload-controls">
              <input
                disabled={!selectedExerciseId || isUploadingFile}
                id="exerciseFile"
                onChange={(event) => {
                  const [file] = Array.from(event.target.files ?? []);
                  void handleUploadExerciseFile(file ?? null);
                }}
                ref={fileInputRef}
                type="file"
              />
            </div>

            <div className="student-files-list">
              {exerciseFiles.map((file) => (
                <div className="student-file-row" key={file.id}>
                  {previewUrls[file.id] ? (
                    <img alt={file.dsArquivo ?? file.anCaminho} className="student-file-preview" src={previewUrls[file.id]} />
                  ) : null}
                  <div className="student-file-row-info">
                    <strong>{file.dsArquivo ?? file.anCaminho.split('/').pop() ?? `Arquivo ${file.id}`}</strong>
                    <span>{file.anCaminho}</span>
                  </div>
                  <div className="student-file-actions">
                    <button className="secondary-button" onClick={() => void handleOpenExerciseFile(file.id)} type="button">
                      Visualizar
                    </button>
                    <button className="danger" onClick={() => void handleRemoveExerciseFile(file.id)} type="button">
                      Remover
                    </button>
                  </div>
                </div>
              ))}
              {selectedExerciseId && exerciseFiles.length === 0 ? (
                <div className="empty-row">Nenhum arquivo anexado.</div>
              ) : null}
            </div>
          </section>
        </form>
      </div>
    </div>
  );
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 9);

  if (digits.length <= 8) {
    return digits.replace(/^(\d{4})(\d)/, '$1-$2');
  }

  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

function toApiDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return null;
}

function isValidBirthDate(value: string) {
  const apiDate = toApiDate(value);

  if (!apiDate) {
    return false;
  }

  const [yearValue, monthValue, dayValue] = apiDate.split('-');
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date <= new Date(new Date().setHours(0, 0, 0, 0))
  );
}

function isImageFile(path: string) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(path);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function isValidCpf(value: string) {
  const cpf = onlyDigits(value);

  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
    return false;
  }

  const calculateDigit = (size: number) => {
    let sum = 0;

    for (let index = 0; index < size; index += 1) {
      sum += Number(cpf[index]) * (size + 1 - index);
    }

    const rest = (sum * 10) % 11;

    return rest === 10 ? 0 : rest;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

function StudentRegistration() {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const cpfInputRef = useRef<HTMLInputElement>(null);
  const birthDateInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsPage, setStudentsPage] = useState(1);
  const [studentFiles, setStudentFiles] = useState<StudentFile[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [studentCpf, setStudentCpf] = useState('');
  const [studentBirthDate, setStudentBirthDate] = useState('');
  const [studentDdd, setStudentDdd] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentCep, setStudentCep] = useState('');
  const [studentAddress, setStudentAddress] = useState('');
  const [studentAddressNumber, setStudentAddressNumber] = useState('');
  const [isStudentActive, setIsStudentActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [fileFeedback, setFileFeedback] = useState('');
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isStudentFieldsCollapsed, setIsStudentFieldsCollapsed] = useState(false);
  const [isStudentFilesCollapsed, setIsStudentFilesCollapsed] = useState(false);
  const [selectedStudentRelatedTable, setSelectedStudentRelatedTable] = useState('');
  const [studentRelatedRecords, setStudentRelatedRecords] = useState<CompanyChildRecord[]>([]);
  const [isLoadingStudentRelatedRecords, setIsLoadingStudentRelatedRecords] = useState(false);
  const [studentRelatedSearchTerm, setStudentRelatedSearchTerm] = useState('');
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [cameraFeedback, setCameraFeedback] = useState('');
  const [studentErrors, setStudentErrors] = useState<StudentValidationErrors>({});
  const [touchedStudentFields, setTouchedStudentFields] = useState<
    Partial<Record<StudentValidationField, boolean>>
  >({});
  const isFormEnabled = selectedStudentId !== null || isCreating;
  const studentRelatedConfig =
    studentRelatedTables.find((table) => table.key === selectedStudentRelatedTable) ?? null;
  const filteredStudentRelatedRecords = studentRelatedRecords.filter((record) =>
    studentRelatedConfig
      ? studentRelatedConfig.columns.some((column) =>
        formatChildSearchValue(record, column).includes(studentRelatedSearchTerm.toLowerCase()),
      )
      : false,
  );
  const filteredStudents = students.filter((student) => {
    const search = searchTerm.toLowerCase();

    return (
      student.nmAluno.toLowerCase().includes(search) ||
      student.caCPF.includes(searchTerm.replace(/\D/g, '')) ||
      student.anEmail.toLowerCase().includes(search)
    );
  });
  const studentsTotalPages = Math.max(1, Math.ceil(filteredStudents.length / GRID_PAGE_SIZE));
  const paginatedStudents = paginateItems(filteredStudents, studentsPage);

  async function loadStudents() {
    try {
      const response = await fetch(`${apiUrl}/students`);

      if (!response.ok) {
        throw new Error('Nao foi possivel carregar os alunos.');
      }

      const data = (await response.json()) as Student[];
      setStudents(data);
      setFeedback('');
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar alunos.',
      );
    }
  }

  useEffect(() => {
    void loadStudents();
  }, []);

  useEffect(() => {
    setStudentsPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (studentsPage > studentsTotalPages) {
      setStudentsPage(studentsTotalPages);
    }
  }, [studentsPage, studentsTotalPages]);

  useEffect(() => {
    if (!selectedStudentId) {
      setStudentFiles([]);
      setPreviewUrls({});
      setFileFeedback('');
      return;
    }

    void loadStudentFiles(selectedStudentId);
  }, [selectedStudentId]);

  useEffect(() => {
    setStudentRelatedSearchTerm('');
    void loadStudentRelatedRecords();
  }, [selectedStudentId, selectedStudentRelatedTable]);

  useEffect(() => {
    if (!isCameraModalOpen || !cameraStreamRef.current || !cameraVideoRef.current) {
      return;
    }

    cameraVideoRef.current.srcObject = cameraStreamRef.current;
    void cameraVideoRef.current.play();
  }, [isCameraModalOpen]);

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        for (const track of cameraStreamRef.current.getTracks()) {
          track.stop();
        }
        cameraStreamRef.current = null;
      }
    };
  }, []);

  function stopCameraStream() {
    if (cameraStreamRef.current) {
      for (const track of cameraStreamRef.current.getTracks()) {
        track.stop();
      }
      cameraStreamRef.current = null;
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
  }

  async function loadStudentFiles(studentId: number) {
    try {
      const response = await fetch(`${apiUrl}/students/${studentId}/files`);

      if (!response.ok) {
        throw new Error('Nao foi possivel carregar os arquivos do aluno.');
      }

      const data = (await response.json()) as StudentFile[];
      setStudentFiles(data);
      setFileFeedback('');

      const imageFiles = data.filter((file) => isImageFile(file.anCaminho));
      const urlEntries = await Promise.all(
        imageFiles.map(async (file) => {
          try {
            const urlResponse = await fetch(
              `${apiUrl}/students/${studentId}/files/${file.id}/url`,
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
      setPreviewUrls(urls);
    } catch (error) {
      setFileFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar arquivos.',
      );
    }
  }

  async function loadStudentRelatedRecords(
    studentId = selectedStudentId,
    config = studentRelatedConfig,
  ) {
    if (!config || !studentId) {
      setStudentRelatedRecords([]);
      setIsLoadingStudentRelatedRecords(false);
      return;
    }

    try {
      setIsLoadingStudentRelatedRecords(true);
      const response = await fetch(
        config.key === 'files'
          ? `${apiUrl}/students/${studentId}/files`
          : `${apiUrl}/students/${studentId}/related/${config.endpoint}`,
      );

      if (!response.ok) {
        throw new Error('Nao foi possivel carregar os registros relacionados.');
      }

      const data = (await response.json()) as CompanyChildRecord[];
      setStudentRelatedRecords(data);
    } catch (error) {
      setFileFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar registros relacionados.',
      );
      setStudentRelatedRecords([]);
    } finally {
      setIsLoadingStudentRelatedRecords(false);
    }
  }

  function clearForm() {
    setSelectedStudentId(null);
    setIsCreating(false);
    setStudentName('');
    setStudentCpf('');
    setStudentBirthDate('');
    setStudentDdd('');
    setStudentPhone('');
    setStudentEmail('');
    setStudentCep('');
    setStudentAddress('');
    setStudentAddressNumber('');
    setIsStudentActive(false);
    setStudentErrors({});
    setTouchedStudentFields({});
    setFeedback('');
    setFileFeedback('');
    setCameraFeedback('');
    setStudentFiles([]);
    setPreviewUrls({});
    setStudentRelatedRecords([]);
    setStudentRelatedSearchTerm('');
    setIsCameraModalOpen(false);
    setIsCapturingPhoto(false);
    stopCameraStream();

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  }

  function handleNewStudent() {
    clearForm();
    setIsCreating(true);
    setIsStudentActive(true);
  }

  function handleSelectStudent(student: Student) {
    setSelectedStudentId(student.id);
    setIsCreating(false);
    setStudentName(student.nmAluno);
    setStudentCpf(formatCpf(student.caCPF));
    setStudentBirthDate(formatDateInput(student.dtNascimento));
    setStudentDdd(student.nrDDD ? String(student.nrDDD) : '');
    setStudentPhone(formatPhone(student.nrContato ?? ''));
    setStudentEmail(student.anEmail);
    setStudentCep(student.anCEP);
    setStudentAddress(student.anLogradouro);
    setStudentAddressNumber(
      student.nrEndereco === null ? '' : String(student.nrEndereco),
    );
    setIsStudentActive(student.boInativo === 0);
    setFeedback('');
    setFileFeedback('');
    setStudentErrors({});
    setTouchedStudentFields({});
  }

  function handleSelectStudentRelatedTable(tableKey: string) {
    setSelectedStudentRelatedTable(tableKey);
    setIsStudentFilesCollapsed(false);
    setFileFeedback('');

    if (tableKey !== 'files') {
      setIsCameraModalOpen(false);
      setIsCapturingPhoto(false);
      setCameraFeedback('');
      stopCameraStream();
    }
  }

  function getStudentValidationErrors() {
    const errors: StudentValidationErrors = {};
    const trimmedEmail = studentEmail.trim();

    if (!studentName.trim()) {
      errors.name = 'Informe o nome do aluno.';
    }

    if (!isValidCpf(studentCpf)) {
      errors.cpf = 'Informe um CPF valido.';
    }

    if (!studentBirthDate) {
      errors.birthDate = 'Informe a data de nascimento.';
    } else if (!isValidBirthDate(studentBirthDate)) {
      errors.birthDate = 'Informe uma data de nascimento valida.';
    }

    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      errors.email = 'Informe um email valido.';
    }

    return errors;
  }

  function validateStudentField(field: StudentValidationField) {
    const errors = getStudentValidationErrors();

    setTouchedStudentFields((current) => ({
      ...current,
      [field]: true,
    }));
    setStudentErrors((current) => ({
      ...current,
      [field]: errors[field],
    }));

    return !errors[field];
  }

  function focusFirstStudentError(errors: StudentValidationErrors) {
    if (errors.name) {
      nameInputRef.current?.focus();
      return;
    }

    if (errors.cpf) {
      cpfInputRef.current?.focus();
      return;
    }

    if (errors.birthDate) {
      birthDateInputRef.current?.focus();
      return;
    }

    if (errors.email) {
      emailInputRef.current?.focus();
    }
  }

  async function handleToggleStatus() {
    const nextActive = !isStudentActive;
    setIsStudentActive(nextActive);

    if (!selectedStudentId) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/students/${selectedStudentId}/status`, {
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

      const updatedStudent = (await response.json()) as Student;
      setStudents((current) =>
        current.map((student) =>
          student.id === updatedStudent.id ? updatedStudent : student,
        ),
      );
    } catch (error) {
      setIsStudentActive(!nextActive);
      setFeedback(
        error instanceof Error ? error.message : 'Erro ao alterar status.',
      );
    }
  }

  async function handleSaveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const apiBirthDate = studentBirthDate ? toApiDate(studentBirthDate) : null;
      const trimmedEmail = studentEmail.trim();
      const errors = getStudentValidationErrors();

      if (Object.keys(errors).length > 0) {
        setStudentErrors(errors);
        setTouchedStudentFields({
          birthDate: true,
          cpf: true,
          email: true,
          name: true,
        });
        setFeedback(Object.values(errors)[0] ?? 'Revise os campos destacados.');
        focusFirstStudentError(errors);
        return;
      }

      const payload = {
        nmAluno: studentName,
        caCPF: onlyDigits(studentCpf),
        dtNascimento: apiBirthDate,
        nrDDD: Number(studentDdd || 0),
        nrContato: onlyDigits(studentPhone) || null,
        anEmail: trimmedEmail,
        anCEP: studentCep,
        anLogradouro: studentAddress,
        nrEndereco: studentAddressNumber ? Number(studentAddressNumber) : null,
        boInativo: isStudentActive ? 0 : 1,
      };
      const response = await fetch(
        selectedStudentId
          ? `${apiUrl}/students/${selectedStudentId}`
          : `${apiUrl}/students`,
        {
          method: selectedStudentId ? 'PUT' : 'POST',
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

      const savedStudent = (await response.json()) as Student;
      setStudents((current) => {
        if (selectedStudentId) {
          return current.map((student) =>
            student.id === savedStudent.id ? savedStudent : student,
          );
        }

        return [...current, savedStudent].sort((a, b) =>
          a.nmAluno.localeCompare(b.nmAluno),
        );
      });
      setSelectedStudentId(savedStudent.id);
      setIsCreating(false);
      setFeedback('Aluno salvo com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  async function handleUploadStudentFile(file: File | null) {
    if (!file) {
      return;
    }

    if (!selectedStudentId) {
      setFileFeedback('Salve o aluno antes de anexar arquivos.');
      return;
    }

    try {
      setIsUploadingFile(true);
      setFileFeedback('');

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiUrl}/students/${selectedStudentId}/files`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel enviar o arquivo.');
      }

      await loadStudentFiles(selectedStudentId);
      if (selectedStudentRelatedTable === 'files') {
        await loadStudentRelatedRecords(selectedStudentId, studentRelatedConfig);
      }
      setFileFeedback('Arquivo enviado com sucesso.');
    } catch (error) {
      setFileFeedback(
        error instanceof Error ? error.message : 'Erro ao enviar arquivo.',
      );
    } finally {
      setIsUploadingFile(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (cameraInputRef.current) {
        cameraInputRef.current.value = '';
      }
    }
  }

  function handleOpenCameraCapture() {
    if (!selectedStudentId || isUploadingFile) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setFileFeedback('Camera nao suportada neste navegador.');
      cameraInputRef.current?.click();
      return;
    }

    void (async () => {
      try {
        setCameraFeedback('');

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: {
              ideal: 'environment',
            },
          },
        });

        cameraStreamRef.current = stream;
        setIsCameraModalOpen(true);
      } catch {
        setFileFeedback('Nao foi possivel acessar a camera. Selecione um arquivo.');
        cameraInputRef.current?.click();
      }
    })();
  }

  function handleCloseCameraCapture() {
    setIsCameraModalOpen(false);
    setIsCapturingPhoto(false);
    setCameraFeedback('');
    stopCameraStream();
  }

  async function handleCaptureCameraPhoto() {
    if (!selectedStudentId || !cameraVideoRef.current || isCapturingPhoto) {
      return;
    }

    try {
      setIsCapturingPhoto(true);
      setCameraFeedback('');

      const video = cameraVideoRef.current;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Nao foi possivel capturar a imagem.');
      }

      context.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.9);
      });

      if (!blob) {
        throw new Error('Nao foi possivel capturar a imagem.');
      }

      const file = new File([blob], `aluno-${selectedStudentId}-${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });

      handleCloseCameraCapture();
      await handleUploadStudentFile(file);
    } catch (error) {
      setCameraFeedback(
        error instanceof Error ? error.message : 'Erro ao capturar a foto.',
      );
      setIsCapturingPhoto(false);
    }
  }

  async function handleOpenStudentFile(fileId: number) {
    if (!selectedStudentId) {
      return;
    }

    try {
      const response = await fetch(
        `${apiUrl}/students/${selectedStudentId}/files/${fileId}/url`,
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel abrir o arquivo.');
      }

      const data = (await response.json()) as { url: string };
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setFileFeedback(
        error instanceof Error ? error.message : 'Erro ao abrir arquivo.',
      );
    }
  }

  async function handleRemoveStudentFile(fileId: number) {
    if (!selectedStudentId) {
      return;
    }

    try {
      const response = await fetch(
        `${apiUrl}/students/${selectedStudentId}/files/${fileId}`,
        {
          method: 'DELETE',
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel remover o arquivo.');
      }

      await loadStudentFiles(selectedStudentId);
      if (selectedStudentRelatedTable === 'files') {
        await loadStudentRelatedRecords(selectedStudentId, studentRelatedConfig);
      }
      setFileFeedback('Arquivo removido.');
    } catch (error) {
      setFileFeedback(
        error instanceof Error ? error.message : 'Erro ao remover arquivo.',
      );
    }
  }

  return (
    <div className="form-view">
      <div className="form-heading">
        <p className="section-label">Matrículas</p>
      </div>

      <div className="registration-split-layout student-split-layout">
        <section className="data-grid-section">
          <div className="grid-toolbar">
            <div className="child-grid-toolbar-label">
              <p className="section-label">Alunos</p>
            </div>
            <div className="child-grid-toolbar-actions">
              <label className="search-field">
                <span>Pesquisar</span>
                <input
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar aluno"
                  type="search"
                  value={searchTerm}
                />
              </label>
              <button className="new-button" onClick={handleNewStudent} type="button">
                Novo aluno
              </button>
            </div>
          </div>

          <div className="product-table" role="table" aria-label="Alunos cadastrados">
            <div className="product-row header" role="row">
              <span role="columnheader">Aluno</span>
              <span role="columnheader">CPF</span>
              <span role="columnheader">Status</span>
            </div>

            {paginatedStudents.map((student) => (
              <button
                className={`product-row selectable ${student.id === selectedStudentId ? 'selected' : ''
                  }`}
                key={student.id}
                onClick={() => handleSelectStudent(student)}
                role="row"
                type="button"
              >
                <span role="cell">{student.nmAluno}</span>
                <span role="cell">{formatCpf(student.caCPF)}</span>
                <span role="cell">
                  <span
                    className={`status-badge ${student.boInativo === 0 ? 'active' : 'inactive'
                      }`}
                  >
                    {student.boInativo === 0 ? 'Ativo' : 'Inativo'}
                  </span>
                </span>
              </button>
            ))}

            {filteredStudents.length === 0 ? (
              <div className="empty-row">Nenhum aluno encontrado.</div>
            ) : null}
          </div>
          <GridPagination
            onChange={setStudentsPage}
            page={studentsPage}
            totalItems={filteredStudents.length}
          />

          {studentRelatedConfig ? (
            <section className="company-child-grid-section">
              {!selectedStudentId ? (
                <div className="form-hint">
                  Selecione um aluno para visualizar os registros relacionados.
                </div>
              ) : (
                <>
                  <div className="grid-toolbar">
                    <div className="child-grid-toolbar-label">
                      <p className="section-label">{studentRelatedConfig.label}</p>
                    </div>
                    <div className="child-grid-toolbar-actions">
                      <label className="search-field">
                        <span>Pesquisar</span>
                        <input
                          onChange={(event) => setStudentRelatedSearchTerm(event.target.value)}
                          placeholder="Buscar registro"
                          type="search"
                          value={studentRelatedSearchTerm}
                        />
                      </label>
                    </div>
                  </div>

                  <div
                    className="product-table company-child-grid-table"
                    role="table"
                    aria-label={studentRelatedConfig.title}
                  >
                    <div
                      className="product-row company-child-grid-row header"
                      role="row"
                      style={{
                        gridTemplateColumns: `repeat(${studentRelatedConfig.columns.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {studentRelatedConfig.columns.map((column) => (
                        <span key={column.key} role="columnheader">
                          {column.label}
                        </span>
                      ))}
                    </div>

                    {isLoadingStudentRelatedRecords ? (
                      <div className="empty-row">
                        Carregando {studentRelatedConfig.label.toLowerCase()}...
                      </div>
                    ) : null}

                    {!isLoadingStudentRelatedRecords
                      ? filteredStudentRelatedRecords.map((record) => (
                        <div
                          className="product-row company-child-grid-row"
                          key={record.id}
                          role="row"
                          style={{
                            gridTemplateColumns: `repeat(${studentRelatedConfig.columns.length}, minmax(0, 1fr))`,
                          }}
                        >
                          {studentRelatedConfig.columns.map((column) => (
                            <span key={column.key} role="cell">
                              {formatChildCell(record, column)}
                            </span>
                          ))}
                        </div>
                      ))
                      : null}

                    {!isLoadingStudentRelatedRecords && filteredStudentRelatedRecords.length === 0 ? (
                      <div className="empty-row">
                        Nenhum registro de {studentRelatedConfig.label.toLowerCase()} encontrado.
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </section>
          ) : null}
        </section>

        <div className="split-form-stack">
          <form
            className={`registration-form split-form-panel ${isStudentFieldsCollapsed ? 'collapsed' : ''}`}
            onSubmit={handleSaveStudent}
          >
            <div className="collapsible-panel-header">
              <div>
                <p className="section-label">Aluno</p>
              </div>
              <button
                aria-expanded={!isStudentFieldsCollapsed}
                className="secondary-button"
                onClick={() => setIsStudentFieldsCollapsed((current) => !current)}
                type="button"
              >
                {isStudentFieldsCollapsed ? '+' : '-'}
              </button>
            </div>

            {!isStudentFieldsCollapsed ? (
              <>
                {!isFormEnabled ? (
                  <div className="form-hint">
                    Selecione um aluno acima para editar ou clique em Novo aluno.
                  </div>
                ) : null}

                {feedback ? <div className="form-feedback">{feedback}</div> : null}

                <div className="field">
                  <label htmlFor="nmAluno">Nome *</label>
                  <input
                    className={
                      touchedStudentFields.name && studentErrors.name ? 'invalid' : ''
                    }
                    disabled={!isFormEnabled}
                    id="nmAluno"
                    maxLength={255}
                    onBlur={() => validateStudentField('name')}
                    onChange={(event) => {
                      const value = event.target.value;
                      setStudentName(value);

                      if (touchedStudentFields.name) {
                        setStudentErrors((current) => ({
                          ...current,
                          name: value.trim() ? undefined : 'Informe o nome do aluno.',
                        }));
                      }
                    }}
                    placeholder="Ex.: Maria Souza"
                    ref={nameInputRef}
                    type="text"
                    value={studentName}
                  />
                  {touchedStudentFields.name && studentErrors.name ? (
                    <span className="field-error">{studentErrors.name}</span>
                  ) : null}
                </div>

                <div className="field two-columns">
                  <div>
                    <label htmlFor="caCPF">CPF</label>
                    <input
                      className={
                        touchedStudentFields.cpf && studentErrors.cpf ? 'invalid' : ''
                      }
                      disabled={!isFormEnabled}
                      id="caCPF"
                      maxLength={14}
                      onBlur={() => validateStudentField('cpf')}
                      onChange={(event) => {
                        const formattedCpf = formatCpf(event.target.value);
                        setStudentCpf(formattedCpf);

                        if (touchedStudentFields.cpf) {
                          setStudentErrors((current) => ({
                            ...current,
                            cpf: isValidCpf(formattedCpf)
                              ? undefined
                              : 'Informe um CPF valido.',
                          }));
                        }
                      }}
                      placeholder="000.000.000-00"
                      ref={cpfInputRef}
                      type="text"
                      value={studentCpf}
                    />
                    {touchedStudentFields.cpf && studentErrors.cpf ? (
                      <span className="field-error">{studentErrors.cpf}</span>
                    ) : null}
                  </div>
                  <div>
                    <label htmlFor="dtNascimento">Data de nascimento *</label>
                    <input
                      className={
                        touchedStudentFields.birthDate && studentErrors.birthDate
                          ? 'invalid'
                          : ''
                      }
                      disabled={!isFormEnabled}
                      id="dtNascimento"
                      max={new Date().toISOString().slice(0, 10)}
                      onBlur={() => validateStudentField('birthDate')}
                      onChange={(event) => {
                        const value = event.target.value;
                        setStudentBirthDate(value);

                        if (touchedStudentFields.birthDate) {
                          setStudentErrors((current) => ({
                            ...current,
                            birthDate: isValidBirthDate(value)
                              ? undefined
                              : 'Informe uma data de nascimento valida.',
                          }));
                        }
                      }}
                      ref={birthDateInputRef}
                      type="date"
                      value={studentBirthDate}
                    />
                    {touchedStudentFields.birthDate && studentErrors.birthDate ? (
                      <span className="field-error">{studentErrors.birthDate}</span>
                    ) : null}
                  </div>
                </div>

                <div className="field two-columns">
                  <div>
                    <label htmlFor="nrDDD">DDD</label>
                    <input
                      disabled={!isFormEnabled}
                      id="nrDDD"
                      maxLength={2}
                      onChange={(event) => setStudentDdd(event.target.value)}
                      placeholder="11"
                      type="text"
                      value={studentDdd}
                    />
                  </div>
                  <div>
                    <label htmlFor="nrContato">Telefone</label>
                    <input
                      disabled={!isFormEnabled}
                      id="nrContato"
                      maxLength={10}
                      onChange={(event) => setStudentPhone(formatPhone(event.target.value))}
                      placeholder="00000-0000"
                      type="text"
                      value={studentPhone}
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="anEmail">Email</label>
                  <input
                    className={
                      touchedStudentFields.email && studentErrors.email ? 'invalid' : ''
                    }
                    disabled={!isFormEnabled}
                    id="anEmail"
                    maxLength={100}
                    onBlur={() => validateStudentField('email')}
                    onChange={(event) => {
                      const value = event.target.value;
                      setStudentEmail(value);

                      if (touchedStudentFields.email) {
                        const trimmedEmail = value.trim();
                        setStudentErrors((current) => ({
                          ...current,
                          email:
                            trimmedEmail && !isValidEmail(trimmedEmail)
                              ? 'Informe um email valido.'
                              : undefined,
                        }));
                      }
                    }}
                    placeholder="aluno@email.com"
                    ref={emailInputRef}
                    type="email"
                    value={studentEmail}
                  />
                  {touchedStudentFields.email && studentErrors.email ? (
                    <span className="field-error">{studentErrors.email}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="anLogradouro">Logradouro</label>
                  <input
                    disabled={!isFormEnabled}
                    id="anLogradouro"
                    maxLength={100}
                    onChange={(event) => setStudentAddress(event.target.value)}
                    placeholder="Rua, avenida..."
                    type="text"
                    value={studentAddress}
                  />
                </div>

                <div className="field two-columns">
                  <div>
                    <label htmlFor="anCEP">CEP</label>
                    <input
                      disabled={!isFormEnabled}
                      id="anCEP"
                      maxLength={8}
                      onChange={(event) => setStudentCep(event.target.value)}
                      placeholder="Somente numeros"
                      type="text"
                      value={studentCep}
                    />
                  </div>
                  <div>
                    <label htmlFor="nrEndereco">Número</label>
                    <input
                      disabled={!isFormEnabled}
                      id="nrEndereco"
                      onChange={(event) => setStudentAddressNumber(event.target.value)}
                      placeholder="0"
                      type="number"
                      value={studentAddressNumber}
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="studentStatus">Status</label>
                  <button
                    aria-pressed={isStudentActive}
                    className={`status-toggle ${isStudentActive ? 'active' : ''}`}
                    disabled={!isFormEnabled}
                    id="studentStatus"
                    onClick={handleToggleStatus}
                    type="button"
                  >
                    <span>{isStudentActive ? 'Ativo' : 'Inativo'}</span>
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
                    Salvar aluno
                  </button>
                </div>
              </>
            ) : null}
          </form>

          {selectedStudentRelatedTable === 'files' ? (
            <section className={`registration-form student-files-section ${isStudentFilesCollapsed ? 'collapsed' : ''}`}>
              <div className="student-files-header collapsible-panel-header">
                <div>
                  <p className="section-label">Arquivos</p>
                </div>
                <button
                  aria-expanded={!isStudentFilesCollapsed}
                  className="secondary-button"
                  onClick={() => setIsStudentFilesCollapsed((current) => !current)}
                  type="button"
                >
                  {isStudentFilesCollapsed ? '+' : '-'}
                </button>
              </div>

              {!isStudentFilesCollapsed ? (
                <>
                  {!selectedStudentId ? (
                    <div className="form-hint">
                      Salve ou selecione um aluno para anexar arquivos.
                    </div>
                  ) : null}

                  {fileFeedback ? <div className="form-feedback">{fileFeedback}</div> : null}

                  <div className="field">
                    <label htmlFor="studentFile">Selecionar arquivo</label>
                    <div className="file-upload-controls">
                      <input
                        disabled={!selectedStudentId || isUploadingFile}
                        id="studentFile"
                        onChange={(event) =>
                          void handleUploadStudentFile(event.target.files?.[0] ?? null)
                        }
                        ref={fileInputRef}
                        type="file"
                      />
                      <button
                        className="secondary-button"
                        disabled={!selectedStudentId || isUploadingFile}
                        onClick={handleOpenCameraCapture}
                        type="button"
                      >
                        Tirar foto
                      </button>
                    </div>
                    <input
                      accept="image/*"
                      capture="environment"
                      className="camera-capture-input"
                      disabled={!selectedStudentId || isUploadingFile}
                      onChange={(event) =>
                        void handleUploadStudentFile(event.target.files?.[0] ?? null)
                      }
                      ref={cameraInputRef}
                      type="file"
                    />
                  </div>

                  {isCameraModalOpen ? (
                    <div className="camera-modal-overlay" role="dialog" aria-modal="true">
                      <div className="camera-modal">
                        <h4>Capturar foto</h4>
                        <video
                          autoPlay
                          className="camera-live-preview"
                          muted
                          playsInline
                          ref={cameraVideoRef}
                        />
                        {cameraFeedback ? (
                          <p className="camera-modal-feedback">{cameraFeedback}</p>
                        ) : null}
                        <div className="camera-modal-actions">
                          <button
                            className="secondary-button"
                            onClick={handleCloseCameraCapture}
                            type="button"
                          >
                            Cancelar
                          </button>
                          <button
                            disabled={isCapturingPhoto || isUploadingFile}
                            onClick={() => void handleCaptureCameraPhoto()}
                            type="button"
                          >
                            {isCapturingPhoto ? 'Capturando...' : 'Capturar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="student-files-list">
                    {studentFiles.map((file) => (
                      <div className="student-file-row" key={file.id}>
                        {previewUrls[file.id] ? (
                          <img
                            alt={file.anCaminho.split('/').pop()}
                            className="student-file-preview"
                            src={previewUrls[file.id]}
                          />
                        ) : null}
                        <div className="student-file-row-info">
                          <strong>{file.anCaminho.split('/').pop()}</strong>
                          <span>{file.anCaminho}</span>
                        </div>
                        <div className="student-file-actions">
                          <button
                            className="secondary-button"
                            onClick={() => void handleOpenStudentFile(file.id)}
                            type="button"
                          >
                            Abrir
                          </button>
                          <button
                            className="secondary-button danger"
                            onClick={() => void handleRemoveStudentFile(file.id)}
                            type="button"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}

                    {selectedStudentId && studentFiles.length === 0 ? (
                      <div className="empty-row">Nenhum arquivo anexado.</div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </section>
          ) : selectedStudentRelatedTable ? (
            <section className="registration-form student-files-section">
              <div className="collapsible-panel-header">
                <div>
                  <p className="section-label">
                    {studentRelatedTables.find((table) => table.key === selectedStudentRelatedTable)?.label}
                  </p>
                </div>
              </div>
              <div className="form-hint">Tabela relacionada preparada para os próximos cadastros.</div>
            </section>
          ) : null}
        </div>

        <section className="company-child-tabs" aria-label="Tabelas relacionadas do aluno">
          <div className="company-child-tabs-list" role="tablist" aria-label="Tabelas relacionadas do aluno">
            {studentRelatedTables.map((table) => (
              <button
                aria-selected={selectedStudentRelatedTable === table.key}
                className={selectedStudentRelatedTable === table.key ? 'active' : ''}
                key={table.key}
                onClick={() => handleSelectStudentRelatedTable(table.key)}
                role="tab"
                type="button"
              >
                {table.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

type RegisterLookupRecord = {
  id: number;
  type: 'student' | 'employee';
  name: string;
  cpf: string;
  birthDate: string | null;
  ddd: number | string;
  phone: number | string | null;
  email: string;
  hasUser: boolean;
};

function getPasswordValidationMessage(password: string) {
  if (password.length < 6) {
    return 'A senha deve ter pelo menos 6 caracteres.';
  }

  if (password.length > 20) {
    return 'A senha deve ter no máximo 20 caracteres.';
  }

  if (/\s/.test(password)) {
    return 'A senha não pode conter espaços.';
  }

  if (!/\d/.test(password)) {
    return 'A senha deve conter pelo menos 1 número.';
  }

  if ((password.match(/[a-zA-Z]/g) ?? []).length < 3) {
    return 'A senha deve conter pelo menos 3 letras.';
  }

  return '';
}

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeItem, setActiveItem] = useState('Meu Treino');
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [authUserName, setAuthUserName] = useState('Joao Silva');
  const [authUserRole, setAuthUserRole] = useState('Administrador');
  const [loginMode, setLoginMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [loginCpf, setLoginCpf] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [forgotCpf, setForgotCpf] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [registerType, setRegisterType] = useState<'student' | 'employee'>('student');
  const [registerCpf, setRegisterCpf] = useState('');
  const [registerLookup, setRegisterLookup] = useState<RegisterLookupRecord | null>(null);
  const [authFeedback, setAuthFeedback] = useState('');
  const [registerLookupFeedback, setRegisterLookupFeedback] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isLookingUpRegister, setIsLookingUpRegister] = useState(false);
  const [registerPassword, setRegisterPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const passwordRequirements = [
    {
      label: 'Pelo menos 1 número',
      met: /\d/.test(registerPassword),
    },
    {
      label: 'Pelo menos 3 letras',
      met: (registerPassword.match(/[a-zA-Z]/g) ?? []).length >= 3,
    },
    {
      label: 'Pelo menos 6 caracteres',
      met: registerPassword.length >= 6,
    },
    {
      label: 'No máximo 20 caracteres',
      met: registerPassword.length > 0 && registerPassword.length <= 20,
    },
    {
      label: 'Sem espaços',
      met: registerPassword.length > 0 && !/\s/.test(registerPassword),
    },
  ];

  async function lookupRegisterCpf(type = registerType, cpfValue = registerCpf) {
    const cpf = cpfValue.replace(/\D/g, '');

    setRegisterLookup(null);
    setRegisterLookupFeedback('');

    if (!cpf) {
      return;
    }

    if (cpf.length !== 11 || !isValidCpf(cpf)) {
      setRegisterLookupFeedback('Informe um CPF válido para buscar o cadastro.');
      return;
    }

    try {
      setIsLookingUpRegister(true);
      const response = await fetch(
        `${apiUrl}/auth/register-lookup?type=${type}&cpf=${cpf}`,
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'CPF não encontrado.');
      }

      const data = (await response.json()) as RegisterLookupRecord;
      setRegisterLookup(data);
      setRegisterLookupFeedback(
        data.hasUser
          ? 'Este CPF já possui usuário cadastrado.'
          : 'Cadastro encontrado. Confira os dados e crie sua senha.',
      );
    } catch (error) {
      setRegisterLookupFeedback(
        error instanceof Error ? error.message : 'CPF não encontrado no cadastro.',
      );
    } finally {
      setIsLookingUpRegister(false);
    }
  }

  function handleChangeRegisterType(type: 'student' | 'employee') {
    setRegisterType(type);
    setRegisterLookup(null);
    setRegisterLookupFeedback('');

    if (registerCpf.replace(/\D/g, '').length === 11) {
      void lookupRegisterCpf(type, registerCpf);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthFeedback('');

    const formData = new FormData(event.currentTarget);

    try {
      setIsSubmittingAuth(true);
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          login: String(formData.get('user') ?? ''),
          password: String(formData.get('password') ?? ''),
        }),
      });
      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel entrar.');
      }

      const user = (await response.json()) as {
        name: string;
        type: 'student' | 'employee';
      };
      setAuthUserName(user.name);
      setAuthUserRole(user.type === 'student' ? 'Aluno' : 'Funcionário');
      setIsLoggedIn(true);
    } catch (error) {
      setAuthFeedback(error instanceof Error ? error.message : 'Erro ao entrar.');
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthFeedback('');
    setForgotEmail('');

    try {
      setIsSubmittingAuth(true);
      const response = await fetch(`${apiUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cpf: forgotCpf,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel enviar o email.');
      }

      const data = (await response.json()) as {
        email: string;
        message: string;
      };
      setForgotEmail(data.email);
      setAuthFeedback(data.message);
    } catch (error) {
      setAuthFeedback(
        error instanceof Error ? error.message : 'Erro ao enviar email de redefinicao.',
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthFeedback('');

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      type: registerType,
      cpf: String(formData.get('cpf') ?? ''),
      email: registerLookup?.email ?? '',
      password: String(formData.get('password') ?? ''),
    };
    const passwordMessage = getPasswordValidationMessage(payload.password);

    if (passwordMessage) {
      setAuthFeedback(passwordMessage);
      return;
    }

    if (!registerLookup || registerLookup.hasUser) {
      setRegisterLookupFeedback('Busque um CPF cadastrado e disponível antes de criar o usuário.');
      return;
    }

    try {
      setIsSubmittingAuth(true);
      const response = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel criar o cadastro.');
      }

      const loginResponse = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          login: payload.cpf,
          password: payload.password,
        }),
      });

      if (!loginResponse.ok) {
        const errorBody = (await loginResponse.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Cadastro criado, mas nao foi possivel entrar automaticamente.');
      }

      const user = (await loginResponse.json()) as {
        name: string;
        type: 'student' | 'employee';
      };
      form.reset();
      setRegisterCpf('');
      setRegisterLookup(null);
      setRegisterLookupFeedback('');
      setRegisterPassword('');
      setShowRegisterPassword(false);
      setAuthFeedback('');
      setAuthUserName(user.name);
      setAuthUserRole(user.type === 'student' ? 'Aluno' : 'FuncionÃ¡rio');
      setIsLoggedIn(true);
    } catch (error) {
      setAuthFeedback(
        error instanceof Error ? error.message : 'Erro ao criar cadastro.',
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  if (isLoggedIn) {
    return (
      <main className={`home-page ${isMenuOpen ? '' : 'menu-collapsed'}`}>
        <header className="app-header">
          <div className="header-brand">
            <div className="logo" aria-hidden="true">
              SG
            </div>
            <div>
              <p className="eyebrow">SmartGym</p>
              <strong>Academia Cliente</strong>
            </div>
          </div>

          <div className="user-profile">
            <div className="user-avatar" aria-hidden="true">
              {authUserName
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((name) => name[0])
                .join('')
                .toUpperCase()}
            </div>
            <div>
              <strong>{authUserName}</strong>
              <span>{authUserRole}</span>
            </div>
          </div>
        </header>

        <aside className="side-menu" aria-label="Menu principal">
          <button
            aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            className={`menu-hamburger ${isMenuOpen ? 'open' : ''}`}
            onClick={() => setIsMenuOpen((current) => !current)}
            title={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            type="button"
          >
            <span />
            <span />
            <span />
          </button>

          {isMenuOpen ? (
            <>
              <div className="side-menu-header">
                <p className="eyebrow">Menu</p>
                <strong>Principal</strong>
              </div>

              <nav className="menu-nav">
                {menuGroups.map((group) => (
                  <div className="menu-group" key={group.title}>
                    <p>{group.title}</p>
                    {group.items.map((item) => (
                      <button
                        className={item === activeItem ? 'active' : ''}
                        key={item}
                        onClick={() => {
                          setActiveItem(item);
                          setIsMenuOpen(false);
                        }}
                        type="button"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
            </>
          ) : null}
        </aside>

        <section className="home-content">
          {activeItem === 'Empresas' ? (
            <CompanyRegistration />
          ) : activeItem === 'Exercícios' ? (
            <ExerciseRegistration />
          ) : activeItem === 'Produtos' ? (
            <ProductRegistration />
          ) : activeItem === 'Matrículas' ? (
            <StudentRegistration />
          ) : activeItem === 'Domínios' ? (
            <DomainRegistration />
          ) : (
            <div className="welcome">
              <p className="section-label">Menu selecionado</p>
              <h2>{activeItem}</h2>
              <p>
                Esta area vai receber o conteudo de cada modulo conforme
                avancarmos nos cadastros, movimentacoes e consultas.
              </p>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            SG
          </div>
          <div>
            <p className="eyebrow">SmartGym</p>
            <h1 id="login-title">
              {loginMode === 'login'
                ? 'Entrar na sua conta'
                : loginMode === 'register'
                  ? 'Criar cadastro'
                  : 'Redefinir senha'}
            </h1>
          </div>
        </div>

        <div className="login-mode-toggle" role="tablist" aria-label="Acesso">
          <button
            aria-selected={loginMode === 'login'}
            className={loginMode === 'login' ? 'active' : ''}
            onClick={() => {
              setLoginMode('login');
              setAuthFeedback('');
              setForgotEmail('');
            }}
            role="tab"
            type="button"
          >
            Entrar
          </button>
          <button
            aria-selected={loginMode === 'register'}
            className={loginMode === 'register' ? 'active' : ''}
            onClick={() => {
              setLoginMode('register');
              setAuthFeedback('');
              setForgotEmail('');
            }}
            role="tab"
            type="button"
          >
            Criar cadastro
          </button>
        </div>

        {authFeedback ? <div className="login-feedback">{authFeedback}</div> : null}

        {loginMode === 'login' ? (
          <form
            className="login-form"
            onSubmit={handleLogin}
          >
            <label htmlFor="user">CPF</label>
            <input
              id="user"
              name="user"
              onChange={(event) => setLoginCpf(formatCpf(event.target.value))}
              type="text"
              autoComplete="username"
              placeholder="000.000.000-00"
              value={loginCpf}
            />

            <label htmlFor="password">Senha</label>
            <div className="password-field">
              <input
                id="password"
                name="password"
                type={showLoginPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Digite sua senha"
              />
              <button
                aria-label={showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showLoginPassword}
                className="password-eye-button"
                onClick={() => setShowLoginPassword((current) => !current)}
                type="button"
              >
                <span aria-hidden="true" />
              </button>
            </div>

            <a
              className="forgot-link"
              onClick={() => {
                setLoginMode('forgot');
                setAuthFeedback('');
                setForgotEmail('');
              }}
              type="button"
            >
              Esqueci minha senha
            </a>

            <button disabled={isSubmittingAuth} type="submit">
              {isSubmittingAuth ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        ) : loginMode === 'forgot' ? (
          <form className="login-form" onSubmit={handleForgotPassword}>
            <label htmlFor="forgotCpf">CPF</label>
            <input
              id="forgotCpf"
              name="cpf"
              onChange={(event) => {
                setForgotCpf(formatCpf(event.target.value));
                setForgotEmail('');
                setAuthFeedback('');
              }}
              placeholder="000.000.000-00"
              required
              type="text"
              value={forgotCpf}
            />

            {forgotEmail ? (
              <>
                <label>Email cadastrado</label>
                <div aria-label="Email cadastrado" className="login-locked-value">
                  {forgotEmail}
                </div>
              </>
            ) : null}

            <button disabled={isSubmittingAuth} type="submit">
              {isSubmittingAuth ? 'Enviando...' : 'Enviar email de teste'}
            </button>

            <button
              className="secondary-login-button"
              onClick={() => {
                setLoginMode('login');
                setAuthFeedback('');
                setForgotEmail('');
              }}
              type="button"
            >
              Voltar para entrar
            </button>
          </form>
        ) : (
          <form className="login-form" onSubmit={handleRegister}>
            <label htmlFor="registerCpf">CPF</label>
            <input
              id="registerCpf"
              name="cpf"
              onBlur={() => void lookupRegisterCpf()}
              onChange={(event) => {
                setRegisterCpf(formatCpf(event.target.value));
                setRegisterLookup(null);
                setRegisterLookupFeedback('');
              }}
              placeholder="000.000.000-00"
              required
              type="text"
              value={registerCpf}
            />

            <div className="account-type-toggle" role="radiogroup" aria-label="Tipo de cadastro">
              <button
                aria-checked={registerType === 'student'}
                className={registerType === 'student' ? 'active' : ''}
                onClick={() => handleChangeRegisterType('student')}
                role="radio"
                type="button"
              >
                Aluno
              </button>
              <button
                aria-checked={registerType === 'employee'}
                className={registerType === 'employee' ? 'active' : ''}
                onClick={() => handleChangeRegisterType('employee')}
                role="radio"
                type="button"
              >
                Funcionário
              </button>
            </div>

            {registerLookupFeedback ? (
              <div className="login-feedback">{registerLookupFeedback}</div>
            ) : null}

            <label htmlFor="registerName">Nome</label>
            <div aria-label="Nome" className="login-locked-value" id="registerName">
              {registerLookup?.name ?? ''}
            </div>

            <label htmlFor="registerBirthDate">Data de nascimento</label>
            <div
              aria-label="Data de nascimento"
              className="login-locked-value"
              id="registerBirthDate"
            >
              {registerLookup?.birthDate ? formatDateInput(registerLookup.birthDate) : ''}
            </div>

            <div className="login-inline-fields">
              <div>
                <label htmlFor="registerDdd">DDD</label>
                <div aria-label="DDD" className="login-locked-value" id="registerDdd">
                  {registerLookup?.ddd ? String(registerLookup.ddd) : ''}
                </div>
              </div>
              <div>
                <label htmlFor="registerPhone">Telefone</label>
                <div aria-label="Telefone" className="login-locked-value" id="registerPhone">
                  {registerLookup?.phone ? String(registerLookup.phone) : ''}
                </div>
              </div>
            </div>

            <label htmlFor="registerEmail">Email</label>
            <div aria-label="Email" className="login-locked-value" id="registerEmail">
              {registerLookup?.email ?? ''}
            </div>

            <label htmlFor="registerPassword">Senha</label>
            <div className="password-field">
              <input
                id="registerPassword"
                name="password"
                autoComplete="new-password"
                maxLength={20}
                minLength={6}
                onChange={(event) => setRegisterPassword(event.target.value)}
                pattern="(?=.*\d)\S{6,20}"
                placeholder="6 a 20 caracteres, com número"
                required
                type={showRegisterPassword ? 'text' : 'password'}
                value={registerPassword}
              />
              <button
                aria-label={showRegisterPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showRegisterPassword}
                className="password-eye-button"
                onClick={() => setShowRegisterPassword((current) => !current)}
                type="button"
              >
                <span aria-hidden="true" />
              </button>
            </div>

            <div className="password-checklist" aria-label="Requisitos da senha">
              {passwordRequirements.map((requirement) => (
                <div
                  className={requirement.met ? 'met' : ''}
                  key={requirement.label}
                >
                  <span aria-hidden="true">{requirement.met ? '✓' : '•'}</span>
                  {requirement.label}
                </div>
              ))}
            </div>

            <button
              disabled={isSubmittingAuth || isLookingUpRegister || !registerLookup || registerLookup.hasUser}
              type="submit"
            >
              {isSubmittingAuth ? 'Criando...' : isLookingUpRegister ? 'Buscando...' : 'Criar cadastro'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
