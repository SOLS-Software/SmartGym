'use client';

import { useEffect, useState } from 'react';
import { Activity, BadgeCheck, CalendarPlus, CreditCard, Dumbbell, TrendingUp, UserCheck, Users } from 'lucide-react';
import { apiFetch as fetch, apiUrl } from '../../shared/api/apiFetch';

type DashboardStats = {
  totalStudents: number;
  activeStudents: number;
  todayCheckIns: number;
  activePlans: number;
};

type QuickAction = {
  label: string;
  menuItem: string;
  icon: typeof Users;
  color: string;
};

const quickActions: QuickAction[] = [
  { label: 'Novo aluno', menuItem: 'Matrículas', icon: Users, color: 'var(--color-primary)' },
  { label: 'Montar treino', menuItem: 'Montar Treino', icon: Dumbbell, color: '#7c3aed' },
  { label: 'Montar agenda', menuItem: 'Montagem de Agenda', icon: CalendarPlus, color: '#2563eb' },
  { label: 'Ver atividades', menuItem: 'Atividades', icon: Activity, color: '#059669' },
];

type EmployeeDashboardProps = {
  employeeName: string;
  onNavigate: (menuItem: string) => void;
};

export function EmployeeDashboard({ employeeName, onNavigate }: EmployeeDashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadStats();
  }, []);

  async function loadStats() {
    try {
      setIsLoading(true);
      const [studentsRes, plansRes] = await Promise.all([
        fetch(`${apiUrl}/students`),
        fetch(`${apiUrl}/plans`),
      ]);

      const students = studentsRes.ok ? ((await studentsRes.json()) as Array<{ id: number; boInativo: boolean }>) : [];
      const plans = plansRes.ok ? ((await plansRes.json()) as Array<{ id: number; boInativo: boolean }>) : [];

      setStats({
        totalStudents: students.length,
        activeStudents: students.filter((s) => s.boInativo === false).length,
        todayCheckIns: 0,
        activePlans: plans.filter((p) => p.boInativo === false).length,
      });
    } catch {
      setStats({ totalStudents: 0, activeStudents: 0, todayCheckIns: 0, activePlans: 0 });
    } finally {
      setIsLoading(false);
    }
  }

  const firstName = employeeName.split(' ')[0] ?? '';
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
        <section className="dashboard-stats" aria-label="Métricas">
          <StatCard
            icon={Users}
            label="Alunos ativos"
            loading={isLoading}
            onClick={() => onNavigate('Matrículas')}
            value={stats?.activeStudents}
          />
          <StatCard
            icon={BadgeCheck}
            label="Total de alunos"
            loading={isLoading}
            onClick={() => onNavigate('Matrículas')}
            value={stats?.totalStudents}
          />
          <StatCard
            icon={CreditCard}
            label="Planos ativos"
            loading={isLoading}
            onClick={() => onNavigate('Planos')}
            value={stats?.activePlans}
          />
          <StatCard
            icon={TrendingUp}
            label="Check-ins hoje"
            loading={isLoading}
            value={stats?.todayCheckIns}
          />
        </section>

        <section className="dashboard-quick-actions" aria-label="Ações rápidas">
          <h3 className="dashboard-section-title">Ações rápidas</h3>
          <div className="dashboard-actions-grid">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  className="dashboard-action-card"
                  key={action.menuItem}
                  onClick={() => onNavigate(action.menuItem)}
                  type="button"
                >
                  <div className="dashboard-action-icon" style={{ background: action.color }}>
                    <Icon size={18} />
                  </div>
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="dashboard-tip" aria-label="Dica">
          <UserCheck className="dashboard-tip-icon" size={18} />
          <p>
            <strong>Dica:</strong> Use <kbd>Ctrl+K</kbd> para navegar rapidamente entre os módulos.
          </p>
        </section>
      </div>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  onClick,
}: {
  icon: typeof Users;
  label: string;
  value?: number;
  loading: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`dashboard-stat-card${onClick ? ' clickable' : ''}`}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      <div className="dashboard-stat-icon">
        <Icon size={20} />
      </div>
      <div className="dashboard-stat-info">
        <span className="dashboard-stat-value">
          {loading ? '–' : (value ?? 0)}
        </span>
        <span className="dashboard-stat-label">{label}</span>
      </div>
    </Tag>
  );
}
