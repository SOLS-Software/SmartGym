'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Pencil, Save } from 'lucide-react';
import { GRID_PAGE_SIZE, formatChildCell, formatChildSearchValue, getLookupLabel, isImageFile, paginateItems } from '../../shared/registration/registrationHelpers';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import type { Company, CompanyChildRecord, CompanyChildTable, LookupRecord, Product } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

const productRelatedTables: CompanyChildTable[] = [
  {
    key: 'files',
    endpoint: 'files',
    label: 'Arquivos',
    title: 'Arquivos do produto',
    columns: [
      { key: 'dsArquivo', label: 'Arquivo' },
      { key: 'idTiposArquivos', label: 'Tipo', lookupLabelKey: 'dsTipo' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idTiposArquivos', label: 'Tipo de arquivo', type: 'number', lookupEndpoint: 'file-types', lookupLabelKey: 'dsTipo' },
      { key: 'dsArquivo', label: 'Arquivo', type: 'text', required: true },
      { key: 'anCaminho', label: 'Caminho', type: 'text' },
      { key: 'cnChaveAcesso', label: 'Chave acesso', type: 'number' },
      { key: 'cnDistribuidor', label: 'Distribuidor', type: 'number' },
    ],
  },
];

function normalizeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function getProductFileTypeOptions(options: LookupRecord[]) {
  return options.filter((option) => normalizeText(option.dsTipo).includes('identificacao'));
}

export function ProductRegistration() {
  const productFileInputRef = useRef<HTMLInputElement>(null);
  const productNameInputRef = useRef<HTMLInputElement | null>(null);
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
  const selectedRelatedTable = 'files';
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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  type DrawerMode = 'product' | 'related';
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('product');
  const isFormEnabled = selectedProductId !== null || isCreating;
  const relatedConfig = productRelatedTables.find((table) => table.key === selectedRelatedTable) ?? null;
  const productFileTypeOptions = getProductFileTypeOptions(relatedLookups.idTiposArquivos ?? []);
  const filteredRelatedRecords = relatedRecords.filter((record) =>
    relatedConfig
      ? relatedConfig.columns.some((column) =>
        formatChildSearchValue(record, column, relatedLookups[column.key]).includes(relatedSearchTerm.toLowerCase()),
      )
      : false,
  );
  const filteredProducts = products.filter((product) =>
    product.dsProduto.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const productsTotalPages = Math.max(1, Math.ceil(filteredProducts.length / GRID_PAGE_SIZE));
  const paginatedProducts = paginateItems(filteredProducts, productsPage);

  async function loadProducts() {
    try {
      const response = await fetch(`${apiUrl}/products`);

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar os produtos.');
      }

      const data = (await response.json()) as Product[];
      setProducts(data);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar produtos.');
    }
  }

  async function loadCompanies() {
    try {
      const response = await fetch(`${apiUrl}/companies`);

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar as empresas.');
      }

      const data = (await response.json()) as Company[];
      setCompanies(data.filter((company) => company.boInativo === 0));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar empresas.');
    }
  }

  async function loadRelatedRecords(productId = selectedProductId, config = relatedConfig) {
    if (!config || !productId) {
      setRelatedRecords([]);
      setIsLoadingRelatedRecords(false);
      return;
    }

    try {
      setIsLoadingRelatedRecords(true);
      const response = await fetch(`${apiUrl}/products/${productId}/related/${config.endpoint}`);

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar os registros relacionados.');
      }

      const data = (await response.json()) as CompanyChildRecord[];
      setRelatedRecords(data);
      if (config.key === 'files') {
        const imageFiles = data.filter((file) => isImageFile(String(file.anCaminho ?? '')));
        const urlEntries = await Promise.all(
          imageFiles.map(async (file) => {
            try {
              const urlResponse = await fetch(`${apiUrl}/products/${productId}/related/files/${file.id}/url`);
              if (!urlResponse.ok) return null;
              const urlData = (await urlResponse.json()) as { url: string };
              return [file.id, urlData.url] as const;
            } catch {
              return null;
            }
          }),
        );
        setRelatedFilePreviewUrls(Object.fromEntries(urlEntries.filter((entry): entry is [number, string] => Boolean(entry))));
      } else {
        setRelatedFilePreviewUrls({});
      }
      setRelatedFeedback('');
    } catch (error) {
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao carregar registros relacionados.');
      setRelatedRecords([]);
      setRelatedFilePreviewUrls({});
    } finally {
      setIsLoadingRelatedRecords(false);
    }
  }

  useEffect(() => {
    void loadProducts();
    void loadCompanies();
  }, []);

  useEffect(() => {
    setProductsPage(1);
  }, [searchTerm, selectedProductId]);

  useEffect(() => {
    if (productsPage > productsTotalPages) {
      setProductsPage(productsTotalPages);
    }
  }, [productsPage, productsTotalPages]);

  useEffect(() => {
    setSelectedRelatedRecordId(null);
    setIsCreatingRelated(false);
    setRelatedFormValues({});
    setIsRelatedActive(true);
    setRelatedSearchTerm('');
    setRelatedFeedback('');
    void loadRelatedRecords();
  }, [selectedProductId, selectedRelatedTable]);

  useEffect(() => {
    async function loadRelatedLookups() {
      if (!relatedConfig) {
        return;
      }

      const lookupFields = relatedConfig.fields.filter((field) => field.lookupEndpoint);
      const nextLookups: Record<string, LookupRecord[]> = {};

      await Promise.all(
        lookupFields.map(async (field) => {
          if (!field.lookupEndpoint) {
            return;
          }

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

  useEffect(() => {
    if (relatedConfig?.key !== 'files' || relatedFormValues.idTiposArquivos || productFileTypeOptions.length !== 1) {
      return;
    }

    setRelatedFormValues((current) => ({
      ...current,
      idTiposArquivos: String(productFileTypeOptions[0]!.id),
    }));
  }, [productFileTypeOptions, relatedConfig, relatedFormValues.idTiposArquivos]);

  function clearForm() {
    setSelectedProductId(null);
    setIsCreating(false);
    setSelectedCompanyId('');
    setProductName('');
    setProductStock('');
    setIsProductActive(false);
    setFeedback('');
    setRelatedRecords([]);
    setSelectedRelatedRecordId(null);
    setIsCreatingRelated(false);
    setRelatedFormValues({});
  }

  function handleNewProduct() {
    clearForm();
    setIsCreating(true);
    setProductStock('0');
    setIsProductActive(true);
    setTimeout(() => productNameInputRef.current?.focus(), 0);
    setDrawerMode('product');
    setIsDrawerOpen(true);
  }

  function handleSelectProduct(product: Product) {
    if (product.id === selectedProductId) {
      clearForm();
      return;
    }

    setSelectedProductId(product.id);
    setIsCreating(false);
    setSelectedCompanyId(product.idEmpresa ? String(product.idEmpresa) : '');
    setProductName(product.dsProduto);
    setProductStock(String(product.qtEstoque));
    setIsProductActive(product.boInativo === 0);
    setFeedback('');
    setRelatedFeedback('');
  }

  function handleEditProduct(product: Product) {
    if (product.id !== selectedProductId) handleSelectProduct(product);
    setDrawerMode('product');
    setIsDrawerOpen(true);
  }

  function clearRelatedForm() {
    setSelectedRelatedRecordId(null);
    setIsCreatingRelated(false);
    setRelatedFormValues({});
    setIsRelatedActive(true);
    setRelatedFeedback('');
  }

  function handleNewRelated() {
    setSelectedRelatedRecordId(null);
    setIsCreatingRelated(true);
    setRelatedFormValues({});
    setIsRelatedActive(true);
    setRelatedFeedback('');
    setDrawerMode('related');
    setIsDrawerOpen(true);
  }

  function handleSelectRelatedRecord(record: CompanyChildRecord) {
    if (!relatedConfig) {
      return;
    }

    const values = relatedConfig.fields.reduce<Record<string, string>>((current, field) => {
      current[field.key] = String(record[field.key] ?? '');
      return current;
    }, {});

    setSelectedRelatedRecordId(record.id);
    setIsCreatingRelated(false);
    setRelatedFormValues(values);
    setIsRelatedActive(Number(record.boInativo ?? 0) === 0);
    setRelatedFeedback('');
  }

  function handleEditRelated(record: CompanyChildRecord) {
    if (record.id !== selectedRelatedRecordId) handleSelectRelatedRecord(record);
    setDrawerMode('related');
    setIsDrawerOpen(true);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: nextActive ? 0 : 1 }),
      });

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel alterar o status.');
      }

      const updatedProduct = (await response.json()) as Product;
      setProducts((current) =>
        current.map((product) => (product.id === updatedProduct.id ? updatedProduct : product)),
      );
    } catch (error) {
      setIsProductActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
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
        selectedProductId ? `${apiUrl}/products/${selectedProductId}` : `${apiUrl}/products`,
        {
          method: selectedProductId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
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
          return current.map((product) => (product.id === savedProduct.id ? savedProduct : product));
        }

        return [...current, savedProduct].sort((a, b) => a.dsProduto.localeCompare(b.dsProduto));
      });
      setSelectedProductId(savedProduct.id);
      setIsCreating(false);
      setFeedback('Produto salvo com sucesso.');
      setIsDrawerOpen(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  async function handleToggleRelatedStatus() {
    if (!relatedConfig) {
      return;
    }

    const nextActive = !isRelatedActive;
    setIsRelatedActive(nextActive);

    if (!selectedProductId || !selectedRelatedRecordId) {
      return;
    }

    try {
      const response = await fetch(
        `${apiUrl}/products/${selectedProductId}/related/${relatedConfig.endpoint}/${selectedRelatedRecordId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boInativo: nextActive ? 0 : 1 }),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel alterar o status.');
      }

      const updated = (await response.json()) as CompanyChildRecord;
      setRelatedRecords((current) => current.map((record) => (record.id === updated.id ? updated : record)));
    } catch (error) {
      setIsRelatedActive(!nextActive);
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveRelated(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!relatedConfig) {
      setRelatedFeedback('Selecione uma tabela relacionada antes de salvar.');
      return;
    }

    if (!selectedProductId) {
      setRelatedFeedback('Selecione um produto antes de salvar.');
      return;
    }

    const missingRequiredField = relatedConfig.fields.find((field) => field.required && !relatedFormValues[field.key]);

    if (missingRequiredField) {
      setRelatedFeedback(`Informe ${missingRequiredField.label}.`);
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
          ? `${apiUrl}/products/${selectedProductId}/related/${relatedConfig.endpoint}/${selectedRelatedRecordId}`
          : `${apiUrl}/products/${selectedProductId}/related/${relatedConfig.endpoint}`,
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
      await loadRelatedRecords(selectedProductId, relatedConfig);
      setSelectedRelatedRecordId(saved.id);
      setIsCreatingRelated(false);
      setRelatedFeedback(`${relatedConfig.label} salvo com sucesso.`);
      setIsDrawerOpen(false);
    } catch (error) {
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao salvar registro relacionado.');
    }
  }

  async function handleUploadRelatedFile(file: File | null) {
    if (!file || !selectedProductId || !relatedConfig) {
      return;
    }

    try {
      setIsUploadingRelatedFile(true);
      setRelatedFeedback('');
      const formData = new FormData();
      formData.append('idTiposArquivos', relatedFormValues.idTiposArquivos ?? '');
      formData.append('file', file);
      const isReplacingFile = selectedRelatedRecordId !== null && !isCreatingRelated;
      const response = await fetch(
        isReplacingFile
          ? `${apiUrl}/products/${selectedProductId}/related/files/${selectedRelatedRecordId}`
          : `${apiUrl}/products/${selectedProductId}/related/files`,
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
      await loadRelatedRecords(selectedProductId, relatedConfig);
      setSelectedRelatedRecordId(saved.id);
      setIsCreatingRelated(false);
      setRelatedFormValues({
        idTiposArquivos: saved.idTiposArquivos ? String(saved.idTiposArquivos) : '',
      });
      setRelatedFeedback(isReplacingFile ? 'Arquivo alterado com sucesso.' : 'Arquivo enviado com sucesso.');
      setIsDrawerOpen(false);
    } catch (error) {
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao enviar arquivo.');
    } finally {
      setIsUploadingRelatedFile(false);
      if (productFileInputRef.current) {
        productFileInputRef.current.value = '';
      }
    }
  }

  async function handleOpenRelatedFile(fileId: number) {
    if (!selectedProductId) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/products/${selectedProductId}/related/files/${fileId}/url`);
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
    if (!selectedProductId || !relatedConfig) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/products/${selectedProductId}/related/files/${fileId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel remover o arquivo.');
      }
      await loadRelatedRecords(selectedProductId, relatedConfig);
      setSelectedRelatedRecordId(null);
      setRelatedFeedback('Arquivo removido com sucesso.');
    } catch (error) {
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao remover arquivo.');
    }
  }

  return (
    <div className="form-view company-view">
      <div className="form-heading">
        <p className="section-label">Estoque</p>
      </div>

      <div className={`training-page-layout${selectedProductId !== null ? ' has-exercises' : ''}`}>
        <section className="data-grid-section company-grid-section">
          <RegistrationGrid<Product>
            ariaLabel="Produtos cadastrados"
            label="Produtos"
            columns={[
              { label: 'Produto', render: (p) => p.dsProduto },
              { label: 'Estoque', render: (p) => p.qtEstoque },
              { label: 'Status', render: (p) => <span className={`status-badge ${p.boInativo === 0 ? 'active' : 'inactive'}`}>{p.boInativo === 0 ? 'Ativo' : 'Inativo'}</span> },
            ]}
            records={paginatedProducts}
            selectedId={selectedProductId}
            onSelect={handleSelectProduct}
            onEdit={handleEditProduct}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            searchPlaceholder="Buscar produto"
            onNew={handleNewProduct}
            page={productsPage}
            totalItems={filteredProducts.length}
            onPageChange={setProductsPage}
          />
        </section>

        {selectedProductId !== null ? (
          <section className="data-grid-section">
            <RegistrationGrid<CompanyChildRecord>
              ariaLabel={relatedConfig?.title ?? 'Arquivos do produto'}
              label={relatedConfig?.label ?? 'Arquivos'}
              columns={(relatedConfig?.columns ?? []).map((column) => ({
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
              newDisabled={!selectedProductId}
              variant="child"
            />
          </section>
        ) : null}

        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title={drawerMode === 'product' ? (isCreating ? 'Novo Produto' : 'Editar Produto') : 'Arquivo do Produto'}
          onClose={() => { setIsDrawerOpen(false); }}
        >
          {drawerMode === 'product' ? (
            <form className="drawer-fields" onSubmit={handleSaveProduct}>
              {feedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{feedback}</div> : null}
              <RegistrationField htmlFor="idEmpresa" label="Empresa" size="lg">
                <select disabled={!isFormEnabled} id="idEmpresa" onChange={(event) => setSelectedCompanyId(event.target.value)} value={selectedCompanyId}>
                  <option value="">Sem empresa</option>
                  {companies.map((company) => (<option key={company.id} value={company.id}>{company.dsEmpresa}</option>))}
                </select>
              </RegistrationField>
              <RegistrationField htmlFor="dsProduto" label="Produto" size="full">
                <input disabled={!isFormEnabled} id="dsProduto" maxLength={255} onChange={(event) => setProductName(event.target.value)} placeholder="Ex.: Whey Protein 900g" ref={productNameInputRef} type="text" value={productName} />
              </RegistrationField>
              <RegistrationField htmlFor="qtEstoque" label="Estoque" size="sm">
                <input disabled={!isFormEnabled} id="qtEstoque" min="0" onChange={(event) => setProductStock(event.target.value)} placeholder="0" type="number" value={productStock} />
              </RegistrationField>
              <RegistrationField htmlFor="boInativo" label="Status" size="sm">
                <button aria-pressed={isProductActive} className={`status-toggle ${isProductActive ? 'active' : ''}`} disabled={!isFormEnabled} onClick={handleToggleStatus} type="button">
                  <span>{isProductActive ? 'Ativo' : 'Inativo'}</span>
                </button>
              </RegistrationField>
              <div className="form-actions" style={{ flex: '1 1 100%' }}>
                <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
                <button disabled={!isFormEnabled} type="submit"><Save size={16} />Salvar produto</button>
              </div>
            </form>
          ) : (
            <form className="drawer-fields" onSubmit={handleSaveRelated}>
              {relatedFeedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{relatedFeedback}</div> : null}
              <RegistrationField htmlFor="productFileType" label="Tipo de arquivo" size="md">
                <select disabled={!selectedProductId || isUploadingRelatedFile} id="productFileType" onChange={(event) => setRelatedFormValues((current) => ({ ...current, idTiposArquivos: event.target.value }))} value={relatedFormValues.idTiposArquivos ?? ''}>
                  <option value="">Selecione</option>
                  {productFileTypeOptions.map((option) => (<option key={option.id} value={option.id}>{getLookupLabel(option, relatedConfig?.fields.find((field) => field.key === 'idTiposArquivos') ?? relatedConfig?.fields[0]!)}</option>))}
                </select>
              </RegistrationField>
              <RegistrationField htmlFor="productFileName" label="Arquivo selecionado" size="full">
                <input disabled id="productFileName" type="text" value={selectedRelatedRecordId ? String(relatedRecords.find((record) => record.id === selectedRelatedRecordId)?.dsArquivo ?? `Arquivo ${selectedRelatedRecordId}`) : 'Clique em Novo ou selecione no grid'} />
              </RegistrationField>
              <RegistrationField htmlFor="productFile" label={selectedRelatedRecordId && !isCreatingRelated ? 'Alterar arquivo' : 'Arquivo'} size="full">
                <input disabled={!selectedProductId || isUploadingRelatedFile} id="productFile" onChange={(event) => void handleUploadRelatedFile(event.target.files?.[0] ?? null)} ref={productFileInputRef} type="file" />
              </RegistrationField>
              {selectedRelatedRecordId ? (
                <div className="student-files-list" style={{ flex: '1 1 100%' }}>
                  <div className="student-file-row">
                    {relatedFilePreviewUrls[selectedRelatedRecordId] ? (
                      <button className="file-preview-button" onClick={() => void handleOpenRelatedFile(selectedRelatedRecordId)} type="button">
                        <img alt={String(relatedRecords.find((record) => record.id === selectedRelatedRecordId)?.dsArquivo ?? `Arquivo ${selectedRelatedRecordId}`)} className="student-file-preview" src={relatedFilePreviewUrls[selectedRelatedRecordId]} />
                      </button>
                    ) : null}
                    <div className="student-file-row-info">
                      <strong>{String(relatedRecords.find((record) => record.id === selectedRelatedRecordId)?.dsArquivo ?? `Arquivo ${selectedRelatedRecordId}`)}</strong>
                    </div>
                    <div className="student-file-actions">
                      <button className="secondary-button" onClick={() => void handleOpenRelatedFile(selectedRelatedRecordId)} type="button">Visualizar</button>
                      <button className="secondary-button" onClick={() => productFileInputRef.current?.click()} type="button">Alterar</button>
                      <button className="danger" onClick={() => void handleRemoveRelatedFile(selectedRelatedRecordId)} type="button">Remover</button>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="form-actions" style={{ flex: '1 1 100%' }}>
                <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
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
  );
}
