'use client';

import { useEffect, useState } from 'react';
import { Calendar, CreditCard, Dumbbell, Flame, Trophy, Zap } from 'lucide-react';
import { apiFetch as fetch, apiUrl } from '../../shared/api/apiFetch';

type StudentDashboardProps = {
  studentId: number | null;
  studentName: string;
  onNavigate: (menuItem: string) => void;
};

type StudentPlan = {
  id: number;
  boInativo: boolean;
  plano?: { dsPlano?: string } | null;
};

type CheckIn = {
  id: number;
  dtCadastro: string;
};

type DashboardData = {
  activePlan: string | null;
  totalCheckIns: number;
  streak: number;
  monthCheckIns: number;
};

function calculateStreak(checkIns: CheckIn[]): number {
  if (checkIns.length === 0) return 0;

  const uniqueDays = new Set(
    checkIns.map((ci) => {
      const d = new Date(ci.dtCadastro);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  );

  const sortedDays = Array.from(uniqueDays)
    .map((key) => {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y!, m!, d!);
    })
    .sort((a, b) => b.getTime() - a.getTime());

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const first = sortedDays[0]!;
  first.setHours(0, 0, 0, 0);
  if (first.getTime() !== today.getTime() && first.getTime() !== yesterday.getTime()) return 0;

  let streak = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = sortedDays[i - 1]!;
    const curr = sortedDays[i]!;
    const diff = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
    if (Math.round(diff) === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function StudentDashboard({ studentId, studentName, onNavigate }: StudentDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    void loadData(studentId);
  }, [studentId]);

  async function loadData(id: number) {
    try {
      setIsLoading(true);
      const [plansRes, checkInsRes] = await Promise.all([
        fetch(`${apiUrl}/students/${id}/children/plans`),
        fetch(`${apiUrl}/students/${id}/children/check-ins`),
      ]);

      const plans = plansRes.ok ? ((await plansRes.json()) as StudentPlan[]) : [];
      const checkIns = checkInsRes.ok ? ((await checkInsRes.json()) as CheckIn[]) : [];

      const activePlan = plans.find((p) => p.boInativo === false);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthCheckIns = checkIns.filter((ci) => new Date(ci.dtCadastro) >= monthStart).length;

      setData({
        activePlan: activePlan?.plano?.dsPlano ?? null,
        totalCheckIns: checkIns.length,
        streak: calculateStreak(checkIns),
        monthCheckIns,
      });
    } catch {
      setData({ activePlan: null, totalCheckIns: 0, streak: 0, monthCheckIns: 0 });
    } finally {
      setIsLoading(false);
    }
  }

  const firstName = studentName.split(' ')[0] ?? '';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Painel</p>
        <h2 className="module-page-title">
          {greeting}, {firstName}!
        </h2>
      </header>

      <div className="dashboard-content">
        <section className="dashboard-stats" aria-label="Seus números">
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-icon" style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
              <CreditCard size={20} />
            </div>
            <div className="dashboard-stat-info">
              <span className="dashboard-stat-value" style={{ fontSize: '1rem' }}>
                {isLoading ? '–' : data?.activePlan ?? 'Nenhum'}
              </span>
              <span className="dashboard-stat-label">Plano ativo</span>
            </div>
          </div>

          <div className="dashboard-stat-card">
            <div className="dashboard-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
              <Flame size={20} />
            </div>
            <div className="dashboard-stat-info">
              <span className="dashboard-stat-value">
                {isLoading ? '–' : data?.streak ?? 0}
              </span>
              <span className="dashboard-stat-label">
                {(data?.streak ?? 0) === 1 ? 'dia seguido' : 'dias seguidos'}
              </span>
            </div>
          </div>

          <div className="dashboard-stat-card">
            <div className="dashboard-stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}>
              <Calendar size={20} />
            </div>
            <div className="dashboard-stat-info">
              <span className="dashboard-stat-value">
                {isLoading ? '–' : data?.monthCheckIns ?? 0}
              </span>
              <span className="dashboard-stat-label">Check-ins este mês</span>
            </div>
          </div>

          <div className="dashboard-stat-card">
            <div className="dashboard-stat-icon" style={{ background: '#fce7f3', color: '#db2777' }}>
              <Trophy size={20} />
            </div>
            <div className="dashboard-stat-info">
              <span className="dashboard-stat-value">
                {isLoading ? '–' : data?.totalCheckIns ?? 0}
              </span>
              <span className="dashboard-stat-label">Check-ins total</span>
            </div>
          </div>
        </section>

        {!isLoading && (data?.streak ?? 0) > 0 ? (
          <div className="dashboard-streak-banner">
            <Zap size={18} />
            <span>
              {data!.streak >= 7
                ? `Incrível! ${data!.streak} dias seguidos na academia!`
                : data!.streak >= 3
                  ? `Ótimo ritmo! ${data!.streak} dias seguidos!`
                  : `Bom começo! ${data!.streak} dia${data!.streak > 1 ? 's' : ''} seguido${data!.streak > 1 ? 's' : ''}!`}
            </span>
          </div>
        ) : null}

        <section className="dashboard-quick-actions" aria-label="Ações rápidas">
          <h3 className="dashboard-section-title">Acesso rápido</h3>
          <div className="dashboard-actions-grid">
            <button className="dashboard-action-card" onClick={() => onNavigate('Meu Treino')} type="button">
              <div className="dashboard-action-icon" style={{ background: 'var(--color-primary)' }}>
                <Dumbbell size={18} />
              </div>
              <span>Meu treino</span>
            </button>
            <button className="dashboard-action-card" onClick={() => onNavigate('Calendário')} type="button">
              <div className="dashboard-action-icon" style={{ background: '#2563eb' }}>
                <Calendar size={18} />
              </div>
              <span>Calendário</span>
            </button>
            <button className="dashboard-action-card" onClick={() => onNavigate('Atividades')} type="button">
              <div className="dashboard-action-icon" style={{ background: '#7c3aed' }}>
                <Zap size={18} />
              </div>
              <span>Atividades</span>
            </button>
            <button className="dashboard-action-card" onClick={() => onNavigate('Matrícula')} type="button">
              <div className="dashboard-action-icon" style={{ background: '#059669' }}>
                <CreditCard size={18} />
              </div>
              <span>Matrícula</span>
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
