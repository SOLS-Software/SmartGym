'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';
const GRID_PAGE_SIZE = 20;

const menuGroups = [
  {
    title: 'EMPRESA',
    items: ['Empresas Cadastro'],
  },
  {
    title: 'TREINO',
    items: ['Exercicios Cadastro', 'Treino Cadastro', 'Meu Treino'],
  },
  {
    title: 'ESTOQUE',
    items: ['Produtos Cadastro', 'Compras Movimentacao'],
  },
  {
    title: 'ALUNOS',
    items: ['Matriculas'],
  },
  {
    title: 'RH',
    items: ['Profissionais'],
  },
  {
    title: 'DOMINIOS',
    items: ['Dominios'],
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
  cnTemaTP: number;
  boInativo: number;
};

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
  Frequencia: { endpoint: 'frequencies', field: 'dsFrequencia', label: 'Frequencia', saveLabel: 'Salvar frequencia' },
  Nivel: { endpoint: 'levels', field: 'dsNivel', label: 'Nivel', saveLabel: 'Salvar nivel' },
  UnidadeTempo: { endpoint: 'time-units', field: 'dsUnidadeTempo', label: 'Unidade de tempo', saveLabel: 'Salvar unidade' },
  StatusPagamento: { endpoint: 'payment-statuses', field: 'dsStatusPagamento', label: 'Status de pagamento', saveLabel: 'Salvar status' },
  FormaPagamento: { endpoint: 'payment-methods', field: 'dsFormaPagamento', label: 'Forma de pagamento', saveLabel: 'Salvar forma' },
  MetodoTreino: {
    endpoint: 'training-methods',
    field: 'nmMetodoTreino',
    label: 'Metodo de treino',
    saveLabel: 'Salvar metodo',
    secondField: 'dsMetodoTreino',
    secondFieldLabel: 'Descricao',
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
    <div className="grid-pagination" aria-label="Paginacao da tabela">
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
          Pagina {page} de {totalPages}
        </span>
        <button
          className="secondary-button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          type="button"
        >
          Proxima
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
    <div className="form-view">
      <div className="form-heading">
        <p className="section-label">Dominios</p>
        <h2>Cadastro de Dominios</h2>
        <p>Tabelas de apoio para tipos e configuracoes gerais do sistema.</p>
      </div>

      {config ? (
        <section className="domain-workspace">
          <div className="domain-panel">
            <section className="data-grid-section">
              <div className="grid-toolbar">
                <div>
                  <p className="section-label">Dominios</p>
                  <h3>Selecione um dominio</h3>
                </div>
              </div>

              <div className="domain-select-table" role="table" aria-label="Dominios">
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
            Dominio selecionado: <strong>{selectedDomain}</strong>
          </div>
        </section>
      )}
    </div>
  );
}

function CompanyRegistration() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesPage, setCompaniesPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyCnpj, setCompanyCnpj] = useState('');
  const [companyTheme, setCompanyTheme] = useState('0');
  const [isCompanyActive, setIsCompanyActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const isFormEnabled = selectedCompanyId !== null || isCreating;
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

  function clearForm() {
    setSelectedCompanyId(null);
    setIsCreating(false);
    setCompanyName('');
    setCompanyCnpj('');
    setCompanyTheme('0');
    setIsCompanyActive(false);
  }

  function handleNewCompany() {
    setSelectedCompanyId(null);
    setIsCreating(true);
    setCompanyName('');
    setCompanyCnpj('');
    setCompanyTheme('0');
    setIsCompanyActive(true);
    setFeedback('');
  }

  function handleSelectCompany(company: Company) {
    setSelectedCompanyId(company.id);
    setIsCreating(false);
    setCompanyName(company.dsEmpresa);
    setCompanyCnpj(company.caCNPJ);
    setCompanyTheme(String(company.cnTemaTP));
    setIsCompanyActive(company.boInativo === 0);
    setFeedback('');
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

  async function handleSaveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const payload = {
        dsEmpresa: companyName,
        caCNPJ: companyCnpj,
        cnTemaTP: Number(companyTheme || 0),
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
        <p className="section-label">Empresa</p>
        <h2>Cadastro de Empresa</h2>
        <p>Cadastre e gerencie as empresas que usam a plataforma SmartGym.</p>
      </div>

      <div className="registration-split-layout">
      <section className="data-grid-section">
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
            <span role="columnheader">Tema</span>
            <span role="columnheader">Status</span>
          </div>

          {paginatedCompanies.map((company) => (
            <button
              className={`product-row company-grid selectable ${company.id === selectedCompanyId ? 'selected' : ''
                }`}
              key={company.id}
              onClick={() => handleSelectCompany(company)}
              role="row"
              type="button"
            >
              <span role="cell">{company.dsEmpresa}</span>
              <span role="cell">{company.caCNPJ}</span>
              <span role="cell">{company.cnTemaTP}</span>
              <span role="cell">
                <span
                  className={`status-badge ${company.boInativo === 0 ? 'active' : 'inactive'
                    }`}
                >
                  {company.boInativo === 0 ? 'Ativo' : 'Inativo'}
                </span>
              </span>
            </button>
          ))}

          {filteredCompanies.length === 0 ? (
            <div className="empty-row">Nenhuma empresa encontrada.</div>
          ) : null}
        </div>
        <GridPagination
          onChange={setCompaniesPage}
          page={companiesPage}
          totalItems={filteredCompanies.length}
        />
      </section>

      <form className="registration-form split-form-panel" onSubmit={handleSaveCompany}>
        {!isFormEnabled ? (
          <div className="form-hint">
            Selecione uma empresa acima para editar ou clique em Nova empresa.
          </div>
        ) : null}

        {feedback ? <div className="form-feedback">{feedback}</div> : null}

        <div className="field">
          <label htmlFor="dsEmpresa">Empresa</label>
          <input
            disabled={!isFormEnabled}
            id="dsEmpresa"
            maxLength={255}
            name="dsEmpresa"
            onChange={(event) => setCompanyName(event.target.value)}
            placeholder="Ex.: Academia Cliente"
            type="text"
            value={companyName}
          />
        </div>

        <div className="field two-columns">
          <div>
            <label htmlFor="caCNPJ">CNPJ</label>
            <input
              disabled={!isFormEnabled}
              id="caCNPJ"
              maxLength={14}
              name="caCNPJ"
              onChange={(event) => setCompanyCnpj(event.target.value)}
              placeholder="Somente numeros"
              type="text"
              value={companyCnpj}
            />
          </div>

          <div>
            <label htmlFor="cnTemaTP">Tema</label>
            <input
              disabled={!isFormEnabled}
              id="cnTemaTP"
              min="0"
              name="cnTemaTP"
              onChange={(event) => setCompanyTheme(event.target.value)}
              placeholder="0"
              type="number"
              value={companyTheme}
            />
          </div>
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
      </form>
      </div>
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
      if (!response.ok) throw new Error('Nao foi possivel carregar os exercicios.');
      const data = (await response.json()) as Exercise[];
      setExercises(data);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar exercicios.');
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
      if (!response.ok) throw new Error('Nao foi possivel carregar os arquivos do exercicio.');
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
      setFileFeedback('Salve o exercicio antes de anexar arquivos.');
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
        <h2>Cadastro de Exercicio</h2>
        <p>Cadastre os exercicios e anexe arquivos de apoio como imagens e videos.</p>
      </div>

      <div className="registration-split-layout">
        <section className="data-grid-section">
          <div className="grid-toolbar">
            <div>
              <p className="section-label">Exercicios</p>
              <h3>Exercicios cadastrados</h3>
            </div>
            <label className="search-field">
              <span>Pesquisar</span>
              <input
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar exercicio"
                type="search"
                value={searchTerm}
              />
            </label>
            <button className="new-button" onClick={handleNewExercise} type="button">
              Novo exercicio
            </button>
          </div>

          <div className="product-table" role="table" aria-label="Exercicios cadastrados">
            <div className="product-row header" role="row">
              <span role="columnheader">Exercicio</span>
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
        {!isFormEnabled ? <div className="form-hint">Selecione um exercicio acima ou clique em Novo.</div> : null}
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
          <label htmlFor="exerciseName">Nome do exercicio</label>
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
            Salvar exercicio
          </button>
        </div>

        <section className="student-files-section" aria-label="Arquivos do exercicio">
          <div className="student-files-header">
            <h3>Arquivos do exercicio</h3>
          </div>
          {!selectedExerciseId ? (
            <div className="form-hint">Salve ou selecione um exercicio para anexar arquivos.</div>
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
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [cameraFeedback, setCameraFeedback] = useState('');
  const [studentErrors, setStudentErrors] = useState<StudentValidationErrors>({});
  const [touchedStudentFields, setTouchedStudentFields] = useState<
    Partial<Record<StudentValidationField, boolean>>
  >({});
  const isFormEnabled = selectedStudentId !== null || isCreating;
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
        <p className="section-label">Alunos</p>
        <h2>Cadastro de Aluno</h2>
        <p>Cadastre os alunos para matriculas, acesso e acompanhamento.</p>
      </div>

      <div className="registration-split-layout">
      <section className="data-grid-section">
        <div className="grid-toolbar">
          <div>
            <p className="section-label">Alunos</p>
            <h3>Alunos cadastrados</h3>
          </div>
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
      </section>

      <div className="split-form-stack">
      <form className="registration-form split-form-panel" onSubmit={handleSaveStudent}>
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
            <label htmlFor="nrEndereco">Numero</label>
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
      </form>

      <section className="registration-form student-files-section">
        <div className="student-files-header">
          <div>
            <p className="section-label">Arquivos</p>
            <h3>Arquivos do aluno</h3>
          </div>
        </div>

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
      </section>
      </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeItem, setActiveItem] = useState('Meu Treino');
  const [isMenuOpen, setIsMenuOpen] = useState(true);

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
              JS
            </div>
            <div>
              <strong>Joao Silva</strong>
              <span>Administrador</span>
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
          {activeItem === 'Empresas Cadastro' ? (
            <CompanyRegistration />
          ) : activeItem === 'Exercicios Cadastro' ? (
            <ExerciseRegistration />
          ) : activeItem === 'Produtos Cadastro' ? (
            <ProductRegistration />
          ) : activeItem === 'Matriculas' ? (
            <StudentRegistration />
          ) : activeItem === 'Dominios' ? (
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
            <h1 id="login-title">Entrar na sua conta</h1>
          </div>
        </div>

        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            setIsLoggedIn(true);
          }}
        >
          <label htmlFor="user">Usuario</label>
          <input
            id="user"
            name="user"
            type="text"
            autoComplete="username"
            placeholder="seu@email.com"
          />

          <label htmlFor="password">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Digite sua senha"
          />

          <a className="forgot-link" href="/esqueci-senha">
            Esqueci minha senha
          </a>

          <button type="submit">Entrar</button>
        </form>
      </section>
    </main>
  );
}
