'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { LogOut, Palette } from 'lucide-react';
import { apiFetch as fetch, apiUrl } from '../../shared/api/apiFetch';
import {
  SESSION_KEY,
  SESSION_MAX_AGE_MS,
  encryptSession,
  decryptSession,
  readJsonResponse,
} from '../../shared/auth/sessionUtils';
import type { AuthenticatedUser } from '../../shared/auth/sessionUtils';
import { ThemeRegistration } from '../../features/companies/ThemeRegistration';
import { formatCpf } from '../../shared/registration/registrationHelpers';

type ClientTheme = {
  idCliente: number;
  dsCliente: string;
  corPrimaria?: string;
  corSecundaria?: string;
  corAcentuacao?: string;
  corTexto?: string;
  corFundo?: string;
  fontePrincipal?: string;
  tamanhoBase?: number;
  boModoEscuro?: number;
  logoUrl?: string | null;
  faviconUrl?: string | null;
};

type Company = { id: number; dsEmpresa: string; caCNPJ: string; boInativo: number };

type GestorSession = AuthenticatedUser & {
  idCliente: number;
  empresas: Company[];
};

const GESTOR_SESSION_KEY = 'smartgym_gestor_session';
const GESTOR_THEME_CACHE_KEY = 'smartgym_gestor_theme_cache';

export default function GestorPage() {
  const [clientTheme, setClientTheme] = useState<ClientTheme | null>(null);
  const [themePhase, setThemePhase] = useState<'fetching' | 'applying' | null>('fetching');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const themeFingerprint = useMemo(() => {
    if (!clientTheme) return '';
    const { logoUrl, faviconUrl, ...core } = clientTheme;
    return JSON.stringify(core);
  }, [clientTheme]);

  useEffect(() => {
    if (!clientTheme) return;
    const { logoUrl, faviconUrl, ...core } = clientTheme;
    localStorage.setItem(GESTOR_THEME_CACHE_KEY, JSON.stringify(core));
  }, [themeFingerprint]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [session, setSession] = useState<GestorSession | null>(null);

  const [loginCpf, setLoginCpf] = useState('');
  const [loginClienteId, setLoginClienteId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Fetch client theme from domain on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(GESTOR_THEME_CACHE_KEY);
      if (cached) {
        const core = JSON.parse(cached) as Omit<ClientTheme, 'logoUrl' | 'faviconUrl'>;
        const theme = { ...core, logoUrl: null, faviconUrl: null };
        setClientTheme(theme);
        applyTheme(theme);
        setThemePhase(null);
      }
    } catch {}

    const hostname = window.location.hostname;
    void fetch(`${apiUrl}/auth/theme?url=${encodeURIComponent(hostname)}`)
      .then(async (res) => {
        if (res.status === 204 || !res.ok) return;
        const data = await res.json() as ClientTheme;
        setThemePhase('applying');
        requestAnimationFrame(() => {
          setClientTheme(data);
          applyTheme(data);
          setThemePhase(null);
        });
      })
      .catch(() => {})
      .finally(() => { setThemePhase((p) => p === 'fetching' ? null : p); });
  }, []);

  // Restore gestor session on mount
  useEffect(() => {
    void (async () => {
      try {
        const stored = localStorage.getItem(GESTOR_SESSION_KEY);
        if (stored) {
          const parsed = JSON.parse(atob(stored)) as { data: GestorSession; cachedAt: number };
          if (Date.now() - parsed.cachedAt > SESSION_MAX_AGE_MS) {
            localStorage.removeItem(GESTOR_SESSION_KEY);
          } else {
            const res = await fetch(`${apiUrl}/auth/verify?id=${parsed.data.id}`);
            if (res.ok && parsed.data.type === 'employee') {
              setSession(parsed.data);
              setIsLoggedIn(true);
            } else {
              localStorage.removeItem(GESTOR_SESSION_KEY);
            }
          }
        }
      } catch {
        localStorage.removeItem(GESTOR_SESSION_KEY);
      } finally {
        setIsSessionLoading(false);
      }
    })();
  }, []);

  function loadGoogleFont(fontName: string) {
    const id = `gfont-${fontName.replace(/\s+/g, '-').toLowerCase()}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;600;700;800&display=swap`;
    document.head.appendChild(link);
  }

  function lightenColor(hex: string): string {
    const h = hex.replace('#', '');
    return `#${[0, 2, 4].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16);
      return Math.min(255, Math.round(c + (255 - c) * 0.82)).toString(16).padStart(2, '0');
    }).join('')}`;
  }

  function applyTheme(theme: ClientTheme) {
    const root = document.documentElement;
    if (theme.corPrimaria) {
      root.style.setProperty('--color-primary', theme.corPrimaria);
      const hex = theme.corPrimaria.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const d = (c: number) => Math.max(0, Math.round(c * 0.82)).toString(16).padStart(2, '0');
      root.style.setProperty('--color-primary-dark', `#${d(r)}${d(g)}${d(b)}`);
      root.style.setProperty('--color-primary-bg', lightenColor(theme.corPrimaria));
    }
    if (theme.corSecundaria) {
      root.style.setProperty('--color-secondary', theme.corSecundaria);
      root.style.setProperty('--color-secondary-bg', lightenColor(theme.corSecundaria));
    }
    if (theme.corAcentuacao) {
      root.style.setProperty('--color-accent', theme.corAcentuacao);
      root.style.setProperty('--color-accent-bg', lightenColor(theme.corAcentuacao));
    }
    if (theme.corTexto) root.style.setProperty('--color-text', theme.corTexto);
    if (theme.corFundo) root.style.setProperty('--color-bg', theme.corFundo);

    if (theme.fontePrincipal) {
      loadGoogleFont(theme.fontePrincipal);
      root.style.setProperty('--font-primary', `${theme.fontePrincipal}, ui-sans-serif, system-ui, sans-serif`);
    }
    if (theme.tamanhoBase) {
      root.style.setProperty('--font-size-base', `${theme.tamanhoBase}px`);
    }

    if (theme.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = theme.faviconUrl;
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback('');

    const idCliente = clientTheme?.idCliente ?? Number(loginClienteId);
    if (!idCliente) {
      setFeedback('Informe o ID do cliente para acessar o gestor.');
      return;
    }

    const formData = new FormData(event.currentTarget);
    try {
      setIsSubmitting(true);
      const res = await fetch(`${apiUrl}/auth/gestor-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: String(formData.get('user') ?? ''),
          password: String(formData.get('password') ?? ''),
          idCliente,
        }),
      });
      const data = await readJsonResponse<GestorSession>(res, 'Não foi possível entrar.');
      setSession(data);
      setIsLoggedIn(true);
      localStorage.setItem(
        GESTOR_SESSION_KEY,
        btoa(JSON.stringify({ data, cachedAt: Date.now() })),
      );
      // Also update the shared session so the main app recognises this login
      void encryptSession({ user: { id: data.id, idAluno: null, idFuncionario: data.idFuncionario, name: data.name, type: 'employee' }, activeItem: 'gestor', cachedAt: Date.now() })
        .then((enc) => localStorage.setItem(SESSION_KEY, enc))
        .catch(() => {});
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao entrar.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(GESTOR_SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    setIsLoggedIn(false);
    setSession(null);
    setLoginCpf('');
    setFeedback('');
  }

  if (isSessionLoading) {
    return <main className="login-page" />;
  }

  if (themePhase && !isLoggedIn) {
    return (
      <main className="login-page">
        <p style={{ color: 'var(--color-text)', opacity: 0.5, fontSize: '0.875rem' }}>
          {themePhase === 'applying' ? 'Aplicando configurações...' : 'Buscando configurações...'}
        </p>
      </main>
    );
  }

  if (!isLoggedIn || !session) {
    const logoUrl = clientTheme?.logoUrl;
    const clientName = clientTheme?.dsCliente ?? 'SmartGym';

    return (
      <main className="login-page">
        <section className="login-panel" aria-labelledby="gestor-title">
          <div className="brand">
            <div className="logo" aria-hidden="true">
              {logoUrl
                ? <img alt="Logo" src={logoUrl} style={{ height: '100%', objectFit: 'contain', width: '100%' }} />
                : <Palette size={26} />}
            </div>
            <div>
              <p className="eyebrow">{clientName}</p>
              <h1 id="gestor-title">Gestor de Tema</h1>
            </div>
          </div>

          {feedback ? <div className="login-feedback">{feedback}</div> : null}

          <form className="login-form" method="post" onSubmit={handleLogin}>
            {!clientTheme && (
              <>
                <label htmlFor="clienteId">ID do Cliente</label>
                <input
                  id="clienteId"
                  onChange={(e) => setLoginClienteId(e.target.value)}
                  placeholder="Ex: 1"
                  type="number"
                  value={loginClienteId}
                />
              </>
            )}

            <label htmlFor="user">CPF</label>
            <input
              autoComplete="username"
              id="user"
              name="user"
              onChange={(e) => setLoginCpf(formatCpf(e.target.value))}
              placeholder="000.000.000-00"
              type="text"
              value={loginCpf}
            />

            <label htmlFor="password">Senha</label>
            <div className="password-field">
              <input
                autoComplete="current-password"
                id="password"
                name="password"
                placeholder="Digite sua senha"
                type={showPassword ? 'text' : 'password'}
              />
              <button
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showPassword}
                className="password-eye-button"
                onClick={() => setShowPassword((p) => !p)}
                type="button"
              >
                <span aria-hidden="true" />
              </button>
            </div>

            <button disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', padding: '1.5rem' }}>
      <header className="gestor-header">
        <div className="gestor-header-brand">
          {clientTheme?.logoUrl
            ? <img alt="Logo" src={clientTheme.logoUrl} style={{ height: '2rem', objectFit: 'contain', borderRadius: '0.25rem' }} />
            : <Palette size={20} />}
          <span>{clientTheme?.dsCliente ?? 'SmartGym'} — Gestor de Tema</span>
        </div>
        <div className="gestor-header-user">
          <span>{session.name}</span>
          <button className="gestor-logout-button" onClick={handleLogout} type="button">
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </header>

      <ThemeRegistration idCliente={session.idCliente} allowedCompanyIds={session.empresas.map((e) => e.id)} />
    </main>
  );
}
