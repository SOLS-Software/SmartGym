'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import type { Company } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useToast } from '../../shared/components/Toast';

type ProductOption = {
  id: number;
  dsProduto: string;
  qtEstoque: number;
  boInativo: boolean;
};

type SupplierOption = {
  id: number;
  dsFornecedor: string;
  boInativo: boolean;
};

type Purchase = {
  id: number;
  idEmpresa: number;
  idProduto: number;
  idFornecedor: number;
  qtMovimentada: number;
  vlUnitario: number;
  qtDisponivel: number;
  boInativo: boolean;
  produto?: ProductOption;
  fornecedor?: SupplierOption;
};

export function PurchaseRegistration() {
  const { showToast } = useToast();
  const qtyInputRef = useRef<HTMLInputElement | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [idFornecedor, setIdFornecedor] = useState('');
  const [idProduto, setIdProduto] = useState('');
  const [qtMovimentada, setQtMovimentada] = useState('');
  const [vlUnitario, setVlUnitario] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isFormEnabled = selectedPurchaseId !== null || isCreating;
  const selectedProduct = products.find((product) => String(product.id) === idProduto) ?? null;
  const filteredPurchases = purchases.filter((purchase) => {
    const term = searchTerm.toLowerCase();
    return (
      (purchase.produto?.dsProduto ?? '').toLowerCase().includes(term) ||
      (purchase.fornecedor?.dsFornecedor ?? '').toLowerCase().includes(term)
    );
  });

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

  async function loadProducts() {
    try {
      const response = await fetch(`${apiUrl}/products`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os produtos.');
      const data = (await response.json()) as ProductOption[];
      setProducts(data);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar produtos.');
    }
  }

  async function loadSuppliers() {
    try {
      const response = await fetch(`${apiUrl}/suppliers`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os fornecedores.');
      const data = (await response.json()) as SupplierOption[];
      setSuppliers(data.filter((supplier) => supplier.boInativo === false));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar fornecedores.');
    }
  }

  async function loadPurchases(companyId = selectedCompanyId) {
    if (!companyId) {
      setPurchases([]);
      return;
    }

    try {
      setIsLoadingPurchases(true);
      const response = await fetch(`${apiUrl}/companies/${companyId}/children/purchases`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as compras.');
      setPurchases((await response.json()) as Purchase[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar compras.');
    } finally {
      setIsLoadingPurchases(false);
    }
  }

  useEffect(() => {
    void loadCompanies();
    void loadProducts();
    void loadSuppliers();
  }, []);

  useEffect(() => {
    setSelectedPurchaseId(null);
    setIsCreating(false);
    void loadPurchases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  function handleNew() {
    if (!selectedCompanyId) {
      setFeedback('Selecione uma empresa antes de cadastrar.');
      return;
    }
    setSelectedPurchaseId(null);
    setIsCreating(true);
    setIdFornecedor('');
    setIdProduto('');
    setQtMovimentada('');
    setVlUnitario('');
    setIsActive(true);
    setFeedback('');
    setIsDrawerOpen(true);
    setTimeout(() => qtyInputRef.current?.focus(), 0);
  }

  function handleEdit(purchase: Purchase) {
    setSelectedPurchaseId(purchase.id);
    setIsCreating(false);
    setIdFornecedor(String(purchase.idFornecedor));
    setIdProduto(String(purchase.idProduto));
    setQtMovimentada(String(purchase.qtMovimentada ?? 0));
    setVlUnitario(String(purchase.vlUnitario ?? 0));
    setIsActive(purchase.boInativo === false);
    setFeedback('');
    setIsDrawerOpen(true);
  }

  async function handleToggleStatus() {
    const nextActive = !isActive;
    setIsActive(nextActive);
    if (!selectedCompanyId || !selectedPurchaseId) return;

    try {
      const response = await fetch(
        `${apiUrl}/companies/${selectedCompanyId}/children/purchases/${selectedPurchaseId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boInativo: nextActive ? false : true }),
        },
      );
      if (!response.ok) await getApiError(response, 'Não foi possível alterar o status.');
      const updated = (await response.json()) as Purchase;
      setPurchases((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      await loadProducts();
    } catch (error) {
      setIsActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompanyId) {
      setFeedback('Selecione uma empresa antes de salvar.');
      return;
    }
    if (!idFornecedor) {
      setFeedback('Selecione o fornecedor.');
      return;
    }
    if (!idProduto) {
      setFeedback('Selecione o produto.');
      return;
    }

    try {
      const payload = {
        idFornecedor: Number(idFornecedor),
        idProduto: Number(idProduto),
        qtMovimentada: qtMovimentada ? Number(qtMovimentada) : 0,
        vlUnitario: vlUnitario ? Number(vlUnitario) : 0,
        boInativo: isActive ? false : true,
      };

      const response = await fetch(
        selectedPurchaseId
          ? `${apiUrl}/companies/${selectedCompanyId}/children/purchases/${selectedPurchaseId}`
          : `${apiUrl}/companies/${selectedCompanyId}/children/purchases`,
        {
          method: selectedPurchaseId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar.');
      }

      const saved = (await response.json()) as Purchase;
      setPurchases((current) => {
        if (selectedPurchaseId) return current.map((item) => (item.id === saved.id ? saved : item));
        return [saved, ...current];
      });
      setSelectedPurchaseId(saved.id);
      setIsCreating(false);
      showToast('Compra registrada com sucesso.');
      setIsDrawerOpen(false);
      await loadProducts();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Estoque</p>
        <h2 className="module-page-title">COMPRAS</h2>
      </header>
      <div className="form-view">
        <section className="data-grid-section">
          <div className="grid-toolbar">
            <div className="child-grid-toolbar-label">
              <p className="section-label">Empresa</p>
            </div>
            <div className="child-grid-toolbar-actions">
              <label className="search-field">
                <span>Empresa</span>
                <select
                  onChange={(event) =>
                    setSelectedCompanyId(event.target.value ? Number(event.target.value) : null)
                  }
                  value={selectedCompanyId ?? ''}
                >
                  <option value="">Selecione a empresa</option>
                  {companies.map((company) => (
                    <option key={company.id} value={String(company.id)}>
                      {company.dsEmpresa}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {feedback ? <div className="form-feedback">{feedback}</div> : null}

          <RegistrationGrid<Purchase>
            ariaLabel="Compras registradas"
            label="Compras"
            columns={[
              { label: 'Fornecedor', render: (r) => r.fornecedor?.dsFornecedor ?? '-', sortValue: (r) => r.fornecedor?.dsFornecedor ?? '' },
              { label: 'Produto', render: (r) => r.produto?.dsProduto ?? '-', sortValue: (r) => r.produto?.dsProduto ?? '' },
              { label: 'Quantidade', render: (r) => String(r.qtMovimentada ?? 0) },
              { label: 'Valor unitário', render: (r) => Number(r.vlUnitario ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
              {
                label: 'Status',
                render: (r) => (
                  <span className={`status-badge ${r.boInativo === false ? 'active' : 'inactive'}`}>
                    {r.boInativo === false ? 'Ativo' : 'Inativo'}
                  </span>
                ),
                sortValue: (r) => (r.boInativo === false ? 0 : 1),
              },
            ]}
            records={filteredPurchases}
            isLoading={isLoadingPurchases}
            selectedId={selectedPurchaseId}
            onSelect={handleEdit}
            onEdit={handleEdit}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            searchPlaceholder="Buscar por produto ou fornecedor"
            onNew={handleNew}
            newDisabled={!selectedCompanyId}
            emptyMessage={
              selectedCompanyId
                ? 'Nenhuma compra registrada para esta empresa.'
                : 'Selecione uma empresa para ver as compras.'
            }
          />
        </section>

        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title={isCreating ? 'Nova Compra' : 'Editar Compra'}
          onClose={() => setIsDrawerOpen(false)}
        >
          <form className="drawer-fields" onSubmit={handleSave}>
            {feedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{feedback}</div> : null}
            <RegistrationField htmlFor="compraFornecedor" label="Fornecedor" size="md">
              <select
                disabled={!isFormEnabled}
                id="compraFornecedor"
                onChange={(event) => setIdFornecedor(event.target.value)}
                required
                value={idFornecedor}
              >
                <option value="">Selecione</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={String(supplier.id)}>
                    {supplier.dsFornecedor}
                  </option>
                ))}
              </select>
            </RegistrationField>
            <RegistrationField htmlFor="compraProduto" label="Produto" size="md">
              <select
                disabled={!isFormEnabled}
                id="compraProduto"
                onChange={(event) => setIdProduto(event.target.value)}
                required
                value={idProduto}
              >
                <option value="">Selecione</option>
                {products.map((product) => (
                  <option key={product.id} value={String(product.id)}>
                    {product.dsProduto}
                  </option>
                ))}
              </select>
            </RegistrationField>
            {selectedProduct ? (
              <RegistrationField htmlFor="compraEstoqueAtual" label="Estoque atual" size="sm">
                <input disabled id="compraEstoqueAtual" type="text" value={String(selectedProduct.qtEstoque)} />
              </RegistrationField>
            ) : null}
            <RegistrationField htmlFor="compraQuantidade" label="Quantidade" size="sm">
              <input
                disabled={!isFormEnabled}
                id="compraQuantidade"
                inputMode="numeric"
                min="1"
                onChange={(event) => setQtMovimentada(event.target.value)}
                placeholder="0"
                ref={qtyInputRef}
                required
                type="number"
                value={qtMovimentada}
              />
            </RegistrationField>
            <RegistrationField htmlFor="compraValorUnitario" label="Valor unitário" size="sm">
              <input
                disabled={!isFormEnabled}
                id="compraValorUnitario"
                inputMode="decimal"
                min="0"
                onChange={(event) => setVlUnitario(event.target.value)}
                placeholder="0,00"
                step="0.01"
                type="number"
                value={vlUnitario}
              />
            </RegistrationField>
            <RegistrationField htmlFor="compraStatus" label="Status" size="sm">
              <button
                aria-pressed={isActive}
                className={`status-toggle ${isActive ? 'active' : ''}`}
                disabled={!isFormEnabled}
                id="compraStatus"
                onClick={handleToggleStatus}
                type="button"
              >
                <span>{isActive ? 'Ativo' : 'Inativo'}</span>
              </button>
            </RegistrationField>
            <div className="form-actions" style={{ flex: '1 1 100%' }}>
              <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
              <button disabled={!isFormEnabled} type="submit"><Save size={16} />Salvar compra</button>
            </div>
          </form>
        </RegistrationDrawer>
      </div>
    </>
  );
}
