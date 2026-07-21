'use client';

import { useState } from 'react';
import {
  ArrowRight,
  Calendar,
  CreditCard,
  Dumbbell,
  Keyboard,
  LayoutDashboard,
  Search,
  Shield,
  Users,
  X,
} from 'lucide-react';

type OnboardingWizardProps = {
  userName: string;
  userType: 'employee' | 'student';
  onComplete: () => void;
};

type Step = {
  title: string;
  description: string;
  features: Array<{ icon: typeof Users; label: string; detail: string }>;
};

const employeeSteps: Step[] = [
  {
    title: 'Bem-vindo ao SmartGym!',
    description: 'Vamos fazer um tour rápido pelas principais funcionalidades do sistema.',
    features: [
      { icon: LayoutDashboard, label: 'Painel', detail: 'Visão geral com métricas e atalhos rápidos' },
      { icon: Users, label: 'Matrículas', detail: 'Cadastre e gerencie seus alunos' },
      { icon: CreditCard, label: 'Planos', detail: 'Configure planos, valores e frequências' },
    ],
  },
  {
    title: 'Treinos e atividades',
    description: 'Monte treinos personalizados e organize as atividades da academia.',
    features: [
      { icon: Dumbbell, label: 'Exercícios e Treinos', detail: 'Cadastre exercícios e monte treinos para cada aluno' },
      { icon: Calendar, label: 'Agendas', detail: 'Crie agendas de aulas e atividades com horários' },
      { icon: Search, label: 'Montagem de Agenda', detail: 'Monte as agendas associando atividades e profissionais' },
    ],
  },
  {
    title: 'Dicas de produtividade',
    description: 'Atalhos para navegar mais rápido no sistema.',
    features: [
      { icon: Keyboard, label: 'Ctrl+K', detail: 'Busca rápida para navegar entre módulos instantaneamente' },
      { icon: Shield, label: 'Confirmações', detail: 'Ações destrutivas pedem confirmação antes de executar' },
      { icon: Search, label: 'Ordenação', detail: 'Clique nos cabeçalhos das tabelas para ordenar os dados' },
    ],
  },
];

const studentSteps: Step[] = [
  {
    title: 'Bem-vindo ao SmartGym!',
    description: 'Vamos conhecer as funcionalidades disponíveis para você.',
    features: [
      { icon: LayoutDashboard, label: 'Painel', detail: 'Seus check-ins, streak e plano ativo' },
      { icon: Dumbbell, label: 'Meu Treino', detail: 'Acesse seu treino personalizado a qualquer momento' },
      { icon: Calendar, label: 'Calendário', detail: 'Veja e inscreva-se nas atividades da academia' },
    ],
  },
  {
    title: 'Acompanhe seu progresso',
    description: 'O sistema acompanha sua frequência e evolução.',
    features: [
      { icon: CreditCard, label: 'Matrícula', detail: 'Confira seu plano, pagamentos e dados cadastrais' },
      { icon: Users, label: 'Atividades', detail: 'Veja as atividades disponíveis e inscreva-se' },
      { icon: Keyboard, label: 'Ctrl+K', detail: 'Busca rápida para navegar entre as telas' },
    ],
  },
];

const ONBOARDING_KEY = 'smartgym_onboarding_done';

export function shouldShowOnboarding(userId: number | null): boolean {
  if (!userId) return false;
  const key = `${ONBOARDING_KEY}_${userId}`;
  return localStorage.getItem(key) !== 'true';
}

export function markOnboardingDone(userId: number | null) {
  if (!userId) return;
  const key = `${ONBOARDING_KEY}_${userId}`;
  localStorage.setItem(key, 'true');
}

export function OnboardingWizard({ userName, userType, onComplete }: OnboardingWizardProps) {
  const steps = userType === 'employee' ? employeeSteps : studentSteps;
  const [currentStep, setCurrentStep] = useState(0);
  const step = steps[currentStep]!;
  const isLast = currentStep === steps.length - 1;
  const firstName = userName.split(' ')[0] ?? '';

  function handleNext() {
    if (isLast) {
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }

  function handleSkip() {
    onComplete();
  }

  return (
    <>
      <div aria-hidden="true" className="onboarding-backdrop" />
      <div aria-label="Tour de boas-vindas" aria-modal="true" className="onboarding-dialog" role="dialog">
        <button aria-label="Pular tour" className="onboarding-skip-btn" onClick={handleSkip} type="button">
          <X size={18} />
        </button>

        <div className="onboarding-progress">
          {steps.map((_, i) => (
            <div className={`onboarding-dot${i === currentStep ? ' active' : i < currentStep ? ' done' : ''}`} key={i} />
          ))}
        </div>

        <div className="onboarding-body">
          <h2 className="onboarding-title">
            {currentStep === 0 ? `${step.title.replace('!', '')}, ${firstName}!` : step.title}
          </h2>
          <p className="onboarding-description">{step.description}</p>

          <div className="onboarding-features">
            {step.features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div className="onboarding-feature" key={feature.label}>
                  <div className="onboarding-feature-icon">
                    <Icon size={18} />
                  </div>
                  <div>
                    <span className="onboarding-feature-label">{feature.label}</span>
                    <span className="onboarding-feature-detail">{feature.detail}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="onboarding-footer">
          <button className="onboarding-secondary-btn" onClick={handleSkip} type="button">
            Pular
          </button>
          <button className="onboarding-primary-btn" onClick={handleNext} type="button">
            {isLast ? 'Começar' : 'Próximo'}
            {!isLast ? <ArrowRight size={16} /> : null}
          </button>
        </div>
      </div>
    </>
  );
}
