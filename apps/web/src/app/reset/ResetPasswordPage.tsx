'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch as fetch, apiUrl } from '../../shared/api/apiFetch';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback('');

    if (!password) {
      setFeedback('Informe a nova senha.');
      return;
    }
    if (password !== confirmPassword) {
      setFeedback('As senhas nao conferem.');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(`${apiUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? 'Nao foi possivel redefinir a senha.');
      }

      setIsDone(true);
      setFeedback(data.message ?? 'Senha redefinida com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao redefinir senha.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="reset-title">
        <div className="brand">
          <div className="logo" aria-hidden="true">SG</div>
          <div>
            <p className="eyebrow">SmartGym</p>
            <h1 id="reset-title">Redefinir senha</h1>
          </div>
        </div>

        {feedback ? <div className="login-feedback">{feedback}</div> : null}

        {!token ? (
          <div className="login-form">
            <p>Link de redefinicao invalido. Solicite um novo email em &quot;Esqueci minha senha&quot; na tela de login.</p>
            <button onClick={() => router.push('/')} type="button">
              Ir para o login
            </button>
          </div>
        ) : isDone ? (
          <div className="login-form">
            <button onClick={() => router.push('/')} type="button">
              Ir para o login
            </button>
          </div>
        ) : (
          <form className="login-form" method="post" onSubmit={handleSubmit}>
            <label htmlFor="new-password">Nova senha</label>
            <div className="password-field">
              <input
                id="new-password"
                name="new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Digite a nova senha"
                onChange={(event) => setPassword(event.target.value)}
                value={password}
              />
              <button
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showPassword}
                className="password-eye-button"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                <span aria-hidden="true" />
              </button>
            </div>

            <label htmlFor="confirm-password">Confirmar nova senha</label>
            <input
              id="confirm-password"
              name="confirm-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repita a nova senha"
              onChange={(event) => setConfirmPassword(event.target.value)}
              value={confirmPassword}
            />

            <button disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Salvando...' : 'Redefinir senha'}
            </button>
            <button
              className="secondary-login-button"
              disabled={isSubmitting}
              onClick={() => router.push('/')}
              type="button"
            >
              Voltar para o login
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

// useSearchParams exige Suspense boundary no app router.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
