'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useToast } from '../../shared/components/Toast';
import { formatCpf, formatDateDisplay } from '../../shared/registration/registrationHelpers';

type Me = {
  id: number;
  login: string;
  type: 'student' | 'employee';
  name: string;
  caCPF: string;
  anEmail: string;
  dtNascimento: string | null;
  dtUltimoAcesso: string | null;
  funcionario: {
    id: number;
    dtAdmissao: string | null;
    nrDDD: number | null;
    nrContato: string | null;
    cargo: { id: number; dsCargo: string } | null;
    empresa: { id: number; dsEmpresa: string } | null;
    perfilAcesso: { id: number; dsPerfil: string; boInativo: boolean } | null;
    permissions: string[];
  } | null;
};

export function MyAccount() {
  const { showToast } = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`${apiUrl}/auth/me`);
        if (!response.ok) await getApiError(response, 'Não foi possível carregar seus dados.');
        setMe((await response.json()) as Me);
        setFeedback('');
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Erro ao carregar seus dados.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordFeedback('');

    if (newPassword !== confirmPassword) {
      setPasswordFeedback('A confirmação não confere com a nova senha.');
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch(`${apiUrl}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível alterar a senha.');

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Trocar a senha derruba as sessões, inclusive esta — avisar antes de o
      // próximo clique dar "sessão expirada" é o mínimo.
      showToast('Senha alterada. Entre novamente com a nova senha.');
    } catch (error) {
      setPasswordFeedback(error instanceof Error ? error.message : 'Erro ao alterar a senha.');
    } finally {
      setIsSaving(false);
    }
  }

  const funcionario = me?.funcionario ?? null;
  const telefone =
    funcionario?.nrContato
      ? `(${String(funcionario.nrDDD ?? '').padStart(2, '0')}) ${funcionario.nrContato}`
      : '-';

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Minha conta</p>
        <h2 className="module-page-title">MEUS DADOS</h2>
      </header>

      <div className="form-view account">
        {feedback ? <div className="form-feedback">{feedback}</div> : null}

        {isLoading ? (
          <p className="account-empty">Carregando...</p>
        ) : !me ? null : (
          <>
            <section className="account-card" aria-label="Dados cadastrais">
              <div className="account-identity">
                <strong>{me.name}</strong>
                <span>{funcionario?.perfilAcesso?.dsPerfil ?? (me.type === 'student' ? 'Aluno' : 'Sem perfil de acesso')}</span>
              </div>

              <dl className="account-fields">
                <div>
                  <dt>Login</dt>
                  <dd>{me.login || '-'}</dd>
                </div>
                <div>
                  <dt>CPF</dt>
                  <dd>{me.caCPF ? formatCpf(me.caCPF) : '-'}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{me.anEmail || '-'}</dd>
                </div>
                {funcionario ? (
                  <>
                    <div>
                      <dt>Empresa</dt>
                      <dd>{funcionario.empresa?.dsEmpresa ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>Cargo</dt>
                      <dd>{funcionario.cargo?.dsCargo ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>Admissão</dt>
                      <dd>
                        {funcionario.dtAdmissao ? formatDateDisplay(funcionario.dtAdmissao) : '-'}
                      </dd>
                    </div>
                    <div>
                      <dt>Contato</dt>
                      <dd>{telefone}</dd>
                    </div>
                  </>
                ) : null}
              </dl>

              <p className="account-note">
                Para corrigir estes dados, fale com quem cuida do cadastro — esta tela é de
                consulta.
              </p>
            </section>

            {funcionario ? (
              <section className="account-card" aria-label="Meu acesso">
                <p className="section-label">O que eu acesso</p>
                {funcionario.permissions.length === 0 ? (
                  <p className="account-empty">
                    Seu usuário ainda não tem perfil de acesso, então nenhuma tela do sistema
                    está liberada. Peça a quem administra para atribuir um perfil.
                  </p>
                ) : (
                  <p className="account-note">
                    Perfil <strong>{funcionario.perfilAcesso?.dsPerfil}</strong>, com{' '}
                    {funcionario.permissions.length} permissões. O que aparece no seu menu vem
                    daqui.
                  </p>
                )}
              </section>
            ) : null}

            <section className="account-card" aria-label="Trocar senha">
              <p className="section-label">Trocar senha</p>
              <form className="drawer-fields" onSubmit={handleChangePassword}>
                {passwordFeedback ? (
                  <div className="form-feedback" style={{ flex: '1 1 100%' }}>
                    {passwordFeedback}
                  </div>
                ) : null}

                <RegistrationField htmlFor="senhaAtual" label="Senha atual" size="md">
                  <input
                    autoComplete="current-password"
                    id="senhaAtual"
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    required
                    type="password"
                    value={currentPassword}
                  />
                </RegistrationField>

                <RegistrationField htmlFor="senhaNova" label="Nova senha" size="md">
                  <input
                    autoComplete="new-password"
                    id="senhaNova"
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    type="password"
                    value={newPassword}
                  />
                </RegistrationField>

                <RegistrationField htmlFor="senhaConfirma" label="Confirmar nova senha" size="md">
                  <input
                    autoComplete="new-password"
                    id="senhaConfirma"
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    type="password"
                    value={confirmPassword}
                  />
                </RegistrationField>

                <p className="account-note" style={{ flex: '1 1 100%' }}>
                  Trocar a senha encerra as sessões abertas em outros aparelhos — inclusive
                  esta. Você entrará de novo com a senha nova.
                </p>

                <div className="form-actions" style={{ flex: '1 1 100%' }}>
                  <button disabled={isSaving} type="submit">
                    <KeyRound size={16} />
                    {isSaving ? 'Alterando...' : 'Alterar senha'}
                  </button>
                </div>
              </form>
            </section>
          </>
        )}
      </div>
    </>
  );
}
