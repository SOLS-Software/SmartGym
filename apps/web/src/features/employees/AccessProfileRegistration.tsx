'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useEnvio } from '../../shared/registration/useEnvio';
import { useToast } from '../../shared/components/Toast';

type PermissionDomain = {
  key: string;
  label: string;
  description: string;
  permissions: { key: string; action: 'read' | 'write'; label: string }[];
};

type AccessProfile = {
  id: number;
  dsPerfil: string;
  boPadrao: boolean;
  boInativo: boolean;
  permissoes: string[];
  qtFuncionarios: number;
};

export function AccessProfileRegistration() {
  const { enviando, envolver } = useEnvio();
  const { showToast } = useToast();
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [domains, setDomains] = useState<PermissionDomain[]>([]);
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [dsPerfil, setDsPerfil] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const filteredProfiles = profiles.filter((profile) =>
    profile.dsPerfil.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  async function loadDomains() {
    try {
      const response = await fetch(`${apiUrl}/access-profiles/permissions`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as permissões.');
      setDomains((await response.json()) as PermissionDomain[]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar permissões.');
    }
  }

  async function loadProfiles() {
    try {
      setIsLoading(true);
      const response = await fetch(`${apiUrl}/access-profiles`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os perfis.');
      setProfiles((await response.json()) as AccessProfile[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar perfis.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDomains();
    void loadProfiles();
  }, []);

  function handleNew() {
    setSelectedProfileId(null);
    setIsCreating(true);
    setDsPerfil('');
    setIsActive(true);
    setGranted(new Set());
    setFeedback('');
    setIsDrawerOpen(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function handleEdit(profile: AccessProfile) {
    setSelectedProfileId(profile.id);
    setIsCreating(false);
    setDsPerfil(profile.dsPerfil);
    setIsActive(profile.boInativo === false);
    setGranted(new Set(profile.permissoes));
    setFeedback('');
    setIsDrawerOpen(true);
  }

  function togglePermission(key: string) {
    setGranted((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
        // Tirar a leitura tira a edição junto: um perfil que edita sem
        // enxergar a lista não abre a tela — daria erro na primeira consulta.
        if (key.endsWith('.read')) next.delete(key.replace('.read', '.write'));
      } else {
        next.add(key);
        // E marcar a edição marca a leitura, pela mesma razão.
        if (key.endsWith('.write')) next.add(key.replace('.write', '.read'));
      }
      return next;
    });
  }

  function toggleDomain(domain: PermissionDomain, enable: boolean) {
    setGranted((current) => {
      const next = new Set(current);
      for (const permission of domain.permissions) {
        if (enable) next.add(permission.key);
        else next.delete(permission.key);
      }
      return next;
    });
  }

  async function handleToggleStatus() {
    if (!selectedProfileId) {
      setIsActive((current) => !current);
      return;
    }

    const nextActive = !isActive;
    setIsActive(nextActive);

    try {
      const response = await fetch(`${apiUrl}/access-profiles/${selectedProfileId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: nextActive ? false : true }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível alterar o status.');
      await loadProfiles();
    } catch (error) {
      setIsActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const payload = {
        dsPerfil: dsPerfil.trim(),
        permissoes: [...granted],
        boInativo: isActive ? false : true,
      };

      const response = await fetch(
        selectedProfileId ? `${apiUrl}/access-profiles/${selectedProfileId}` : `${apiUrl}/access-profiles`,
        {
          method: selectedProfileId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) await getApiError(response, 'Não foi possível salvar o perfil.');

      await loadProfiles();
      setIsCreating(false);
      showToast('Perfil de acesso salvo com sucesso.');
      setIsDrawerOpen(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar perfil.');
    }
  }

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">RH</p>
        <h2 className="module-page-title">PERFIS DE ACESSO</h2>
      </header>
      <div className="form-view">
        <section className="data-grid-section">
          {feedback ? <div className="form-feedback">{feedback}</div> : null}

          <RegistrationGrid<AccessProfile>
            ariaLabel="Perfis de acesso cadastrados"
            label="Perfis"
            columns={[
              { label: 'Perfil', render: (r) => r.dsPerfil, sortValue: (r) => r.dsPerfil },
              {
                label: 'Permissões',
                render: (r) => `${r.permissoes.length} concedida(s)`,
                sortValue: (r) => r.permissoes.length,
              },
              {
                label: 'Profissionais',
                render: (r) => String(r.qtFuncionarios),
                sortValue: (r) => r.qtFuncionarios,
              },
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
            records={filteredProfiles}
            isLoading={isLoading}
            selectedId={selectedProfileId}
            onSelect={handleEdit}
            onEdit={handleEdit}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            searchPlaceholder="Buscar perfil"
            onNew={handleNew}
            emptyMessage="Nenhum perfil de acesso cadastrado."
          />
        </section>

        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title={isCreating ? 'Novo Perfil de Acesso' : 'Editar Perfil de Acesso'}
          onClose={() => setIsDrawerOpen(false)}
        >
          <form className="drawer-fields" onSubmit={envolver(handleSave)}>
            {feedback ? (
              <div className="form-feedback" style={{ flex: '1 1 100%' }}>
                {feedback}
              </div>
            ) : null}

            <RegistrationField htmlFor="perfilNome" label="Nome do perfil" size="full">
              <input
                id="perfilNome"
                maxLength={100}
                onChange={(event) => setDsPerfil(event.target.value)}
                placeholder="Ex.: Recepção do turno da noite"
                ref={nameInputRef}
                required
                type="text"
                value={dsPerfil}
              />
            </RegistrationField>

            <RegistrationField htmlFor="perfilStatus" label="Status" size="full">
              <button
                aria-pressed={isActive}
                className={`status-toggle ${isActive ? 'active' : ''}`}
                id="perfilStatus"
                onClick={() => void handleToggleStatus()}
                type="button"
              >
                {isActive ? 'Ativo' : 'Inativo'}
              </button>
            </RegistrationField>

            <div className="permission-matrix" style={{ flex: '1 1 100%' }}>
              <p className="section-label">Permissões</p>
              <p className="permission-matrix-hint">
                Marque o que este perfil pode ver e editar. Quem não tem a permissão não
                enxerga o item no menu e recebe recusa do servidor se tentar mesmo assim.
              </p>

              {domains.map((domain) => {
                const total = domain.permissions.length;
                const marked = domain.permissions.filter((permission) =>
                  granted.has(permission.key),
                ).length;

                return (
                  <div className="permission-domain" key={domain.key}>
                    <div className="permission-domain-head">
                      <div>
                        <strong>{domain.label}</strong>
                        <span className="permission-domain-description">{domain.description}</span>
                      </div>
                      <button
                        className="permission-domain-toggle"
                        onClick={() => toggleDomain(domain, marked !== total)}
                        type="button"
                      >
                        {marked === total ? 'Limpar' : 'Marcar tudo'}
                      </button>
                    </div>
                    <div className="permission-domain-actions">
                      {domain.permissions.map((permission) => (
                        <label className="permission-checkbox" key={permission.key}>
                          <input
                            checked={granted.has(permission.key)}
                            onChange={() => togglePermission(permission.key)}
                            type="checkbox"
                          />
                          <span>{permission.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="form-actions" style={{ flex: '1 1 100%' }}>
              <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">
                Cancelar
              </button>
              <button disabled={enviando} type="submit">
                <Save size={16} />
                {isCreating ? 'Criar perfil' : 'Salvar perfil'}
              </button>
            </div>
          </form>
        </RegistrationDrawer>
      </div>
    </>
  );
}
