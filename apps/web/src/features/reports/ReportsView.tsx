'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, PieChart, TrendingUp, Users } from 'lucide-react';
import { apiFetch as fetch, apiUrl } from '../../shared/api/apiFetch';

type Student = {
  id: number;
  nmAluno: string;
  boInativo: boolean;
  dtCadastro: string;
};

type StudentPlan = {
  id: number;
  idAluno: number;
  boInativo: boolean;
  plano?: { id: number; dsPlano?: string } | null;
};

type CheckIn = {
  id: number;
  dtCadastro: string;
};

type PlanRecord = {
  id: number;
  dsPlano: string;
  boInativo: boolean;
};

type ReportData = {
  students: Student[];
  plans: PlanRecord[];
  allStudentPlans: StudentPlan[];
  allCheckIns: CheckIn[];
  /** Quantos alunos ativos entraram na amostra de check-ins/planos. */
  sampledStudents: number;
  /** Total de alunos ativos — se for maior que a amostra, o relatorio avisa. */
  totalActiveStudents: number;
};

function getWeekLabel(date: Date): string {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay() + 1);
  return `${start.getDate().toString().padStart(2, '0')}/${(start.getMonth() + 1).toString().padStart(2, '0')}`;
}

function getLast12Weeks(): { label: string; start: Date; end: Date }[] {
  const weeks: { label: string; start: Date; end: Date }[] = [];
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  for (let i = 11; i >= 0; i--) {
    const end = new Date(today);
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    weeks.push({ label: getWeekLabel(start), start, end });
  }
  return weeks;
}

function getLast6Months(): { label: string; start: Date; end: Date }[] {
  const months: { label: string; start: Date; end: Date }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const label = start.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    months.push({ label, start, end });
  }
  return months;
}

type BarChartProps = {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
};

function BarChartCanvas({ data, color = '#1f7a53', height = 200 }: BarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 20, right: 10, bottom: 36, left: 36 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    const max = Math.max(...data.map((d) => d.value), 1);
    const barWidth = Math.min(chartW / data.length - 4, 32);
    const gap = (chartW - barWidth * data.length) / (data.length + 1);

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#a0b0a8' : '#6b7a72';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      const val = Math.round(max - (max / gridLines) * i);
      ctx.fillStyle = textColor;
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(val), padding.left - 6, y + 3);
    }

    data.forEach((d, i) => {
      const x = padding.left + gap + i * (barWidth + gap);
      const barH = (d.value / max) * chartH;
      const y = padding.top + chartH - barH;

      const radius = Math.min(4, barWidth / 2);
      ctx.beginPath();
      ctx.moveTo(x, y + radius);
      ctx.arcTo(x, y, x + radius, y, radius);
      ctx.arcTo(x + barWidth, y, x + barWidth, y + radius, radius);
      ctx.lineTo(x + barWidth, padding.top + chartH);
      ctx.lineTo(x, padding.top + chartH);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (d.value > 0) {
        ctx.fillStyle = isDark ? '#e0e8e4' : '#17211c';
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(d.value), x + barWidth / 2, y - 5);
      }

      ctx.fillStyle = textColor;
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, x + barWidth / 2, h - padding.bottom + 14);
    });
  }, [data, color, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${height}px`, display: 'block' }}
    />
  );
}

type DonutChartProps = {
  data: { label: string; value: number; color: string }[];
  size?: number;
};

function DonutChartCanvas({ data, size = 180 }: DonutChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 8;
    const innerRadius = radius * 0.6;
    const total = data.reduce((sum, d) => sum + d.value, 0);

    ctx.clearRect(0, 0, size, size);

    if (total === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2, true);
      ctx.fillStyle = document.documentElement.classList.contains('dark')
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(0,0,0,0.06)';
      ctx.fill();
      return;
    }

    let currentAngle = -Math.PI / 2;
    data.forEach((d) => {
      const sliceAngle = (d.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, currentAngle, currentAngle + sliceAngle);
      ctx.arc(cx, cy, innerRadius, currentAngle + sliceAngle, currentAngle, true);
      ctx.closePath();
      ctx.fillStyle = d.color;
      ctx.fill();
      currentAngle += sliceAngle;
    });

    const isDark = document.documentElement.classList.contains('dark');
    ctx.fillStyle = isDark ? '#e0e8e4' : '#17211c';
    ctx.font = 'bold 24px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(total), cx, cy - 6);
    ctx.fillStyle = isDark ? '#a0b0a8' : '#6b7a72';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText('total', cx, cy + 12);
  }, [data, size]);

  return <canvas ref={canvasRef} style={{ width: `${size}px`, height: `${size}px` }} />;
}

const PLAN_COLORS = ['#1f7a53', '#2563eb', '#7c3aed', '#d97706', '#db2777', '#059669', '#dc2626', '#6366f1'];

type TimeWindow = { label: string; start: Date; end: Date };

/**
 * Conta quantos itens caem em cada janela de tempo em UMA passada.
 *
 * As janelas (semanas/meses) sao contiguas e ordenadas, entao basta localizar
 * por busca binaria a que contem cada ponto — O(N log W) em vez do O(N*W) de
 * varrer a colecao inteira por bucket. Cada registro tem a data convertida uma
 * unica vez, o que era a maior fonte de lixo do render (12N+6N objetos Date).
 *
 * Funcao pura em escopo de modulo: nao depende de nada do componente e nao
 * precisa ser recriada a cada recalculo do memo.
 */
function bucketize<T>(items: T[], getDate: (item: T) => string, windows: TimeWindow[]) {
  const counts = new Array<number>(windows.length).fill(0);

  for (const item of items) {
    const time = new Date(getDate(item)).getTime();
    if (Number.isNaN(time)) continue;

    let low = 0;
    let high = windows.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const window = windows[mid]!;
      if (time < window.start.getTime()) high = mid - 1;
      else if (time > window.end.getTime()) low = mid + 1;
      else {
        counts[mid] = (counts[mid] ?? 0) + 1;
        break;
      }
    }
  }

  return windows.map((window, index) => ({ label: window.label, value: counts[index] ?? 0 }));
}

export function ReportsView() {
  const [data, setData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [checkInView, setCheckInView] = useState<'weekly' | 'monthly'>('weekly');

  useEffect(() => {
    void loadData();
  }, []);

  // Quantos alunos o relatorio agrega por vez. O codigo anterior usava
  // `.slice(0, 50)` fixo e SEM avisar: uma academia com 500 alunos via um
  // relatorio construido sobre 10% da base, apresentado como se fosse o total.
  // Aqui o teto continua existindo (protege o browser), mas e explicito e a UI
  // informa quando a amostra e parcial.
  const REPORT_STUDENT_LIMIT = 120;
  const FETCH_CONCURRENCY = 6;

  async function loadData() {
    try {
      setIsLoading(true);
      const [studentsRes, plansRes] = await Promise.all([
        fetch(`${apiUrl}/students`),
        fetch(`${apiUrl}/plans`),
      ]);

      const students: Student[] = studentsRes.ok ? await studentsRes.json() : [];
      const plans: PlanRecord[] = plansRes.ok ? await plansRes.json() : [];

      const activeStudents = students.filter((s) => !s.boInativo);
      const sampled = activeStudents.slice(0, REPORT_STUDENT_LIMIT);

      // Antes: 50 fetches de check-ins + 50 de planos disparados de uma vez
      // (100 requisicoes simultaneas). O browser so abre ~6 conexoes por host,
      // entao as 100 viravam ~17 ondas serializadas — e cada uma passava pelo
      // proxy Next (decripta -> encaminha -> recripta). Com um pool de
      // concorrencia fixo o navegador para de enfileirar e o servidor para de
      // receber rajadas.
      async function fetchInPool<T>(
        items: Student[],
        task: (student: Student) => Promise<T[]>,
      ): Promise<T[]> {
        const results: T[][] = new Array(items.length);
        let cursor = 0;
        async function worker() {
          while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            const student = items[index];
            if (!student) continue;
            try {
              results[index] = await task(student);
            } catch {
              results[index] = [];
            }
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(FETCH_CONCURRENCY, items.length) }, worker),
        );
        return results.flat().filter(Boolean) as T[];
      }

      const [allCheckIns, allStudentPlans] = await Promise.all([
        fetchInPool<CheckIn>(sampled, async (student) => {
          const res = await fetch(`${apiUrl}/students/${student.id}/related/check-ins`);
          return res.ok ? ((await res.json()) as CheckIn[]) : [];
        }),
        fetchInPool<StudentPlan>(sampled, async (student) => {
          const res = await fetch(`${apiUrl}/students/${student.id}/related/plans`);
          if (!res.ok) return [];
          return ((await res.json()) as StudentPlan[]).map((plan) => ({ ...plan, idAluno: student.id }));
        }),
      ]);

      setData({
        students,
        plans,
        allStudentPlans,
        allCheckIns,
        sampledStudents: sampled.length,
        totalActiveStudents: activeStudents.length,
      });
    } catch {
      setData({
        students: [],
        plans: [],
        allStudentPlans: [],
        allCheckIns: [],
        sampledStudents: 0,
        totalActiveStudents: 0,
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Toda a agregacao roda em useMemo e em UMA passada por colecao.
  //
  // Antes: para cada um dos 12 buckets semanais o codigo varria a lista inteira
  // de check-ins e construia um `new Date()` por item — O(N*W) em tempo e 12N
  // objetos Date descartaveis. Somando semanas + meses + novos alunos dava
  // ~90 mil alocacoes de Date por render, e nada disso era memoizado: alternar
  // o grafico entre "semanal" e "mensal" recomputava tudo.
  //
  // Agora cada registro e visitado uma vez, tem a data convertida uma vez e cai
  // no bucket por busca binaria sobre janelas ordenadas: O(N log W + W).
  //
  // IMPORTANTE: este hook fica ANTES dos early returns de loading/sem-dados.
  // Hook depois de `return` condicional muda a quantidade de hooks entre um
  // render e outro e o React quebra ("change in the order of Hooks"). Por isso
  // o memo trata `data === null` internamente em vez de depender do guard.
  const metrics = useMemo(() => {
    const weeks = getLast12Weeks();
    const months = getLast6Months();

    if (!data) {
      const empty = (windows: Array<{ label: string }>) =>
        windows.map((window) => ({ label: window.label, value: 0 }));
      return {
        activeStudents: 0,
        inactiveStudents: 0,
        activePlans: 0,
        totalCheckIns: 0,
        weeklyCheckIns: empty(weeks),
        monthlyCheckIns: empty(months),
        newStudentsMonthly: empty(months),
        planDistribution: [] as Array<{ label: string; value: number; color: string }>,
      };
    }

    // Distribuicao por plano: era O(P*S) (um filter da lista inteira de
    // matriculas por plano). Um Map indexado por idPlano resolve em O(S+P).
    const activeByPlanId = new Map<number, number>();
    for (const studentPlan of data.allStudentPlans) {
      if (studentPlan.boInativo) continue;
      const planId = studentPlan.plano?.id;
      if (planId === undefined) continue;
      activeByPlanId.set(planId, (activeByPlanId.get(planId) ?? 0) + 1);
    }

    let activeStudentsCount = 0;
    let inactiveStudentsCount = 0;
    for (const student of data.students) {
      if (student.boInativo) inactiveStudentsCount += 1;
      else activeStudentsCount += 1;
    }

    let activePlansCount = 0;
    for (const studentPlan of data.allStudentPlans) {
      if (!studentPlan.boInativo) activePlansCount += 1;
    }

    return {
      activeStudents: activeStudentsCount,
      inactiveStudents: inactiveStudentsCount,
      activePlans: activePlansCount,
      totalCheckIns: data.allCheckIns.length,
      weeklyCheckIns: bucketize(data.allCheckIns, (checkIn) => checkIn.dtCadastro, weeks),
      monthlyCheckIns: bucketize(data.allCheckIns, (checkIn) => checkIn.dtCadastro, months),
      newStudentsMonthly: bucketize(data.students, (student) => student.dtCadastro, months),
      planDistribution: data.plans
        .filter((plan) => !plan.boInativo)
        .map((plan, index) => ({
          label: plan.dsPlano,
          value: activeByPlanId.get(plan.id) ?? 0,
          color: PLAN_COLORS[index % PLAN_COLORS.length]!,
        }))
        .filter((entry) => entry.value > 0)
        .sort((a, b) => b.value - a.value),
    };
  }, [data]);

  if (isLoading) {
    return (
      <>
        <header className="module-page-header">
          <p className="section-label">Gestão</p>
          <h2 className="module-page-title">RELATÓRIOS</h2>
        </header>
        <div className="reports-loading">Carregando dados...</div>
      </>
    );
  }

  if (!data) return null;

  const {
    activeStudents,
    inactiveStudents,
    activePlans,
    totalCheckIns,
    weeklyCheckIns,
    monthlyCheckIns,
    newStudentsMonthly,
    planDistribution,
  } = metrics;

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Gestão</p>
        <h2 className="module-page-title">RELATÓRIOS</h2>
      </header>

      <div className="reports-content">
        {/* O relatorio sempre agregou uma amostra (era `.slice(0, 50)` fixo e
            invisivel). Manter o teto e legitimo — buscar check-ins de 5000
            alunos pelo browser nao escala — mas o gestor precisa saber que os
            numeros de check-in e matricula cobrem parte da base, senao decide
            em cima de um dado que parece total e nao e. */}
        {data.totalActiveStudents > data.sampledStudents ? (
          <div className="form-hint" role="status">
            Check-ins e matrículas calculados sobre os {data.sampledStudents} primeiros de{' '}
            {data.totalActiveStudents} alunos ativos. Os indicadores de alunos e planos
            consideram a base completa.
          </div>
        ) : null}

        <section className="reports-kpis" aria-label="Indicadores">
          <div className="reports-kpi">
            <div className="reports-kpi-icon" style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
              <Users size={20} />
            </div>
            <div>
              <span className="reports-kpi-value">{activeStudents}</span>
              <span className="reports-kpi-label">Alunos ativos</span>
            </div>
          </div>
          <div className="reports-kpi">
            <div className="reports-kpi-icon icon-danger">
              <Users size={20} />
            </div>
            <div>
              <span className="reports-kpi-value">{inactiveStudents}</span>
              <span className="reports-kpi-label">Alunos inativos</span>
            </div>
          </div>
          <div className="reports-kpi">
            <div className="reports-kpi-icon icon-blue">
              <TrendingUp size={20} />
            </div>
            <div>
              <span className="reports-kpi-value">{activePlans}</span>
              <span className="reports-kpi-label">Matrículas ativas</span>
            </div>
          </div>
          <div className="reports-kpi">
            <div className="reports-kpi-icon icon-amber">
              <BarChart3 size={20} />
            </div>
            <div>
              <span className="reports-kpi-value">{totalCheckIns}</span>
              <span className="reports-kpi-label">Check-ins total</span>
            </div>
          </div>
        </section>

        <div className="reports-grid">
          <div className="reports-card">
            <div className="reports-card-header">
              <h3>Check-ins</h3>
              <div className="reports-toggle">
                <button
                  className={checkInView === 'weekly' ? 'active' : ''}
                  onClick={() => setCheckInView('weekly')}
                  type="button"
                >
                  Semanal
                </button>
                <button
                  className={checkInView === 'monthly' ? 'active' : ''}
                  onClick={() => setCheckInView('monthly')}
                  type="button"
                >
                  Mensal
                </button>
              </div>
            </div>
            <BarChartCanvas
              data={checkInView === 'weekly' ? weeklyCheckIns : monthlyCheckIns}
              color="#1f7a53"
              height={220}
            />
          </div>

          <div className="reports-card">
            <div className="reports-card-header">
              <h3>Alunos por plano</h3>
            </div>
            <div className="reports-donut-layout">
              <DonutChartCanvas data={planDistribution} size={160} />
              <div className="reports-legend">
                {planDistribution.map((p) => (
                  <div className="reports-legend-item" key={p.label}>
                    <span className="reports-legend-dot" style={{ background: p.color }} />
                    <span className="reports-legend-label">{p.label}</span>
                    <span className="reports-legend-value">{p.value}</span>
                  </div>
                ))}
                {planDistribution.length === 0 && (
                  <span className="reports-legend-empty">Nenhum aluno com plano ativo</span>
                )}
              </div>
            </div>
          </div>

          <div className="reports-card">
            <div className="reports-card-header">
              <h3>Novos alunos por mês</h3>
            </div>
            <BarChartCanvas
              data={newStudentsMonthly}
              color="#2563eb"
              height={220}
            />
          </div>

          <div className="reports-card">
            <div className="reports-card-header">
              <h3>Status dos alunos</h3>
            </div>
            <div className="reports-donut-layout">
              <DonutChartCanvas
                data={[
                  { label: 'Ativos', value: activeStudents, color: '#1f7a53' },
                  { label: 'Inativos', value: inactiveStudents, color: '#dc2626' },
                ]}
                size={160}
              />
              <div className="reports-legend">
                <div className="reports-legend-item">
                  <span className="reports-legend-dot" style={{ background: '#1f7a53' }} />
                  <span className="reports-legend-label">Ativos</span>
                  <span className="reports-legend-value">{activeStudents}</span>
                </div>
                <div className="reports-legend-item">
                  <span className="reports-legend-dot" style={{ background: '#dc2626' }} />
                  <span className="reports-legend-label">Inativos</span>
                  <span className="reports-legend-value">{inactiveStudents}</span>
                </div>
                {data.students.length > 0 && (
                  <div className="reports-legend-item reports-legend-rate">
                    <PieChart size={14} />
                    <span className="reports-legend-label">Taxa de retenção</span>
                    <span className="reports-legend-value">
                      {Math.round((activeStudents / data.students.length) * 100)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
