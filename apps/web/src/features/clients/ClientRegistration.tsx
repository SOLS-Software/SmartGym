'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { GridPagination, paginateItems } from '../../shared/registration/registrationHelpers';
import { formatCnpj } from '../companies/companyUtils';

type Client = {
  id: number;
  dsCliente: string;
  caCNPJ: string | null;
  boInativo: number;
};

export function ClientRegistration() {
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [clientName, setClientName] = useState('');
  const [clientCnpj, setClientCnpj] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const filteredClients = clients.filter((c) => {
    const term = search.toLowerCase();
    return (
      c.dsCliente.toLowerCase().includes(term) ||
      (c.caCNPJ ?? '').includes(search.replace(/\D/g, ''))
    );
  });
  const paginatedClients = paginateItems(filteredClients, page);
  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;
  const isFormEnabled = isCreating || selectedClientId !== null;

  useEffect(() => {
    void loadClients();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search]);

  async function loadClients() {
    try {
      const res = await fetch(`${apiUrl}/clients`);
      if (!res.ok) return;
      setClients((await res.json()) as Client[]);
    } catch { /* silent */ }
  }

  function handleNew() {
    setSelectedClientId(null);
    setIsCreating(true);
    setClientName('');
    setClientCnpj('');
    setIsActive(true);
    setFeedback('');
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function handleSelect(client: Client) {
    setSelectedClientId(client.id);
    setIsCreating(false);
    setClientName(client.dsCliente);
    setClientCnpj(client.caCNPJ ?? '');
    setIsActive(client.boInativo === 0);
    setFeedback('');
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = clientName.trim();
    if (!name) {
      setFeedback('Informe o nome do cliente.');
      return;
    }
    try {
      setIsSaving(true);
      setFeedback('');
      const payload = {
        dsCliente: name,
        caCNPJ: clientCnpj.replace(/\D/g, '') || null,
        boInativo: isActive ? 0 : 1,
      };
      const res = await fetch(
        isCreating ? `${apiUrl}/clients` : `${apiUrl}/clients/${selectedClientId}`,
        {
          method: isCreating ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) await getApiError(res, 'Não foi possível salvar o cliente.');
      const saved = (await res.json()) as Client;
      if (isCreating) {
        setClients((prev) =>
          [...prev, saved].sort((a, b) => a.dsCliente.localeCompare(b.dsCliente)),
        );
        setIsCreating(false);
        setSelectedClientId(saved.id);
      } else {
        setClients((prev) =>
          prev.map((c) => (c.id === saved.id ? saved : c))
            .sort((a, b) => a.dsCliente.localeCompare(b.dsCliente)),
        );
      }
      setFeedback('Cliente salvo com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar cliente.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!selectedClientId) return;
    const next = !isActive;
    setIsActive(next);
    try {
      const res = await fetch(`${apiUrl}/clients/${selectedClientId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: next ? 0 : 1 }),
      });
      if (!res.ok) await getApiError(res, 'Não foi possível alterar o status.');
      const updated = (await res.json()) as Client;
      setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch {
      setIsActive(!next);
    }
  }

  return (
    <div className="form-view company-view">
      <div className="form-heading">
        <p className="section-label">Administração</p>
        <h2>Clientes</h2>
        <p>Cadastre clientes, configure temas e gerencie logo e favicon de cada um.</p>
      </div>

      <div className="client-workspace">
        {/* ── Left: client list ── */}
        <div className="domain-panel">
          <section className="data-grid-section">
            <div className="grid-toolbar">
              <div>
                <p className="section-label">Lista</p>
                <h3>Clientes</h3>
              </div>
              <button className="new-button" onClick={handleNew} type="button">
                <Plus size={16} />
                Novo
              </button>
            </div>

            <label className="search-field mb-2">
              <span>Pesquisar</span>
              <input
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou CNPJ"
                type="search"
                value={search}
              />
            </label>

            <div className="domain-select-table" role="table" aria-label="Clientes">
              <div className="domain-select-row header" role="row">
                <span role="columnheader">Cliente</span>
              </div>
              {paginatedClients.map((c) => (
                <button
                  className={`domain-select-row selectable ${c.id === selectedClientId ? 'selected' : ''}`}
                  key={c.id}
                  onClick={() => handleSelect(c)}
                  role="row"
                  type="button"
                >
                  <span role="cell" className="flex items-center justify-between gap-2">
                    <span>{c.dsCliente}</span>
                    <span className={`status-badge shrink-0 ${c.boInativo === 0 ? 'active' : 'inactive'}`}>
                      {c.boInativo === 0 ? 'Ativo' : 'Inativo'}
                    </span>
                  </span>
                </button>
              ))}
              {filteredClients.length === 0 && (
                <div className="form-hint m-2 rounded-md">
                  {search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}
                </div>
              )}
            </div>

            <GridPagination onChange={setPage} page={page} totalItems={filteredClients.length} />
          </section>
        </div>

        {/* ── Right: details + theme ── */}
        <div className="client-detail-panel">
          {!isFormEnabled ? (
            <div className="registration-form domain-form-panel">
              <div className="form-hint">
                Selecione um cliente ou clique em Novo para começar.
              </div>
            </div>
          ) : (
            <>
              {/* Client info form */}
              <form className="registration-form domain-form-panel" onSubmit={handleSave}>
                <div>
                  <p className="section-label">{isCreating ? 'Novo Cliente' : 'Dados'}</p>
                  <h3 className="theme-section-title">
                    {isCreating ? 'Cadastrar Cliente' : selectedClient?.dsCliente}
                  </h3>
                </div>

                {feedback ? <div className="form-feedback">{feedback}</div> : null}

                <div className="two-columns">
                  <div className="field col-span-full">
                    <label htmlFor="clientName">Nome do Cliente *</label>
                    <input
                      id="clientName"
                      maxLength={255}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Ex: Academia Fitness"
                      ref={nameInputRef}
                      required
                      type="text"
                      value={clientName}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="clientCnpj">CNPJ</label>
                    <input
                      id="clientCnpj"
                      maxLength={18}
                      onChange={(e) => setClientCnpj(formatCnpj(e.target.value))}
                      placeholder="00.000.000/0000-00"
                      type="text"
                      value={clientCnpj}
                    />
                  </div>

                  {!isCreating && (
                    <div className="field">
                      <label htmlFor="clientStatus">Status</label>
                      <button
                        aria-pressed={isActive}
                        className={`status-toggle ${isActive ? 'active' : ''}`}
                        id="clientStatus"
                        onClick={handleToggleStatus}
                        type="button"
                      >
                        <span>{isActive ? 'Ativo' : 'Inativo'}</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="form-actions">
                  <button disabled={isSaving} type="submit">
                    <Save size={16} />
                    {isSaving ? 'Salvando...' : isCreating ? 'Criar cliente' : 'Salvar dados'}
                  </button>
                </div>
              </form>

            </>
          )}
        </div>
      </div>
    </div>
  );
}
