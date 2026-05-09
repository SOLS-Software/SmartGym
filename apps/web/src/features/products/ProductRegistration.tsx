'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { GRID_PAGE_SIZE, GridPagination, paginateItems } from '../../shared/registration/registrationHelpers';
import type { Company, Product } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

export function ProductRegistration() {
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
        await getApiError(response, 'Não foi possível carregar os produtos.');
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
        await getApiError(response, 'Não foi possível carregar as empresas.');
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
        await getApiError(response, 'Não foi possível alterar o status.');
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
        throw new Error(errorBody.message ?? 'Não foi possível salvar.');
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
          movimentações.
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

          <div className="product-table" key={`products-${searchTerm}-${productsPage}`} role="table" aria-label="Produtos cadastrados">
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

