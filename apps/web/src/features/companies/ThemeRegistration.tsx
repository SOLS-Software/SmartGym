'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Plus, Save, Trash2, Upload } from 'lucide-react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { GridPagination, isImageFile, paginateItems } from '../../shared/registration/registrationHelpers';

type CompanyFile = { id: number; dsArquivo: string; anCaminho: string };

type CustomTheme = {
  id?: number;
  corPrimaria: string;
  corSecundaria: string;
  corAcentuacao: string;
  corTexto: string;
  corFundo: string;
  fontePrincipal: string;
  fonteSecundaria: string;
  tamanhoBase: number;
  espacamentoPadrao: number;
  raioCardBorder: number;
  boModoEscuro: number;
  idArquivoLogo: number | null;
  idArquivoFavicon: number | null;
  idClienteArquivoLogo: number | null;
  idClienteArquivoFavicon: number | null;
};

type CorporateDomain = {
  id: number;
  urlDominio: string;
  boSubdominio: number;
  boAtivo: number;
};

type Props = {
  idCliente?: number;
  allowedCompanyIds?: number[];
};

type Company = { id: number; dsEmpresa: string; caCNPJ: string; boInativo: number };

const DEFAULT_THEME: CustomTheme = {
  corPrimaria: '#1f7a53',
  corSecundaria: '#ffffff',
  corAcentuacao: '#ff0000',
  corTexto: '#17211c',
  corFundo: '#f3f6f4',
  fontePrincipal: 'Inter',
  fonteSecundaria: 'Open Sans',
  tamanhoBase: 14,
  espacamentoPadrao: 16,
  raioCardBorder: 8,
  boModoEscuro: 0,
  idArquivoLogo: null,
  idArquivoFavicon: null,
  idClienteArquivoLogo: null,
  idClienteArquivoFavicon: null,
};

const COLOR_FIELDS: [keyof CustomTheme, string][] = [
  ['corPrimaria', 'Cor Primária'],
  ['corSecundaria', 'Cor Secundária'],
  ['corAcentuacao', 'Cor de Acentuação'],
  ['corTexto', 'Cor do Texto'],
  ['corFundo', 'Cor do Fundo'],
];

export function ThemeRegistration({ idCliente, allowedCompanyIds }: Props = {}) {
  const domainUrlRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const faviconFileInputRef = useRef<HTMLInputElement>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companySearch, setCompanySearch] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  const [theme, setTheme] = useState<CustomTheme>(DEFAULT_THEME);
  const [themeFeedback, setThemeFeedback] = useState('');
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const [companyFiles, setCompanyFiles] = useState<CompanyFile[]>([]);

  const [clientTheme, setClientTheme] = useState<CustomTheme>(DEFAULT_THEME);
  const [clientThemeFeedback, setClientThemeFeedback] = useState('');
  const [isSavingClientTheme, setIsSavingClientTheme] = useState(false);
  const [clientFiles, setClientFiles] = useState<CompanyFile[]>([]);
  const [clientFilePreviewUrls, setClientFilePreviewUrls] = useState<Record<number, string>>({});
  const [clientFileModal, setClientFileModal] = useState<{ title: string; url: string } | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);

  const [domains, setDomains] = useState<CorporateDomain[]>([]);
  const [domainsPage, setDomainsPage] = useState(1);
  const [selectedDomainId, setSelectedDomainId] = useState<number | null>(null);
  const [isCreatingDomain, setIsCreatingDomain] = useState(false);
  const [domainUrl, setDomainUrl] = useState('');
  const [domainIsSubdomain, setDomainIsSubdomain] = useState(true);
  const [domainIsActive, setDomainIsActive] = useState(true);
  const [domainFeedback, setDomainFeedback] = useState('');

  const isGestorMode = Boolean(idCliente);

  const filteredCompanies = companies.filter((c) =>
    c.dsEmpresa.toLowerCase().includes(companySearch.toLowerCase()),
  );
  const isDomainFormEnabled = isGestorMode
    ? selectedDomainId !== null || isCreatingDomain
    : selectedCompanyId !== null && (selectedDomainId !== null || isCreatingDomain);
  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);
  const paginatedDomains = paginateItems(domains, domainsPage);

  useEffect(() => {
    void loadCompanies();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idCliente]);

  useEffect(() => {
    if (idCliente) {
      void loadClientTheme(idCliente);
      void loadClientDomains(idCliente);
      void loadClientFiles(idCliente);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idCliente]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    void loadCompanyTheme(selectedCompanyId);
    void loadCompanyFiles(selectedCompanyId);
  }, [selectedCompanyId]);

  useEffect(() => {
    setDomainsPage(1);
  }, [selectedCompanyId, idCliente]);

  async function loadCompanies() {
    const url = idCliente
      ? `${apiUrl}/clients/${idCliente}/companies`
      : `${apiUrl}/companies`;
    const res = await fetch(url);
    if (!res.ok) return;
    let data = (await res.json()) as Company[];
    if (allowedCompanyIds?.length) {
      data = data.filter((c) => allowedCompanyIds.includes(c.id));
    }
    setCompanies(data);
  }

  async function loadClientTheme(id: number) {
    const res = await fetch(`${apiUrl}/clients/${id}/theme`);
    if (res.status === 204 || res.status === 404) {
      setClientTheme(DEFAULT_THEME);
      return;
    }
    if (!res.ok) return;
    setClientTheme((await res.json()) as CustomTheme);
  }

  async function loadClientDomains(id: number) {
    const res = await fetch(`${apiUrl}/clients/${id}/domains`);
    if (!res.ok) return;
    setDomains((await res.json()) as CorporateDomain[]);
  }

  async function loadClientFiles(id: number) {
    const res = await fetch(`${apiUrl}/clients/${id}/files`);
    if (!res.ok) return;
    const files = (await res.json()) as CompanyFile[];
    setClientFiles(files);
    void fetchClientFilePreviews(id, files);
  }

  async function fetchClientFilePreviews(clientId: number, files: CompanyFile[]) {
    const imageFiles = files.filter((f) => isImageFile(f.anCaminho));
    const entries = await Promise.all(
      imageFiles.map(async (f) => {
        try {
          const r = await fetch(`${apiUrl}/clients/${clientId}/files/${f.id}/url`);
          if (!r.ok) return null;
          const { url } = (await r.json()) as { url: string };
          return [f.id, url] as const;
        } catch { return null; }
      }),
    );
    const urls: Record<number, string> = {};
    for (const e of entries) { if (e) urls[e[0]] = e[1]; }
    setClientFilePreviewUrls((prev) => ({ ...prev, ...urls }));
  }

  async function handleOpenClientFile(clientId: number, file: CompanyFile) {
    try {
      const r = await fetch(`${apiUrl}/clients/${clientId}/files/${file.id}/url`);
      if (!r.ok) return;
      const { url } = (await r.json()) as { url: string };
      setClientFileModal({ title: file.dsArquivo, url });
    } catch { /* silent */ }
  }

  async function loadCompanyTheme(companyId: number) {
    setThemeFeedback('');
    const res = await fetch(`${apiUrl}/companies/${companyId}/custom-theme`);
    if (res.status === 204 || res.status === 404) {
      setTheme(DEFAULT_THEME);
      return;
    }
    if (!res.ok) return;
    setTheme((await res.json()) as CustomTheme);
  }

  async function loadCompanyFiles(companyId: number) {
    const res = await fetch(`${apiUrl}/companies/${companyId}/files`);
    if (!res.ok) return;
    setCompanyFiles((await res.json()) as CompanyFile[]);
  }

  function handleSelectCompany(companyId: number) {
    if (companyId === selectedCompanyId) return;
    setSelectedCompanyId(companyId);
    setThemeFeedback('');
  }

  function setThemeField<K extends keyof CustomTheme>(field: K, value: CustomTheme[K]) {
    setTheme((prev) => ({ ...prev, [field]: value }));
  }

  function setClientThemeField<K extends keyof CustomTheme>(field: K, value: CustomTheme[K]) {
    setClientTheme((prev) => ({ ...prev, [field]: value }));
  }

  async function uploadClientFile(
    event: React.ChangeEvent<HTMLInputElement>,
    field: 'idClienteArquivoLogo' | 'idClienteArquivoFavicon',
    setUploading: (v: boolean) => void,
    inputRef: React.RefObject<HTMLInputElement | null>,
  ) {
    const file = event.target.files?.[0];
    if (!file || !idCliente) return;
    try {
      setUploading(true);
      setClientThemeFeedback('');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('dsArquivo', file.name);
      const res = await fetch(`${apiUrl}/clients/${idCliente}/files`, { method: 'POST', body: formData });
      if (!res.ok) await getApiError(res, 'Não foi possível enviar o arquivo.');
      const created = (await res.json()) as CompanyFile;
      setClientFiles((prev) => [created, ...prev]);
      if (isImageFile(created.anCaminho)) void fetchClientFilePreviews(idCliente, [created]);

      const updatedTheme = { ...clientTheme, [field]: created.id };
      setClientTheme(updatedTheme);

      const saveRes = await fetch(`${apiUrl}/clients/${idCliente}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTheme),
      });
      if (!saveRes.ok) await getApiError(saveRes, 'Arquivo enviado, mas não foi possível salvar no tema.');
      setClientThemeFeedback(field === 'idClienteArquivoLogo' ? 'Logo salvo.' : 'Favicon salvo.');
    } catch (error) {
      setClientThemeFeedback(error instanceof Error ? error.message : 'Erro ao enviar arquivo.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleUploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    void uploadClientFile(e, 'idClienteArquivoLogo', setIsUploadingLogo, logoFileInputRef);
  }

  function handleUploadFavicon(e: React.ChangeEvent<HTMLInputElement>) {
    void uploadClientFile(e, 'idClienteArquivoFavicon', setIsUploadingFavicon, faviconFileInputRef);
  }

  async function handleSaveClientTheme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!idCliente) return;
    try {
      setIsSavingClientTheme(true);
      setClientThemeFeedback('');
      const res = await fetch(`${apiUrl}/clients/${idCliente}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientTheme),
      });
      if (!res.ok) await getApiError(res, 'Não foi possível salvar o tema.');
      setClientThemeFeedback('Tema salvo com sucesso.');
    } catch (error) {
      setClientThemeFeedback(error instanceof Error ? error.message : 'Erro ao salvar tema.');
    } finally {
      setIsSavingClientTheme(false);
    }
  }

  async function handleSaveCompanyTheme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompanyId) return;
    try {
      setIsSavingTheme(true);
      setThemeFeedback('');
      const res = await fetch(`${apiUrl}/companies/${selectedCompanyId}/custom-theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(theme),
      });
      if (!res.ok) await getApiError(res, 'Não foi possível salvar o tema.');
      setThemeFeedback('Tema salvo com sucesso.');
    } catch (error) {
      setThemeFeedback(error instanceof Error ? error.message : 'Erro ao salvar tema.');
    } finally {
      setIsSavingTheme(false);
    }
  }

  function handleNewDomain() {
    setSelectedDomainId(null);
    setIsCreatingDomain(true);
    setDomainUrl('');
    setDomainIsSubdomain(true);
    setDomainIsActive(true);
    setDomainFeedback('');
    setTimeout(() => domainUrlRef.current?.focus(), 0);
  }

  function handleSelectDomain(domain: CorporateDomain) {
    setSelectedDomainId(domain.id);
    setIsCreatingDomain(false);
    setDomainUrl(domain.urlDominio);
    setDomainIsSubdomain(domain.boSubdominio === 1);
    setDomainIsActive(domain.boAtivo === 1);
    setDomainFeedback('');
  }

  function clearDomainForm() {
    setSelectedDomainId(null);
    setIsCreatingDomain(false);
    setDomainUrl('');
    setDomainIsSubdomain(true);
    setDomainIsActive(true);
  }

  async function handleToggleDomainStatus() {
    if (!selectedDomainId || !idCliente) return;
    const next = !domainIsActive;
    setDomainIsActive(next);
    try {
      const res = await fetch(
        `${apiUrl}/clients/${idCliente}/domains/${selectedDomainId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boAtivo: next ? 1 : 0 }),
        },
      );
      if (!res.ok) await getApiError(res, 'Não foi possível alterar o status.');
      const updated = (await res.json()) as CorporateDomain;
      setDomains((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch {
      setDomainIsActive(!next);
    }
  }

  async function handleSaveDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!idCliente) return;
    try {
      const payload = {
        urlDominio: domainUrl.trim().toLowerCase(),
        boSubdominio: domainIsSubdomain ? 1 : 0,
        boAtivo: domainIsActive ? 1 : 0,
      };
      const baseUrl = `${apiUrl}/clients/${idCliente}/domains`;
      const res = await fetch(
        selectedDomainId ? `${baseUrl}/${selectedDomainId}` : baseUrl,
        {
          method: selectedDomainId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) await getApiError(res, 'Não foi possível salvar o domínio.');
      const saved = (await res.json()) as CorporateDomain;
      setDomains((prev) => {
        if (selectedDomainId) return prev.map((d) => (d.id === saved.id ? saved : d));
        return [...prev, saved].sort((a, b) => a.urlDominio.localeCompare(b.urlDominio));
      });
      setSelectedDomainId(saved.id);
      setIsCreatingDomain(false);
      setDomainFeedback('Domínio salvo com sucesso.');
    } catch (error) {
      setDomainFeedback(error instanceof Error ? error.message : 'Erro ao salvar domínio.');
    }
  }

  function renderColorFields(
    themeData: CustomTheme,
    onChange: <K extends keyof CustomTheme>(f: K, v: CustomTheme[K]) => void,
    prefix: string,
  ) {
    return (
      <div className="theme-color-grid">
        {COLOR_FIELDS.map(([field, label]) => (
          <div className="field" key={`${prefix}-${field}`}>
            <label htmlFor={`${prefix}-${field}-text`}>{label}</label>
            <div className="theme-color-field">
              <input
                aria-label={`${label} - seletor`}
                id={`${prefix}-${field}-picker`}
                onChange={(e) => onChange(field, e.target.value)}
                type="color"
                value={String(themeData[field])}
              />
              <input
                id={`${prefix}-${field}-text`}
                maxLength={7}
                onChange={(e) => onChange(field, e.target.value)}
                placeholder="#000000"
                type="text"
                value={String(themeData[field])}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderThemeFields(
    themeData: CustomTheme,
    onChange: <K extends keyof CustomTheme>(f: K, v: CustomTheme[K]) => void,
    prefix: string,
    files: CompanyFile[],
    logoField: keyof CustomTheme = 'idArquivoLogo',
    faviconField: keyof CustomTheme = 'idArquivoFavicon',
  ) {
    return (
      <div className="two-columns">
        <div className="field">
          <label htmlFor={`${prefix}-fontePrincipal`}>Fonte Principal</label>
          <input
            id={`${prefix}-fontePrincipal`}
            maxLength={100}
            onChange={(e) => onChange('fontePrincipal', e.target.value)}
            placeholder="Inter"
            type="text"
            value={themeData.fontePrincipal}
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-fonteSecundaria`}>Fonte Secundária</label>
          <input
            id={`${prefix}-fonteSecundaria`}
            maxLength={100}
            onChange={(e) => onChange('fonteSecundaria', e.target.value)}
            placeholder="Open Sans"
            type="text"
            value={themeData.fonteSecundaria}
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-tamanhoBase`}>Tamanho Base (px)</label>
          <input
            id={`${prefix}-tamanhoBase`}
            max={24}
            min={10}
            onChange={(e) => onChange('tamanhoBase', Number(e.target.value))}
            type="number"
            value={themeData.tamanhoBase}
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-espacamentoPadrao`}>Espaçamento Padrão (px)</label>
          <input
            id={`${prefix}-espacamentoPadrao`}
            max={64}
            min={4}
            onChange={(e) => onChange('espacamentoPadrao', Number(e.target.value))}
            type="number"
            value={themeData.espacamentoPadrao}
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-raioCardBorder`}>Raio da Borda (px)</label>
          <input
            id={`${prefix}-raioCardBorder`}
            max={32}
            min={0}
            onChange={(e) => onChange('raioCardBorder', Number(e.target.value))}
            type="number"
            value={themeData.raioCardBorder}
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-boModoEscuro`}>Modo Escuro</label>
          <button
            aria-pressed={themeData.boModoEscuro === 1}
            className={`status-toggle ${themeData.boModoEscuro === 1 ? 'active' : ''}`}
            id={`${prefix}-boModoEscuro`}
            onClick={() => onChange('boModoEscuro', themeData.boModoEscuro === 1 ? 0 : 1)}
            type="button"
          >
            <span>{themeData.boModoEscuro === 1 ? 'Ativado' : 'Desativado'}</span>
          </button>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-${logoField}`}>Logo</label>
          <select
            id={`${prefix}-${logoField}`}
            onChange={(e) =>
              onChange(logoField, e.target.value ? Number(e.target.value) : null)
            }
            value={(themeData[logoField] as number | null) ?? ''}
          >
            <option value="">{files.length === 0 ? 'Envie uma imagem primeiro' : 'Nenhum'}</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.dsArquivo}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-${faviconField}`}>Favicon</label>
          <select
            id={`${prefix}-${faviconField}`}
            onChange={(e) =>
              onChange(faviconField, e.target.value ? Number(e.target.value) : null)
            }
            value={(themeData[faviconField] as number | null) ?? ''}
          >
            <option value="">{files.length === 0 ? 'Envie uma imagem primeiro' : 'Nenhum'}</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.dsArquivo}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  const domainsSection = isGestorMode ? (
    <div className="registration-form domain-form-panel theme-domains-section">
      <div>
        <p className="section-label">Domínios</p>
        <h3 className="theme-section-title">Domínios Corporativos</h3>
      </div>

      <div className="grid-toolbar">
        <div />
        <button className="new-button" onClick={handleNewDomain} type="button">
          <Plus size={16} />
          Novo domínio
        </button>
      </div>

      <div className="product-table" role="table" aria-label="Domínios">
        <div className="product-row theme-domain-row header" role="row">
          <span role="columnheader">URL</span>
          <span role="columnheader">Tipo</span>
          <span role="columnheader">Status</span>
        </div>
        {paginatedDomains.map((domain) => (
          <button
            className={`product-row theme-domain-row selectable ${domain.id === selectedDomainId ? 'selected' : ''}`}
            key={domain.id}
            onClick={() => handleSelectDomain(domain)}
            role="row"
            type="button"
          >
            <span role="cell">{domain.urlDominio}</span>
            <span role="cell">
              {domain.boSubdominio === 1 ? 'Subdomínio' : 'Domínio próprio'}
            </span>
            <span role="cell">
              <span className={`status-badge ${domain.boAtivo === 1 ? 'active' : 'inactive'}`}>
                {domain.boAtivo === 1 ? 'Ativo' : 'Inativo'}
              </span>
            </span>
          </button>
        ))}
        {domains.length === 0 ? (
          <div className="form-hint" style={{ margin: '0.5rem', borderRadius: '0.375rem' }}>
            Nenhum domínio cadastrado.
          </div>
        ) : null}
      </div>

      <GridPagination onChange={setDomainsPage} page={domainsPage} totalItems={domains.length} />

      <form className="theme-domain-form" onSubmit={handleSaveDomain}>
        {!isDomainFormEnabled ? (
          <div className="form-hint">Selecione um domínio ou clique em Novo domínio.</div>
        ) : null}
        {domainFeedback ? <div className="form-feedback">{domainFeedback}</div> : null}

        <div className="field">
          <label htmlFor="urlDominio">URL do Domínio</label>
          <input
            disabled={!isDomainFormEnabled}
            id="urlDominio"
            maxLength={255}
            onChange={(e) => setDomainUrl(e.target.value)}
            placeholder="ex: academia.com.br ou app.academia.com.br"
            ref={domainUrlRef}
            type="text"
            value={domainUrl}
          />
        </div>

        <div className="two-columns">
          <div className="field">
            <label htmlFor="boSubdominio">Tipo</label>
            <button
              aria-pressed={domainIsSubdomain}
              className={`status-toggle ${domainIsSubdomain ? 'active' : ''}`}
              disabled={!isDomainFormEnabled}
              id="boSubdominio"
              onClick={() => setDomainIsSubdomain((p) => !p)}
              type="button"
            >
              <span>{domainIsSubdomain ? 'Subdomínio' : 'Domínio próprio'}</span>
            </button>
          </div>
          <div className="field">
            <label htmlFor="domainStatus">Status</label>
            <button
              aria-pressed={domainIsActive}
              className={`status-toggle ${domainIsActive ? 'active' : ''}`}
              disabled={!isDomainFormEnabled}
              id="domainStatus"
              onClick={
                selectedDomainId ? handleToggleDomainStatus : () => setDomainIsActive((p) => !p)
              }
              type="button"
            >
              <span>{domainIsActive ? 'Ativo' : 'Inativo'}</span>
            </button>
          </div>
        </div>

        <div className="form-actions">
          <button
            className="secondary-button"
            disabled={!isDomainFormEnabled}
            onClick={clearDomainForm}
            type="button"
          >
            Limpar
          </button>
          <button disabled={!isDomainFormEnabled} type="submit">
            <Save size={16} />
            Salvar domínio
          </button>
        </div>
      </form>
    </div>
  ) : null;

  return (
    <>
    <div className="form-view company-view">
      <div className="form-heading">
        <p className="section-label">{isGestorMode ? 'Gestão' : 'Empresas'}</p>
        <h2>Tema{isGestorMode ? ' e Domínios' : ' e Domínios'}</h2>
        <p>
          {isGestorMode
            ? 'Configure o tema do cliente, os domínios de acesso e os temas por empresa.'
            : 'Configure o tema visual de cada empresa.'}
        </p>
      </div>

      {/* Client-level theme (gestor mode only) */}
      {isGestorMode && (
        <form
          className="registration-form domain-form-panel theme-form"
          onSubmit={handleSaveClientTheme}
        >
          <div>
            <p className="section-label">Tema Principal</p>
            <h3 className="theme-section-title">Tema do Cliente</h3>
          </div>

          {clientThemeFeedback ? (
            <div className="form-feedback">{clientThemeFeedback}</div>
          ) : null}

          {/* Logo + Favicon upload fields */}
          <div className="theme-files-two-col">
            {(['logo', 'favicon'] as const).map((type) => {
              const field = type === 'logo' ? 'idClienteArquivoLogo' : 'idClienteArquivoFavicon';
              const fileId = clientTheme[field] as number | null;
              const previewUrl = fileId ? (clientFilePreviewUrls[fileId] ?? null) : null;
              const fileRecord = fileId ? clientFiles.find((f) => f.id === fileId) : null;
              const isUploading = type === 'logo' ? isUploadingLogo : isUploadingFavicon;
              const inputRef = type === 'logo' ? logoFileInputRef : faviconFileInputRef;
              const onChange = type === 'logo' ? handleUploadLogo : handleUploadFavicon;
              const label = type === 'logo' ? 'Logo' : 'Favicon';

              return (
                <div className="theme-file-field" key={type}>
                  <p className="section-label">{label}</p>

                  {fileId && previewUrl ? (
                    <div className="theme-file-preview-box">
                      <button
                        className="file-preview-button"
                        onClick={() => fileRecord && void handleOpenClientFile(idCliente!, fileRecord)}
                        type="button"
                      >
                        <img
                          alt={label}
                          className="theme-file-preview-img"
                          src={previewUrl}
                        />
                      </button>
                      <span className="theme-file-preview-name">{fileRecord?.dsArquivo ?? ''}</span>
                      <div className="theme-file-preview-actions">
                        <label className="upload-button" aria-disabled={isUploading} style={{ fontSize: '0.8rem', padding: '0.375rem 0.75rem' }}>
                          <input accept="image/*" disabled={isUploading} onChange={onChange} ref={inputRef} style={{ display: 'none' }} type="file" />
                          {isUploading ? 'Enviando...' : 'Alterar'}
                        </label>
                        <button
                          className="icon-button danger"
                          onClick={() => {
                            const updatedTheme = { ...clientTheme, [field]: null };
                            setClientTheme(updatedTheme);
                            void fetch(`${apiUrl}/clients/${idCliente}/theme`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(updatedTheme),
                            }).catch(() => {});
                          }}
                          title={`Remover ${label}`}
                          type="button"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className={`theme-file-upload-area ${isUploading ? 'uploading' : ''}`} aria-disabled={isUploading}>
                      <input accept="image/*" disabled={isUploading} onChange={onChange} ref={inputRef} style={{ display: 'none' }} type="file" />
                      <Upload size={20} />
                      <span>{isUploading ? 'Enviando...' : `Enviar ${label}`}</span>
                    </label>
                  )}
                </div>
              );
            })}
          </div>

          {renderColorFields(clientTheme, setClientThemeField, 'client')}
          {renderThemeFields(clientTheme, setClientThemeField, 'client', [])}

          <div className="form-actions">
            <button disabled={isSavingClientTheme} type="submit">
              <Save size={16} />
              Salvar tema do cliente
            </button>
          </div>
        </form>
      )}

      {/* Domains section (gestor mode only, client-level) */}
      {domainsSection}

      {/* Company list + company theme workspace */}
      <div className="theme-workspace">
        <div className="domain-panel">
          <section className="data-grid-section">
            <div className="grid-toolbar">
              <div>
                <p className="section-label">Empresas</p>
                <h3>Selecione uma empresa</h3>
              </div>
              <label className="search-field">
                <span>Pesquisar</span>
                <input
                  onChange={(e) => setCompanySearch(e.target.value)}
                  placeholder="Buscar empresa"
                  type="search"
                  value={companySearch}
                />
              </label>
            </div>

            <div className="domain-select-table" role="table" aria-label="Empresas">
              <div className="domain-select-row header" role="row">
                <span role="columnheader">Empresa</span>
              </div>
              {filteredCompanies.map((company) => (
                <button
                  className={`domain-select-row selectable ${company.id === selectedCompanyId ? 'selected' : ''}`}
                  key={company.id}
                  onClick={() => handleSelectCompany(company.id)}
                  role="row"
                  type="button"
                >
                  <span role="cell">{company.dsEmpresa}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="theme-content-panel">
          {!selectedCompanyId ? (
            <div className="registration-form domain-form-panel">
              <div className="form-hint">
                {isGestorMode
                  ? 'Selecione uma empresa para configurar o tema específico da empresa.'
                  : 'Selecione uma empresa para configurar o tema visual.'}
              </div>
            </div>
          ) : (
            <form
              className="registration-form domain-form-panel theme-form"
              onSubmit={handleSaveCompanyTheme}
            >
              <div>
                <p className="section-label">{isGestorMode ? 'Tema por Empresa' : 'Tema'}</p>
                <h3 className="theme-section-title">
                  {isGestorMode ? 'Tema Customizado' : 'Tema Customizado'} —{' '}
                  {selectedCompany?.dsEmpresa}
                </h3>
              </div>

              {themeFeedback ? <div className="form-feedback">{themeFeedback}</div> : null}

              {renderColorFields(theme, setThemeField, 'company')}
              {renderThemeFields(theme, setThemeField, 'company', companyFiles)}

              <div className="form-actions">
                <button disabled={isSavingTheme} type="submit">
                  <Save size={16} />
                  Salvar tema
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>

    {clientFileModal ? (
      <div
        className="file-modal-overlay"
        onClick={() => setClientFileModal(null)}
        role="dialog"
        aria-modal="true"
      >
        <div className="file-modal" onClick={(e) => e.stopPropagation()}>
          <div className="file-modal-header">
            <h3>{clientFileModal.title}</h3>
            <button onClick={() => setClientFileModal(null)} type="button">
              Fechar
            </button>
          </div>
          <img alt={clientFileModal.title} src={clientFileModal.url} />
        </div>
      </div>
    ) : null}
    </>
  );
}
