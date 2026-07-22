'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { GRID_PAGE_SIZE, formatCep, onlyDigits, paginateItems } from '../../shared/registration/registrationHelpers';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import type { Company, Supplier } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useToast } from '../../shared/components/Toast';

export function SupplierRegistration() {
  const { showToast } = useToast();
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersPage, setSuppliersPage] = useState(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [dsFornecedor, setDsFornecedor] = useState('');
  const [caCNPJ, setCaCNPJ] = useState('');
  const [nrDDD, setNrDDD] = useState('');
  const [nrContato, setNrContato] = useState('');
  const [dsEmail, setDsEmail] = useState('');
  const [anCEP, setAnCEP] = useState('');
  const [anLogradouro, setAnLogradouro] = useState('');
  const [nrEndereco, setNrEndereco] = useState('');
  const [anBairro, setAnBairro] = useState('');
  const [anCidade, setAnCidade] = useState('');
  const [anUF, setAnUF] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isFormEnabled = selectedSupplierId !== null || isCreating;
  const filteredSuppliers = suppliers.filter((supplier) =>
    supplier.dsFornecedor.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const suppliersTotalPages = Math.max(1, Math.ceil(filteredSuppliers.length / GRID_PAGE_SIZE));
  const paginatedSuppliers = paginateItems(filteredSuppliers, suppliersPage);

  async function loadSuppliers() {
    try {
      const response = await fetch(`${apiUrl}/suppliers`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os fornecedores.');
      const data = (await response.json()) as Supplier[];
      setSuppliers(data);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar fornecedores.');
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
    void loadSuppliers();
    void loadCompanies();
  }, []);

  useEffect(() => {
    setSuppliersPage(1);
  }, [searchTerm, selectedSupplierId]);

  useEffect(() => {
    if (suppliersPage > suppliersTotalPages) {
      setSuppliersPage(suppliersTotalPages);
    }
  }, [suppliersPage, suppliersTotalPages]);

  function clearForm() {
    setSelectedSupplierId(null);
    setIsCreating(false);
    setSelectedCompanyId('');
    setDsFornecedor('');
    setCaCNPJ('');
    setNrDDD('');
    setNrContato('');
    setDsEmail('');
    setAnCEP('');
    setAnLogradouro('');
    setNrEndereco('');
    setAnBairro('');
    setAnCidade('');
    setAnUF('');
    setIsActive(false);
    setFeedback('');
  }

  function handleNew() {
    clearForm();
    setIsCreating(true);
    setIsActive(true);
    setIsDrawerOpen(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function handleEdit(supplier: Supplier) {
    setSelectedSupplierId(supplier.id);
    setIsCreating(false);
    setSelectedCompanyId(supplier.idEmpresa ? String(supplier.idEmpresa) : '');
    setDsFornecedor(supplier.dsFornecedor);
    setCaCNPJ(supplier.caCNPJ ?? '');
    setNrDDD(supplier.nrDDD != null ? String(supplier.nrDDD) : '');
    setNrContato(supplier.nrContato ?? '');
    setDsEmail(supplier.dsEmail ?? '');
    setAnCEP(supplier.anCEP ? formatCep(supplier.anCEP) : '');
    setAnLogradouro(supplier.anLogradouro ?? '');
    setNrEndereco(supplier.nrEndereco ?? '');
    setAnBairro(supplier.anBairro ?? '');
    setAnCidade(supplier.anCidade ?? '');
    setAnUF(supplier.anUF ?? '');
    setIsActive(supplier.boInativo === false);
    setFeedback('');
    setIsDrawerOpen(true);
  }

  async function handleToggleStatus() {
    const nextActive = !isActive;
    setIsActive(nextActive);
    if (!selectedSupplierId) return;

    try {
      const response = await fetch(`${apiUrl}/suppliers/${selectedSupplierId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: nextActive ? false : true }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível alterar o status.');
      const updated = (await response.json()) as Supplier;
      setSuppliers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setIsActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const payload = {
        idEmpresa: selectedCompanyId ? Number(selectedCompanyId) : null,
        dsFornecedor,
        caCNPJ: onlyDigits(caCNPJ),
        anCEP: onlyDigits(anCEP),
        anLogradouro,
        nrEndereco,
        anBairro,
        anCidade,
        anUF,
        nrDDD: nrDDD ? Number(onlyDigits(nrDDD)) : null,
        nrContato: onlyDigits(nrContato),
        dsEmail,
        boInativo: isActive ? false : true,
      };

      const response = await fetch(
        selectedSupplierId ? `${apiUrl}/suppliers/${selectedSupplierId}` : `${apiUrl}/suppliers`,
        {
          method: selectedSupplierId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar.');
      }

      const saved = (await response.json()) as Supplier;
      setSuppliers((current) => {
        if (selectedSupplierId) return current.map((item) => (item.id === saved.id ? saved : item));
        return [...current, saved].sort((a, b) => a.dsFornecedor.localeCompare(b.dsFornecedor));
      });
      setSelectedSupplierId(saved.id);
      setIsCreating(false);
      showToast('Fornecedor salvo com sucesso.');
      setIsDrawerOpen(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Estoque</p>
        <h2 className="module-page-title">CADASTRO DE FORNECEDORES</h2>
      </header>
      <div className="form-view">
        <section className="data-grid-section">
          <RegistrationGrid<Supplier>
            ariaLabel="Fornecedores cadastrados"
            label="Fornecedores"
            columns={[
              { label: 'Fornecedor', render: (s) => s.dsFornecedor, sortValue: (s) => s.dsFornecedor },
              { label: 'CNPJ', render: (s) => s.caCNPJ ?? '-' },
              { label: 'Contato', render: (s) => (s.nrContato ? `(${s.nrDDD ?? ''}) ${s.nrContato}` : '-') },
              {
                label: 'Status',
                render: (s) => <span className={`status-badge ${s.boInativo === false ? 'active' : 'inactive'}`}>{s.boInativo === false ? 'Ativo' : 'Inativo'}</span>,
                sortValue: (s) => (s.boInativo === false ? 0 : 1),
              },
            ]}
            records={paginatedSuppliers}
            selectedId={selectedSupplierId}
            onSelect={handleEdit}
            onEdit={handleEdit}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            searchPlaceholder="Buscar fornecedor"
            onNew={handleNew}
            page={suppliersPage}
            totalItems={filteredSuppliers.length}
            onPageChange={setSuppliersPage}
          />
        </section>

        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title={isCreating ? 'Novo Fornecedor' : 'Editar Fornecedor'}
          onClose={() => setIsDrawerOpen(false)}
        >
          <form className="drawer-fields" onSubmit={handleSave}>
            {feedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{feedback}</div> : null}
            <RegistrationField htmlFor="fornecedorEmpresa" label="Empresa" size="lg">
              <select disabled={!isFormEnabled} id="fornecedorEmpresa" onChange={(event) => setSelectedCompanyId(event.target.value)} value={selectedCompanyId}>
                <option value="">Sem empresa (compartilhado)</option>
                {companies.map((company) => (<option key={company.id} value={company.id}>{company.dsEmpresa}</option>))}
              </select>
            </RegistrationField>
            <RegistrationField htmlFor="fornecedorNome" label="Nome" size="full">
              <input disabled={!isFormEnabled} id="fornecedorNome" maxLength={255} onChange={(event) => setDsFornecedor(event.target.value)} placeholder="Ex.: Distribuidora Fit Ltda" ref={nameInputRef} required type="text" value={dsFornecedor} />
            </RegistrationField>
            <RegistrationField htmlFor="fornecedorCNPJ" label="CNPJ" size="md">
              <input disabled={!isFormEnabled} id="fornecedorCNPJ" maxLength={18} onChange={(event) => setCaCNPJ(event.target.value)} placeholder="00.000.000/0000-00" type="text" value={caCNPJ} />
            </RegistrationField>
            <RegistrationField htmlFor="fornecedorDDD" label="DDD" size="xs">
              <input disabled={!isFormEnabled} id="fornecedorDDD" maxLength={2} onChange={(event) => setNrDDD(event.target.value)} placeholder="11" type="text" value={nrDDD} />
            </RegistrationField>
            <RegistrationField htmlFor="fornecedorContato" label="Telefone" size="sm">
              <input disabled={!isFormEnabled} id="fornecedorContato" maxLength={11} onChange={(event) => setNrContato(event.target.value)} placeholder="999999999" type="text" value={nrContato} />
            </RegistrationField>
            <RegistrationField htmlFor="fornecedorEmail" label="E-mail" size="md">
              <input disabled={!isFormEnabled} id="fornecedorEmail" maxLength={255} onChange={(event) => setDsEmail(event.target.value)} placeholder="contato@fornecedor.com" type="email" value={dsEmail} />
            </RegistrationField>
            <RegistrationField htmlFor="fornecedorCEP" label="CEP" size="sm">
              <input disabled={!isFormEnabled} id="fornecedorCEP" maxLength={9} onChange={(event) => setAnCEP(formatCep(event.target.value))} placeholder="00000-000" type="text" value={anCEP} />
            </RegistrationField>
            <RegistrationField htmlFor="fornecedorLogradouro" label="Logradouro" size="lg">
              <input disabled={!isFormEnabled} id="fornecedorLogradouro" maxLength={150} onChange={(event) => setAnLogradouro(event.target.value)} type="text" value={anLogradouro} />
            </RegistrationField>
            <RegistrationField htmlFor="fornecedorNumero" label="Número" size="xs">
              <input disabled={!isFormEnabled} id="fornecedorNumero" maxLength={10} onChange={(event) => setNrEndereco(event.target.value)} type="text" value={nrEndereco} />
            </RegistrationField>
            <RegistrationField htmlFor="fornecedorBairro" label="Bairro" size="md">
              <input disabled={!isFormEnabled} id="fornecedorBairro" maxLength={100} onChange={(event) => setAnBairro(event.target.value)} type="text" value={anBairro} />
            </RegistrationField>
            <RegistrationField htmlFor="fornecedorCidade" label="Cidade" size="md">
              <input disabled={!isFormEnabled} id="fornecedorCidade" maxLength={100} onChange={(event) => setAnCidade(event.target.value)} type="text" value={anCidade} />
            </RegistrationField>
            <RegistrationField htmlFor="fornecedorUF" label="UF" size="xs">
              <input disabled={!isFormEnabled} id="fornecedorUF" maxLength={2} onChange={(event) => setAnUF(event.target.value.toUpperCase())} type="text" value={anUF} />
            </RegistrationField>
            <RegistrationField htmlFor="fornecedorStatus" label="Status" size="sm">
              <button aria-pressed={isActive} className={`status-toggle ${isActive ? 'active' : ''}`} disabled={!isFormEnabled} id="fornecedorStatus" onClick={handleToggleStatus} type="button">
                <span>{isActive ? 'Ativo' : 'Inativo'}</span>
              </button>
            </RegistrationField>
            <div className="form-actions" style={{ flex: '1 1 100%' }}>
              <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
              <button disabled={!isFormEnabled} type="submit"><Save size={16} />Salvar fornecedor</button>
            </div>
          </form>
        </RegistrationDrawer>
      </div>
    </>
  );
}
