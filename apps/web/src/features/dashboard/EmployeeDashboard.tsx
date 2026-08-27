'use client';

import { useEffect, useState } from 'react';
import { Activity, BadgeCheck, CalendarPlus, ClipboardCheck, CreditCard, Dumbbell, UserCheck, Users } from 'lucide-react';
import { apiFetch as fetch, apiUrl } from '../../shared/api/apiFetch';

type DashboardStats = {
  activeEnrollments: number | null;
  activeStudents: number;
  inactiveStudents: number;
  catalogPlans: number;
  /** Nulo quando o painel nao conseguiu o panorama agregado (ver loadStats). */
  checkInsToday: number | null;
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

      // Caminho feliz: /reports/overview traz tudo somado no banco, inclusive
      // os check-ins de hoje — o dado que fez o card "Check-ins hoje" ser
      // removido daqui, porque marcava zero todos os dias por nao existir rota
      // agregada nenhuma.
      const overviewRes = await fetch(`${apiUrl}/reports/overview`);
      if (overviewRes.ok) {
        const overview = (await overviewRes.json()) as {
          alunos: { ativos: number; inativos: number };
          matriculas: { vigentes: number };
          planosNoCatalogo: number;
          checkIns: { hoje: number };
        };
        setStats({
          activeEnrollments: overview.matriculas.vigentes,
          activeStudents: overview.alunos.ativos,
          inactiveStudents: overview.alunos.inativos,
          catalogPlans: overview.planosNoCatalogo,
          checkInsToday: overview.checkIns.hoje,
        });
        return;
      }

      // O panorama exige `reports.read`. Um perfil de recepcao pode nao ter —
      // e o painel de entrada nao pode ficar vazio por causa disso. Aqui ele
      // volta a contar o que qualquer perfil ja enxerga, sem os numeros que
      // dependem da agregacao.
      const [studentsRes, plansRes] = await Promise.all([
        fetch(`${apiUrl}/students`),
        fetch(`${apiUrl}/plans`),
      ]);

      const students = studentsRes.ok ? ((await studentsRes.json()) as Array<{ id: number; boInativo: boolean }>) : [];
      const plans = plansRes.ok ? ((await plansRes.json()) as Array<{ id: number; boInativo: boolean }>) : [];

      const active = students.filter((s) => s.boInativo === false).length;
      setStats({
        activeEnrollments: null,
        activeStudents: active,
        inactiveStudents: students.length - active,
        catalogPlans: plans.filter((p) => p.boInativo === false).length,
        checkInsToday: null,
      });
    } catch {
      setStats({
        activeEnrollments: null,
        activeStudents: 0,
        inactiveStudents: 0,
        catalogPlans: 0,
        checkInsToday: null,
      });
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
        <p className="section-label">Início</p>
        <h2 className="module-page-title">
          {greeting}, {firstName}!
        </h2>
      </header>

      <div className="dashboard-content">
        <section className="dashboard-stats" aria-label="Métricas">
          {/* Concordancia: com 1 registro os rotulos saiam como "1 Alunos
              ativos". O painel do aluno ja fazia isso em "dia(s) seguido(s)". */}
          <StatCard
            icon={Users}
            label={stats?.activeStudents === 1 ? 'Aluno ativo' : 'Alunos ativos'}
            loading={isLoading}
            onClick={() => onNavigate('Matrículas')}
            value={stats?.activeStudents}
          />
          {/* Era "Total de alunos" — 7 ao lado de "Alunos ativos: 6", dois cards
              para quase o mesmo numero, os dois levando para Matriculas. O dado
              que faltava era justamente o complemento; o total continua sendo a
              soma dos dois, visivel na propria tela. */}
          <StatCard
            icon={BadgeCheck}
            label={stats?.inactiveStudents === 1 ? 'Aluno inativo' : 'Alunos inativos'}
            loading={isLoading}
            onClick={() => onNavigate('Matrículas')}
            value={stats?.inactiveStudents}
          />
          {/* Era "Planos ativos", contando /plans — o catalogo da academia, nao
              as matriculas. Com 7 alunos o painel dizia "9 planos ativos" e
              contradizia o Relatorio ("Matriculas ativas: 6") a um clique dali.
              O numero esta certo, o rotulo e que mentia. */}
          <StatCard
            icon={CreditCard}
            label={stats?.catalogPlans === 1 ? 'Plano no catálogo' : 'Planos no catálogo'}
            loading={isLoading}
            onClick={() => onNavigate('Planos')}
            value={stats?.catalogPlans}
          />
          {/* A contagem de MATRICULAS vigentes que faltava aqui: nao existia
              rota agregada e buscar aluno a aluno era caro demais para a tela de
              entrada. Agora sai do /reports/overview. Some para quem nao tem
              permissao de relatorio, em vez de mostrar um numero pela metade. */}
          {stats?.activeEnrollments !== null && stats?.activeEnrollments !== undefined ? (
            <StatCard
              icon={ClipboardCheck}
              label={stats.activeEnrollments === 1 ? 'Matrícula ativa' : 'Matrículas ativas'}
              loading={isLoading}
              onClick={() => onNavigate('Matrículas')}
              value={stats.activeEnrollments}
            />
          ) : null}
          {/* O card voltou. Antes `todayCheckIns` era fixado em 0 no loadStats()
              — nao existia endpoint agregado de check-in — e o painel afirmava
              todo dia que ninguem treinou. Um KPI errado e pior que KPI nenhum,
              entao ele so aparece quando ha numero de verdade por tras. */}
          {stats?.checkInsToday !== null && stats?.checkInsToday !== undefined ? (
            <StatCard
              icon={Activity}
              label={stats.checkInsToday === 1 ? 'Check-in hoje' : 'Check-ins hoje'}
              loading={isLoading}
              value={stats.checkInsToday}
            />
          ) : null}
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
