'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { formatCpf, formatDateInput, isValidCpf } from './registration-helpers';
import type { RegisterLookupRecord } from './registration-types';
import { PlanRegistration } from './plan-registration';
import { CompanyRegistration } from './company-registration';
import { StudentRegistration } from './student-registration';
import { DomainRegistration } from './domain-registration';
import { ProductRegistration } from './product-registration';
import { ExerciseRegistration } from './exercise-registration';
import { EmployeeRegistration } from './employee-registration';
import { TrainingRegistration } from './training-registration';
import { StudentTrainingAssembly } from './student-training-assembly';
import { MyTraining } from './my-training';
import { apiFetch as fetch, apiUrl } from './api-fetch';
const SESSION_KEY = 'smartgym_session';

const menuGroups = [
  {
    title: 'EMPRESA',
    items: ['Empresas'],
  },
  {
    title: 'TREINO',
    items: ['Exercícios', 'Treino', 'Montar Treino', 'Meu Treino'],
  },
  {
    title: 'ESTOQUE',
    items: ['Produtos', 'Compras'],
  },
  {
    title: 'ALUNOS',
    items: ['Matrículas', 'Planos'],
  },
  {
    title: 'RH',
    items: ['Profissionais'],
  },
  {
    title: 'DOMÍNIOS',
    items: ['Domínios'],
  },
];

type AuthUserType = 'student' | 'employee';

type AuthenticatedUser = {
  id: number;
  idAluno: number | null;
  idFuncionario: number | null;
  name: string;
  type: AuthUserType;
};

type FacialRecognitionResponse = {
  match: boolean;
  access: 'granted' | 'denied';
  idAluno?: number | null;
  similarity?: number;
  message?: string;
};

type StoredSession = {
  user: AuthenticatedUser;
  activeItem: string;
};

let _cachedKey: CryptoKey | null = null;

async function getSessionCryptoKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;
  const passphrase = new TextEncoder().encode('smartgym-2026-secure-session-key-sols-encrypted');
  const keyBytes = await crypto.subtle.digest('SHA-256', passphrase);
  _cachedKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  return _cachedKey;
}

async function encryptSession(session: StoredSession): Promise<string> {
  const key = await getSessionCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(session));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return btoa(String.fromCharCode(...combined));
}

async function decryptSession(stored: string): Promise<StoredSession> {
  const key = await getSessionCryptoKey();
  const combined = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(decrypted)) as StoredSession;
}

async function readJsonResponse<T>(response: Response, fallbackMessage: string) {
  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 140);
    throw new Error(
      `${fallbackMessage} Resposta inesperada (${response.status}): ${preview || 'sem conteudo'}`,
    );
  }

  const data = JSON.parse(text) as T;

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
        data !== null &&
        'message' in data &&
        typeof data.message === 'string'
        ? data.message
        : fallbackMessage;
    throw new Error(message);
  }

  return data;
}

function getPasswordValidationMessage(password: string) {
  if (password.length < 6) {
    return 'A senha deve ter pelo menos 6 caracteres.';
  }

  if (password.length > 20) {
    return 'A senha deve ter no maximo 20 caracteres.';
  }

  if (/\s/.test(password)) {
    return 'A senha não pode conter espaços.';
  }

  if (!/\d/.test(password)) {
    return 'A senha deve conter pelo menos 1 numero.';
  }

  if ((password.match(/[a-zA-Z]/g) ?? []).length < 3) {
    return 'A senha deve conter pelo menos 3 letras.';
  }

  return '';
}

export default function HomePage() {
  const facialVideoRef = useRef<HTMLVideoElement | null>(null);
  const facialStreamRef = useRef<MediaStream | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [activeItem, setActiveItem] = useState('Meu Treino');
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [authUserName, setAuthUserName] = useState('Joao Silva');
  const [authUserRole, setAuthUserRole] = useState('Administrador');
  const [authUserType, setAuthUserType] = useState<AuthUserType>('employee');
  const [authUserEmployeeId, setAuthUserEmployeeId] = useState<number | null>(null);
  const [authUserStudentId, setAuthUserStudentId] = useState<number | null>(null);
  const [loginMode, setLoginMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [loginCpf, setLoginCpf] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [forgotCpf, setForgotCpf] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [registerType, setRegisterType] = useState<'student' | 'employee'>('student');
  const [registerCpf, setRegisterCpf] = useState('');
  const [registerLookup, setRegisterLookup] = useState<RegisterLookupRecord | null>(null);
  const [authFeedback, setAuthFeedback] = useState('');
  const [registerLookupFeedback, setRegisterLookupFeedback] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isSubmittingFacial, setIsSubmittingFacial] = useState(false);
  const [isLookingUpRegister, setIsLookingUpRegister] = useState(false);
  const [registerPassword, setRegisterPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [pendingFacialUser, setPendingFacialUser] = useState<AuthenticatedUser | null>(null);
  const passwordRequirements = [
    {
      label: 'Pelo menos 1 número',
      met: /\d/.test(registerPassword),
    },
    {
      label: 'Pelo menos 3 letras',
      met: (registerPassword.match(/[a-zA-Z]/g) ?? []).length >= 3,
    },
    {
      label: 'Pelo menos 6 caracteres',
      met: registerPassword.length >= 6,
    },
    {
      label: 'No máximo 20 caracteres',
      met: registerPassword.length > 0 && registerPassword.length <= 20,
    },
    {
      label: 'Sem espaços',
      met: registerPassword.length > 0 && !/\s/.test(registerPassword),
    },
  ];

  useEffect(() => {
    void (async () => {
      try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) {
          const session = await decryptSession(stored);
          const { user, activeItem: savedActiveItem } = session;
          setAuthUserName(user.name);
          setAuthUserRole(user.type === 'student' ? 'Aluno' : 'Funcionário');
          setAuthUserType(user.type);
          setAuthUserEmployeeId(user.idFuncionario);
          setAuthUserStudentId(user.idAluno);
          setActiveItem(savedActiveItem);
          setIsLoggedIn(true);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      } finally {
        setIsSessionLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    void (async () => {
      try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (!stored) return;
        const session = await decryptSession(stored);
        const encrypted = await encryptSession({ ...session, activeItem });
        localStorage.setItem(SESSION_KEY, encrypted);
      } catch { }
    })();
  }, [activeItem, isLoggedIn]);

  useEffect(() => {
    if (!pendingFacialUser) {
      return;
    }

    void startFacialCamera().catch((error) => {
      setPendingFacialUser(null);
      setAuthFeedback(
        error instanceof Error ? error.message : 'Não foi possível iniciar a câmera.',
      );
    });

    return () => {
      stopFacialCamera();
    };
  }, [pendingFacialUser?.id]);

  async function lookupRegisterCpf(type = registerType, cpfValue = registerCpf) {
    const cpf = cpfValue.replace(/\D/g, '');

    setRegisterLookup(null);
    setRegisterLookupFeedback('');

    if (!cpf) {
      return;
    }

    if (cpf.length !== 11 || !isValidCpf(cpf)) {
      setRegisterLookupFeedback('Informe um CPF válido para buscar o cadastro.');
      return;
    }

    try {
      setIsLookingUpRegister(true);
      const response = await fetch(
        `${apiUrl}/auth/register-lookup?type=${type}&cpf=${cpf}`,
      );

      if (false && !response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'CPF não encontrado.');
      }

      const data = await readJsonResponse<RegisterLookupRecord>(
        response,
        'CPF não encontrado.',
      );
      setRegisterLookup(data);
      setRegisterLookupFeedback(
        data.hasUser
          ? 'Este CPF já possui usuário cadastrado.'
          : 'Cadastro encontrado. Confira os dados e crie sua senha.',
      );
    } catch (error) {
      setRegisterLookupFeedback(
        error instanceof Error ? error.message : 'CPF não encontrado no cadastro.',
      );
    } finally {
      setIsLookingUpRegister(false);
    }
  }

  function handleChangeRegisterType(type: 'student' | 'employee') {
    setRegisterType(type);
    setRegisterLookup(null);
    setRegisterLookupFeedback('');

    if (registerCpf.replace(/\D/g, '').length === 11) {
      void lookupRegisterCpf(type, registerCpf);
    }
  }

  function stopFacialCamera() {
    facialStreamRef.current?.getTracks().forEach((track) => track.stop());
    facialStreamRef.current = null;

    if (facialVideoRef.current) {
      facialVideoRef.current.srcObject = null;
    }
  }

  async function startFacialCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Seu navegador não permite acesso à câmera.');
    }

    stopFacialCamera();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
      },
      audio: false,
    });
    facialStreamRef.current = stream;

    if (facialVideoRef.current) {
      facialVideoRef.current.srcObject = stream;
      await facialVideoRef.current.play();
    }
  }

  async function requestFacialValidation(user: AuthenticatedUser) {
    if (user.type !== 'student' || !user.idAluno) {
      completeLogin(user);
      return;
    }

    setPendingFacialUser(user);
    setAuthFeedback('Senha confirmada. Posicione o rosto na câmera para validar o acesso.');
  }

  function completeLogin(user: AuthenticatedUser) {
    const nextActiveItem = user.type === 'student' ? 'Meu Treino' : activeItem;
    stopFacialCamera();
    setPendingFacialUser(null);
    setAuthFeedback('');
    setAuthUserName(user.name);
    setAuthUserRole(user.type === 'student' ? 'Aluno' : 'Funcionário');
    setAuthUserType(user.type);
    setAuthUserEmployeeId(user.idFuncionario);
    setAuthUserStudentId(user.idAluno);
    setActiveItem(nextActiveItem);
    setIsLoggedIn(true);
    void encryptSession({ user, activeItem: nextActiveItem })
      .then((encrypted) => { localStorage.setItem(SESSION_KEY, encrypted); })
      .catch(() => { });
  }

  async function handleFacialValidation() {
    if (!pendingFacialUser || !facialVideoRef.current) {
      return;
    }

    const video = facialVideoRef.current;

    if (!video.videoWidth || !video.videoHeight) {
      setAuthFeedback('Aguarde a câmera carregar antes de validar.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      setIsSubmittingFacial(true);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.92);
      });

      if (!blob) {
        throw new Error('Não foi possível capturar a imagem da câmera.');
      }

      const formData = new FormData();
      formData.append('file', blob, 'login-facial.jpg');

      const response = await fetch(`${apiUrl}/access/facial/recognize`, {
        method: 'POST',
        body: formData,
      });

      if (false && !response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível validar a facial.');
      }

      const result = await readJsonResponse<FacialRecognitionResponse>(
        response,
        'Não foi possível validar a facial.',
      );
      const matchedSameStudent =
        result.match &&
        result.access === 'granted' &&
        result.idAluno === pendingFacialUser.idAluno;

      if (!matchedSameStudent) {
        throw new Error(result.message ?? 'Facial não confere com o usuário informado.');
      }

      completeLogin(pendingFacialUser);
    } catch (error) {
      setAuthFeedback(
        error instanceof Error ? error.message : 'Erro ao validar reconhecimento facial.',
      );
    } finally {
      setIsSubmittingFacial(false);
    }
  }

  function cancelFacialValidation() {
    stopFacialCamera();
    setPendingFacialUser(null);
    setAuthFeedback('');
  }

  function handleLogout() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch { }
    setIsLoggedIn(false);
    setAuthUserName('');
    setAuthUserRole('');
    setAuthUserEmployeeId(null);
    setAuthUserStudentId(null);
    setActiveItem('Meu Treino');
    setLoginMode('login');
    setAuthFeedback('');
    setLoginCpf('');
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthFeedback('');

    const formData = new FormData(event.currentTarget);

    try {
      setIsSubmittingAuth(true);
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          login: String(formData.get('user') ?? ''),
          password: String(formData.get('password') ?? ''),
        }),
      });
      if (false && !response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível entrar.');
      }

      const user = await readJsonResponse<AuthenticatedUser>(
        response,
        'Não foi possível entrar.',
      );
      // Validacao facial testada e mantida desativada no login web.
      // await requestFacialValidation(user);
      completeLogin(user);
      return;
      setAuthUserRole(user.type === 'student' ? 'Aluno' : 'Funcionário');
      setAuthUserType(user.type);
      setActiveItem(user.type === 'student' ? 'Meu Treino' : activeItem);
      setIsLoggedIn(true);
    } catch (error) {
      setAuthFeedback(error instanceof Error ? error.message : 'Erro ao entrar.');
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthFeedback('');
    setForgotEmail('');

    try {
      setIsSubmittingAuth(true);
      const response = await fetch(`${apiUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cpf: forgotCpf,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível enviar o email.');
      }

      const data = await readJsonResponse<{
        email: string;
        message: string;
      }>(response, 'Não foi possível enviar o email.');
      setForgotEmail(data.email);
      setAuthFeedback(data.message);
    } catch (error) {
      setAuthFeedback(
        error instanceof Error ? error.message : 'Erro ao enviar email de redefinicao.',
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthFeedback('');

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      type: registerType,
      cpf: String(formData.get('cpf') ?? ''),
      email: registerLookup?.email ?? '',
      password: String(formData.get('password') ?? ''),
    };
    const passwordMessage = getPasswordValidationMessage(payload.password);

    if (passwordMessage) {
      setAuthFeedback(passwordMessage);
      return;
    }

    if (!registerLookup || registerLookup.hasUser) {
      setRegisterLookupFeedback('Busque um CPF cadastrado e disponível antes de criar o usuário.');
      return;
    }

    try {
      setIsSubmittingAuth(true);
      const response = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível criar o cadastro.');
      }

      const loginResponse = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          login: payload.cpf,
          password: payload.password,
        }),
      });

      if (false && !loginResponse.ok) {
        const errorBody = (await loginResponse.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Cadastro criado, mas não foi possível entrar automaticamente.');
      }

      const user = await readJsonResponse<AuthenticatedUser>(
        loginResponse,
        'Cadastro criado, mas não foi possível entrar automaticamente.',
      );
      form.reset();
      setRegisterCpf('');
      setRegisterLookup(null);
      setRegisterLookupFeedback('');
      setRegisterPassword('');
      setShowRegisterPassword(false);
      setAuthFeedback('');
      // Validacao facial testada e mantida desativada no login web.
      // await requestFacialValidation(user);
      completeLogin(user);
      return;
    } catch (error) {
      setAuthFeedback(
        error instanceof Error ? error.message : 'Erro ao criar cadastro.',
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  if (isSessionLoading) {
    return null;
  }

  if (isLoggedIn) {
    const visibleMenuGroups =
      authUserType === 'employee'
        ? menuGroups
        : menuGroups
          .filter((group) => group.title === 'TREINO' || group.title === 'ALUNOS')
          .map((group) => ({
            ...group,
            items: group.items.filter((item) => item !== 'Montar Treino'),
          }));

    return (
      <main className={`home-page ${isMenuOpen ? '' : 'menu-collapsed'}`}>
        <header className="app-header">
          <div className="header-brand">
            <div className="logo" aria-hidden="true">
              SG
            </div>
            <div>
              <p className="eyebrow">SmartGym</p>
              <strong>Academia Cliente</strong>
            </div>
          </div>

          <div className="user-profile">
            <div className="user-avatar" aria-hidden="true">
              {authUserName
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((name) => name[0])
                .join('')
                .toUpperCase()}
            </div>
            <div>
              <strong>{authUserName}</strong>
              <span>{authUserRole}</span>
            </div>
            <button className="secondary-button" type="button" onClick={handleLogout}>
              Sair
            </button>
          </div>
        </header>

        <aside className="side-menu" aria-label="Menu principal">
          <button
            aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            className={`menu-hamburger ${isMenuOpen ? 'open' : ''}`}
            onClick={() => setIsMenuOpen((current) => !current)}
            title={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            type="button"
          >
            <span />
            <span />
            <span />
          </button>

          {isMenuOpen ? (
            <>
              <div className="side-menu-header">
                <p className="eyebrow">Menu</p>
                <strong>Principal</strong>
              </div>

              <nav className="menu-nav">
                {visibleMenuGroups.map((group) => (
                  <div className="menu-group" key={group.title}>
                    <p>{group.title}</p>
                    {group.items.map((item) => (
                      <button
                        className={item === activeItem ? 'active' : ''}
                        key={item}
                        onClick={() => {
                          setActiveItem(item);
                          setIsMenuOpen(false);
                        }}
                        type="button"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
            </>
          ) : null}
        </aside>

        <section className="home-content">
          {activeItem === 'Empresas' ? (
            <CompanyRegistration />
          ) : activeItem === 'Exercícios' ? (
            <ExerciseRegistration readOnly={authUserType === 'student'} />
          ) : activeItem === 'Treino' ? (
            <TrainingRegistration readOnly={authUserType === 'student'} />
          ) : activeItem === 'Montar Treino' ? (
            <StudentTrainingAssembly
              loggedEmployeeId={authUserEmployeeId}
              loggedEmployeeName={authUserName}
            />
          ) : activeItem === 'Produtos' ? (
            <ProductRegistration />
          ) : activeItem === 'Matrículas' ? (
            <StudentRegistration />
          ) : activeItem === 'Planos' ? (
            <PlanRegistration />
          ) : activeItem === 'Profissionais' ? (
            <EmployeeRegistration />
          ) : activeItem === 'Domínios' ? (
            <DomainRegistration />
          ) : activeItem === 'Meu Treino' ? (
            <MyTraining
              studentId={authUserStudentId}
              studentName={authUserName}
            />
          ) : (
            <div className="welcome">
              <p className="section-label">Menu selecionado</p>
              <h2>{activeItem}</h2>
              <p>
                Esta area vai receber o conteudo de cada modulo conforme
                avançarmos nos cadastros, movimentações e consultas.
              </p>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            SG
          </div>
          <div>
            <p className="eyebrow">SmartGym</p>
            <h1 id="login-title">
              {loginMode === 'login'
                ? 'Entrar na sua conta'
                : loginMode === 'register'
                  ? 'Criar cadastro'
                  : 'Redefinir senha'}
            </h1>
          </div>
        </div>

        <div className="login-mode-toggle" role="tablist" aria-label="Acesso">
          <button
            aria-selected={loginMode === 'login'}
            className={loginMode === 'login' ? 'active' : ''}
            onClick={() => {
              setLoginMode('login');
              setAuthFeedback('');
              setForgotEmail('');
            }}
            role="tab"
            type="button"
          >
            Entrar
          </button>
          <button
            aria-selected={loginMode === 'register'}
            className={loginMode === 'register' ? 'active' : ''}
            onClick={() => {
              setLoginMode('register');
              setAuthFeedback('');
              setForgotEmail('');
            }}
            role="tab"
            type="button"
          >
            Criar cadastro
          </button>
        </div>

        {authFeedback ? <div className="login-feedback">{authFeedback}</div> : null}

        {pendingFacialUser ? (
          <div className="login-form facial-login-panel">
            <div className="facial-camera-frame">
              <video
                aria-label="Camera para validacao facial"
                autoPlay
                muted
                playsInline
                ref={facialVideoRef}
              />
            </div>
            <button
              disabled={isSubmittingFacial}
              onClick={handleFacialValidation}
              type="button"
            >
              {isSubmittingFacial ? 'Validando...' : 'Validar facial'}
            </button>
            <button
              className="secondary-login-button"
              disabled={isSubmittingFacial}
              onClick={cancelFacialValidation}
              type="button"
            >
              Voltar
            </button>
          </div>
        ) : loginMode === 'login' ? (
          <form
            className="login-form"
            method="post"
            onSubmit={handleLogin}
          >
            <label htmlFor="user">CPF</label>
            <input
              id="user"
              name="user"
              onChange={(event) => setLoginCpf(formatCpf(event.target.value))}
              type="text"
              autoComplete="username"
              placeholder="000.000.000-00"
              value={loginCpf}
            />

            <label htmlFor="password">Senha</label>
            <div className="password-field">
              <input
                id="password"
                name="password"
                type={showLoginPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Digite sua senha"
              />
              <button
                aria-label={showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showLoginPassword}
                className="password-eye-button"
                onClick={() => setShowLoginPassword((current) => !current)}
                type="button"
              >
                <span aria-hidden="true" />
              </button>
            </div>

            <a
              className="forgot-link"
              onClick={() => {
                setLoginMode('forgot');
                setAuthFeedback('');
                setForgotEmail('');
              }}
              type="button"
            >
              Esqueci minha senha
            </a>

            <button disabled={isSubmittingAuth} type="submit">
              {isSubmittingAuth ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        ) : loginMode === 'forgot' ? (
          <form className="login-form" method="post" onSubmit={handleForgotPassword}>
            <label htmlFor="forgotCpf">CPF</label>
            <input
              id="forgotCpf"
              name="cpf"
              onChange={(event) => {
                setForgotCpf(formatCpf(event.target.value));
                setForgotEmail('');
                setAuthFeedback('');
              }}
              placeholder="000.000.000-00"
              required
              type="text"
              value={forgotCpf}
            />

            {forgotEmail ? (
              <>
                <label>Email cadastrado</label>
                <div aria-label="Email cadastrado" className="login-locked-value">
                  {forgotEmail}
                </div>
              </>
            ) : null}

            <button disabled={isSubmittingAuth} type="submit">
              {isSubmittingAuth ? 'Enviando...' : 'Enviar email de teste'}
            </button>

            <button
              className="secondary-login-button"
              onClick={() => {
                setLoginMode('login');
                setAuthFeedback('');
                setForgotEmail('');
              }}
              type="button"
            >
              Voltar para entrar
            </button>
          </form>
        ) : (
          <form className="login-form" method="post" onSubmit={handleRegister}>
            <label htmlFor="registerCpf">CPF</label>
            <input
              id="registerCpf"
              name="cpf"
              onBlur={() => void lookupRegisterCpf()}
              onChange={(event) => {
                setRegisterCpf(formatCpf(event.target.value));
                setRegisterLookup(null);
                setRegisterLookupFeedback('');
              }}
              placeholder="000.000.000-00"
              required
              type="text"
              value={registerCpf}
            />

            <div className="account-type-toggle" role="radiogroup" aria-label="Tipo de cadastro">
              <button
                aria-checked={registerType === 'student'}
                className={registerType === 'student' ? 'active' : ''}
                onClick={() => handleChangeRegisterType('student')}
                role="radio"
                type="button"
              >
                Aluno
              </button>
              <button
                aria-checked={registerType === 'employee'}
                className={registerType === 'employee' ? 'active' : ''}
                onClick={() => handleChangeRegisterType('employee')}
                role="radio"
                type="button"
              >
                Funcionário
              </button>
            </div>

            {registerLookupFeedback ? (
              <div className="login-feedback">{registerLookupFeedback}</div>
            ) : null}

            <label htmlFor="registerName">Nome</label>
            <div aria-label="Nome" className="login-locked-value" id="registerName">
              {registerLookup?.name ?? ''}
            </div>

            <label htmlFor="registerBirthDate">Data de nascimento</label>
            <div
              aria-label="Data de nascimento"
              className="login-locked-value"
              id="registerBirthDate"
            >
              {registerLookup?.birthDate ? formatDateInput(registerLookup.birthDate) : ''}
            </div>

            <div className="login-inline-fields">
              <div>
                <label htmlFor="registerDdd">DDD</label>
                <div aria-label="DDD" className="login-locked-value" id="registerDdd">
                  {registerLookup?.ddd ? String(registerLookup.ddd) : ''}
                </div>
              </div>
              <div>
                <label htmlFor="registerPhone">Telefone</label>
                <div aria-label="Telefone" className="login-locked-value" id="registerPhone">
                  {registerLookup?.phone ? String(registerLookup.phone) : ''}
                </div>
              </div>
            </div>

            <label htmlFor="registerEmail">Email</label>
            <div aria-label="Email" className="login-locked-value" id="registerEmail">
              {registerLookup?.email ?? ''}
            </div>

            <label htmlFor="registerPassword">Senha</label>
            <div className="password-field">
              <input
                id="registerPassword"
                name="password"
                autoComplete="new-password"
                maxLength={20}
                minLength={6}
                onChange={(event) => setRegisterPassword(event.target.value)}
                pattern="(?=.*\d)\S{6,20}"
                placeholder="6 a 20 caracteres, com número"
                required
                type={showRegisterPassword ? 'text' : 'password'}
                value={registerPassword}
              />
              <button
                aria-label={showRegisterPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showRegisterPassword}
                className="password-eye-button"
                onClick={() => setShowRegisterPassword((current) => !current)}
                type="button"
              >
                <span aria-hidden="true" />
              </button>
            </div>

            <div className="password-checklist" aria-label="Requisitos da senha">
              {passwordRequirements.map((requirement) => (
                <div
                  className={requirement.met ? 'met' : ''}
                  key={requirement.label}
                >
                  <span aria-hidden="true">{requirement.met ? '✓' : '•'}</span>
                  {requirement.label}
                </div>
              ))}
            </div>

            <button
              disabled={isSubmittingAuth || isLookingUpRegister || !registerLookup || registerLookup.hasUser}
              type="submit"
            >
              {isSubmittingAuth ? 'Criando...' : isLookingUpRegister ? 'Buscando...' : 'Criar cadastro'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
