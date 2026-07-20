'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCpf, formatDateInput, isImageFile, isValidCpf } from '../../shared/registration/registrationHelpers';
import type { RegisterLookupRecord } from '../../shared/registration/registrationTypes';
import { PlanRegistration } from '../../features/plans/PlanRegistration';
import { StudentPlansView } from '../../features/plans/StudentPlansView';
import { CompanyRegistration } from '../../features/companies/CompanyRegistration';
import { CompanyCalendarView } from '../../features/companies/CompanyCalendarView';
import { ThemeRegistration } from '../../features/companies/ThemeRegistration';
import { ClientRegistration } from '../../features/clients/ClientRegistration';
import { StudentRegistration } from '../../features/students/StudentRegistration';
import { DomainRegistration } from '../../features/domains/DomainRegistration';
import { ProductRegistration } from '../../features/products/ProductRegistration';
import { PromotionRegistration } from '../../features/promotions/PromotionRegistration';
import { StudentPromotionsView } from '../../features/promotions/StudentPromotionsView';
import { ExerciseRegistration } from '../../features/exercises/ExerciseRegistration';
import { StudentExercisesView } from '../../features/exercises/StudentExercisesView';
import { StudentTrainingsView } from '../../features/trainings/StudentTrainingsView';
import { ActivityRegistration } from '../../features/activities/ActivityRegistration';
import { ScheduleRegistration } from '../../features/activities/ScheduleRegistration';
import { AgendaView } from '../../features/activities/AgendaView';
import { ActivityScheduleAssembly } from '../../features/activities/ActivityScheduleAssembly';
import { StudentActivitiesView } from '../../features/activities/StudentActivitiesView';
import { EmployeeRegistration } from '../../features/employees/EmployeeRegistration';
import { TrainingRegistration } from '../../features/trainings/TrainingRegistration';
import { EquipmentRegistration } from '../../features/equipment/EquipmentRegistration';
import { LocalityRegistration } from '../../features/localities/LocalityRegistration';
import { PointsRegistration } from '../../features/points/PointsRegistration';
import { StudentTrainingAssembly } from '../../features/students/StudentTrainingAssembly';
import { StudentMembershipView } from '../../features/students/StudentMembershipView';
import { StudentCalendarView } from '../../features/students/StudentCalendarView';
import { MyTraining } from '../../features/trainings/MyTraining';
import { apiFetch as fetch, apiUrl } from '../../shared/api/apiFetch';
import {
  SESSION_KEY,
  SESSION_MAX_AGE_MS,
  encryptSession,
  decryptSession,
  readJsonResponse,
} from '../../shared/auth/sessionUtils';
import type { AuthenticatedUser, AuthUserType } from '../../shared/auth/sessionUtils';
import {
  Activity,
  BadgeCheck,
  Briefcase,
  Building2,
  Calendar,
  CalendarPlus,
  CalendarRange,
  ClipboardList,
  CreditCard,
  Dumbbell,
  FilePlus,
  Globe,
  MapPin,
  Moon,
  Package,
  Palette,
  ShoppingCart,
  Star,
  Sun,
  Tag,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const menuItemIcons: Record<string, LucideIcon> = {
  'Clientes': Briefcase,
  'Empresas': Building2,
  'Tema': Palette,
  'Atividades': Activity,
  'Agendas': Calendar,
  'Exercícios': Dumbbell,
  'Treino': ClipboardList,
  'Montar Treino': FilePlus,
  'Montagem de Agenda': CalendarPlus,
  'Meu Treino': UserCheck,
  'Calendário': Calendar,
  'Calendário Empresa': CalendarRange,
  'Produtos': Package,
  'Compras': ShoppingCart,
  'Matrículas': BadgeCheck,
  'Planos': CreditCard,
  'Promoções': Tag,
  'Profissionais': Users,
  'Domínios': Globe,
  'Equipamentos': Wrench,
  'Localidades': MapPin,
  'Pontuações': Star,
};

const menuGroups = [
  {
    title: 'EMPRESA',
    items: ['Clientes', 'Empresas'],
  },
  {
    title: 'ATIVIDADE',
    items: ['Atividades', 'Agendas', 'Montagem de Agenda', 'Calendário', 'Calendário Empresa'],
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
    title: 'EQUIPAMENTOS',
    items: ['Equipamentos', 'Localidades'],
  },
  {
    title: 'ALUNOS',
    items: ['Matrículas', 'Planos', 'Promoções', 'Pontuações'],
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

function getMenuItemLabel(item: string, userType: AuthUserType) {
  if (item === 'Matrículas' && userType === 'student') return 'Matrícula';
  return item;
}

const THEME_CACHE_KEY = 'smartgym_theme_cache';
const DARK_MODE_KEY = 'smartgym_dark_mode';

type CompanyTheme = {
  idCliente: number;
  dsCliente: string;
  corPrimaria: string;
  corSecundaria: string;
  corAcentuacao: string;
  corTexto: string;
  corFundo: string;
  fontePrincipal: string;
  tamanhoBase: number;
  boModoEscuro: boolean;
  logoUrl: string | null;
  faviconUrl: string | null;
};

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

function applyCompanyTheme(theme: CompanyTheme) {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', theme.corPrimaria);
  root.style.setProperty('--color-text', theme.corTexto);
  root.style.setProperty('--color-bg', theme.corFundo);

  const hex = theme.corPrimaria.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const darken = (c: number) => Math.max(0, Math.round(c * 0.82)).toString(16).padStart(2, '0');
  root.style.setProperty('--color-primary-dark', `#${darken(r)}${darken(g)}${darken(b)}`);
  root.style.setProperty('--color-primary-bg', lightenColor(theme.corPrimaria));

  if (theme.corSecundaria) {
    root.style.setProperty('--color-secondary', theme.corSecundaria);
    root.style.setProperty('--color-secondary-bg', lightenColor(theme.corSecundaria));
  }
  if (theme.corAcentuacao) {
    root.style.setProperty('--color-accent', theme.corAcentuacao);
    root.style.setProperty('--color-accent-bg', lightenColor(theme.corAcentuacao));
  }

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

type FacialRecognitionResponse = {
  match: boolean;
  access: 'granted' | 'denied';
  idAluno?: number | null;
  similarity?: number;
  message?: string;
};

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
  const [authUserPhotoUrl, setAuthUserPhotoUrl] = useState<string | null>(null);
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
  const [companyTheme, setCompanyTheme] = useState<CompanyTheme | null>(null);
  const [themePhase, setThemePhase] = useState<'fetching' | 'applying' | null>('fetching');
  const [isDarkMode, setIsDarkMode] = useState(false);

  const themeFingerprint = useMemo(() => {
    if (!companyTheme) return '';
    const { logoUrl, faviconUrl, ...core } = companyTheme;
    return JSON.stringify(core);
  }, [companyTheme]);

  useEffect(() => {
    if (!companyTheme) return;
    const { logoUrl, faviconUrl, ...core } = companyTheme;
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(core));
  }, [themeFingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeItem]);

  useEffect(() => {
    if (localStorage.getItem(DARK_MODE_KEY) === '1') {
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
    }
  }, []);

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
          const { user, activeItem: savedActiveItem, cachedAt } = session;
          if (cachedAt && Date.now() - cachedAt > SESSION_MAX_AGE_MS) {
            localStorage.removeItem(SESSION_KEY);
          } else {
            const verifyResponse = await fetch(`${apiUrl}/auth/verify?id=${user.id}`);
            if (!verifyResponse.ok) {
              localStorage.removeItem(SESSION_KEY);
            } else {
              setAuthUserName(user.name);
              setAuthUserRole(user.type === 'student' ? 'Aluno' : 'Funcionário');
              setAuthUserType(user.type);
              setAuthUserEmployeeId(user.idFuncionario);
              setAuthUserStudentId(user.idAluno);
              setActiveItem(
                user.type === 'employee' && savedActiveItem === 'Meu Treino'
                  ? 'Matrículas'
                  : savedActiveItem,
              );
              setIsLoggedIn(true);
            }
          }
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
    try {
      const cached = localStorage.getItem(THEME_CACHE_KEY);
      if (cached) {
        const core = JSON.parse(cached) as Omit<CompanyTheme, 'logoUrl' | 'faviconUrl'>;
        const theme = { ...core, logoUrl: null, faviconUrl: null };
        setCompanyTheme(theme);
        applyCompanyTheme(theme);
        setThemePhase(null);
      }
    } catch {}

    const hostname = window.location.hostname;
    void fetch(`${apiUrl}/auth/theme?url=${encodeURIComponent(hostname)}`)
      .then(async (res) => {
        if (res.status === 204 || !res.ok) return;
        const theme = await res.json() as CompanyTheme;
        setCompanyTheme(theme);
        applyCompanyTheme(theme);
        setThemePhase(null);
      })
      .catch(() => {})
      .finally(() => { setThemePhase((p) => p === 'fetching' ? null : p); });
  }, []);

  useEffect(() => {
    if (authUserType !== 'student' || !authUserStudentId) {
      setAuthUserPhotoUrl(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const filesResponse = await fetch(`${apiUrl}/students/${authUserStudentId}/files`);
        if (!filesResponse.ok) return;
        const files = (await filesResponse.json()) as Array<{ id: number; anCaminho: string }>;
        const photoFile = files.find((file) => isImageFile(file.anCaminho));
        if (!photoFile) return;

        const urlResponse = await fetch(`${apiUrl}/students/${authUserStudentId}/files/${photoFile.id}/url`);
        if (!urlResponse.ok) return;
        const data = (await urlResponse.json()) as { url: string };
        if (!cancelled) setAuthUserPhotoUrl(data.url);
      } catch {
        if (!cancelled) setAuthUserPhotoUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserType, authUserStudentId]);

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
    const nextActiveItem =
      user.type === 'student'
        ? 'Meu Treino'
        : activeItem === 'Meu Treino'
          ? 'Matrículas'
          : activeItem;
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
    void encryptSession({ user, activeItem: nextActiveItem, cachedAt: Date.now() })
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

  function toggleDarkMode() {
    const next = !isDarkMode;
    setIsDarkMode(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem(DARK_MODE_KEY, '1');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.removeItem(DARK_MODE_KEY);
    }
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

  if (themePhase && !isLoggedIn) {
    return (
      <main className="login-page">
        <p className="text-text/50 text-sm">
          {themePhase === 'applying' ? 'Aplicando configurações...' : 'Buscando configurações...'}
        </p>
      </main>
    );
  }

  if (isLoggedIn) {
    const visibleMenuGroups =
      authUserType === 'employee'
        ? menuGroups.map((group) => ({
            ...group,
            items: group.items.filter((item) => item !== 'Meu Treino'),
          }))
        : menuGroups
          .filter((group) => group.title === 'TREINO' || group.title === 'ALUNOS' || group.title === 'ATIVIDADE')
          .map((group) => ({
            ...group,
            items: group.items.filter((item) => item !== 'Montar Treino' && item !== 'Montagem de Agenda' && item !== 'Calendário Empresa' && item !== 'Treino'),
          }));

    const activeGroup = menuGroups.find((g) => g.items.includes(activeItem))?.title ?? '';

    return (
      <main className={`home-page ${isMenuOpen ? '' : 'menu-collapsed'}`}>
        <header className="app-header">
          <div className="header-brand">
            <button
              aria-label="Abrir menu"
              className="mobile-menu-trigger menu-hamburger"
              onClick={() => setIsMenuOpen(true)}
              type="button"
            >
              <span />
              <span />
              <span />
            </button>
            <div className="logo" aria-hidden="true">
              {companyTheme?.logoUrl
                ? <img alt="Logo" src={companyTheme.logoUrl} className="h-full w-full object-contain" />
                : 'SG'}
            </div>
            <div>
              <p className="eyebrow">{activeGroup}</p>
              <strong>{getMenuItemLabel(activeItem, authUserType).toUpperCase()}</strong>
            </div>
          </div>

          <div className="user-profile">
            {authUserType === 'student' ? (
              <button
                aria-label="Ir para matrícula"
                className="user-avatar user-avatar-button"
                onClick={() => setActiveItem('Matrículas')}
                type="button"
              >
                {authUserPhotoUrl ? (
                  <img alt="" className="user-avatar-photo" src={authUserPhotoUrl} />
                ) : (
                  authUserName
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((name) => name[0])
                    .join('')
                    .toUpperCase()
                )}
              </button>
            ) : (
              <div className="user-avatar" aria-hidden="true">
                {authUserName
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((name) => name[0])
                  .join('')
                  .toUpperCase()}
              </div>
            )}
            <div>
              <strong>{authUserName}</strong>
              <span>{authUserRole}</span>
            </div>
            {companyTheme?.boModoEscuro === true && (
              <button
                aria-label={isDarkMode ? 'Modo claro' : 'Modo escuro'}
                aria-pressed={isDarkMode}
                className="dark-mode-toggle"
                onClick={toggleDarkMode}
                type="button"
              >
                {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            )}
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

          <nav className="menu-nav-collapsed" aria-label="Menu compacto" aria-hidden={isMenuOpen}>
            {visibleMenuGroups.flatMap((group) =>
              group.items.map((item) => {
                const Icon = menuItemIcons[item];
                return (
                  <button
                    className={item === activeItem ? 'active' : ''}
                    key={item}
                    onClick={() => setActiveItem(item)}
                    title={getMenuItemLabel(item, authUserType)}
                    type="button"
                  >
                    {Icon ? <Icon size={20} /> : item.slice(0, 2).toUpperCase()}
                  </button>
                );
              })
            )}
          </nav>

          <div className="side-menu-content" aria-hidden={!isMenuOpen}>
            <div className="side-menu-header">
              <p className="eyebrow">Menu</p>
              <strong>Principal</strong>
            </div>

            <nav className="menu-nav">
              {visibleMenuGroups.map((group) => (
                <div className="menu-group" key={group.title}>
                  <p>{group.title}</p>
                  {group.items.map((item) => {
                    const Icon = menuItemIcons[item];
                    return (
                      <button
                        className={item === activeItem ? 'active' : ''}
                        key={item}
                        onClick={() => {
                          setActiveItem(item);
                          setIsMenuOpen(false);
                        }}
                        tabIndex={isMenuOpen ? 0 : -1}
                        type="button"
                      >
                        {Icon && <Icon size={16} />}
                        {getMenuItemLabel(item, authUserType)}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <section className="home-content">
          {activeItem === 'Clientes' ? (
            <ClientRegistration />
          ) : activeItem === 'Empresas' ? (
            <CompanyRegistration />
          ) : activeItem === 'Tema' ? (
            <ThemeRegistration />
          ) : activeItem === 'Atividades' ? (
            authUserType === 'student' ? (
              <StudentActivitiesView
                studentId={authUserStudentId}
                studentName={authUserName}
              />
            ) : (
              <ActivityRegistration />
            )
          ) : activeItem === 'Agendas' ? (
            <AgendaView
              userType={authUserType === 'student' ? 'student' : 'employee'}
              studentId={authUserStudentId}
              studentName={authUserName}
            />
          ) : activeItem === 'Exercícios' ? (
            authUserType === 'student' ? <StudentExercisesView /> : <ExerciseRegistration />
          ) : activeItem === 'Treino' ? (
            authUserType === 'student' ? <StudentTrainingsView /> : <TrainingRegistration />
          ) : activeItem === 'Montar Treino' ? (
            <StudentTrainingAssembly
              loggedEmployeeId={authUserEmployeeId}
              loggedEmployeeName={authUserName}
            />
          ) : activeItem === 'Montagem de Agenda' ? (
            <ActivityScheduleAssembly />
          ) : activeItem === 'Produtos' ? (
            <ProductRegistration />
          ) : activeItem === 'Compras' ? (
            <div>
              <header className="module-page-header">
                <p className="section-label">Estoque</p>
                <h2 className="module-page-title">COMPRAS</h2>
              </header>
            </div>
          ) : activeItem === 'Matrículas' ? (
            authUserType === 'student' ? (
              <StudentMembershipView
                studentId={authUserStudentId}
                studentName={authUserName}
              />
            ) : (
              <StudentRegistration />
            )
          ) : activeItem === 'Planos' ? (
            authUserType === 'student' ? (
              <StudentPlansView
                studentId={authUserStudentId}
                studentName={authUserName}
              />
            ) : (
              <PlanRegistration />
            )
          ) : activeItem === 'Promoções' ? (
            authUserType === 'student' ? (
              <StudentPromotionsView studentName={authUserName} />
            ) : (
              <PromotionRegistration />
            )
          ) : activeItem === 'Profissionais' ? (
            <EmployeeRegistration />
          ) : activeItem === 'Equipamentos' ? (
            <EquipmentRegistration readOnly={authUserType === 'student'} />
          ) : activeItem === 'Localidades' ? (
            <LocalityRegistration readOnly={authUserType === 'student'} />
          ) : activeItem === 'Domínios' ? (
            <DomainRegistration />
          ) : activeItem === 'Pontuações' ? (
            <PointsRegistration />
          ) : activeItem === 'Meu Treino' ? (
            <MyTraining
              studentId={authUserStudentId}
              studentName={authUserName}
            />
          ) : activeItem === 'Calendário' ? (
            authUserType === 'student' ? (
              <StudentCalendarView
                studentId={authUserStudentId}
                studentName={authUserName}
              />
            ) : (
              <StudentCalendarView
                employeeId={authUserEmployeeId}
                employeeName={authUserName}
              />
            )
          ) : activeItem === 'Calendário Empresa' ? (
            <CompanyCalendarView userName={authUserName} />
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
            {companyTheme?.logoUrl
              ? <img alt="Logo" src={companyTheme.logoUrl} className="h-full w-full object-contain" />
              : 'SG'}
          </div>
          <div>
            <p className="eyebrow">{companyTheme?.dsCliente ?? 'SmartGym'}</p>
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
