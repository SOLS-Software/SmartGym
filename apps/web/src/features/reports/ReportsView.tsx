'use client';

import { useEffect, useRef, useState } from 'react';
import { BarChart3, CalendarCheck, PieChart, TrendingUp, Users } from 'lucide-react';
import { apiFetch as fetch, apiUrl } from '../../shared/api/apiFetch';

/**
 * Panorama vindo AGREGADO de /reports/overview.
 *
 * Esta tela montava tudo no browser: baixava a lista de alunos e, para cada um,
 * buscava check-ins e matriculas — parando nos 120 primeiros para nao derrubar
 * o navegador. Numa rede de 800 alunos, os graficos descreviam 15% da casa. Nao
 * ha mais amostra: cada numero abaixo e uma soma feita no banco sobre a base
 * inteira.
 */
type Overview = {
  alunos: { cadastrados: number; ativos: number; inativos: number };
  matriculas: { vigentes: number; novasNoMes: number; encerradasNoMes: number };
  planosNoCatalogo: number;
  checkIns: { hoje: number; noPeriodo: number; semanasNoPeriodo: number };
  /** `taxa` e nula quando nao havia base no inicio do mes — mes sem denominador. */
  retencao: { baseInicial: number; encerradas: number; taxa: number | null };
  series: {
    checkInsSemanal: Array<{ label: string; value: number }>;
    checkInsMensal: Array<{ label: string; value: number }>;
    novosAlunosMensal: Array<{ label: string; value: number }>;
  };
  porPlano: Array<{ id: number; dsPlano: string; quantidade: number }>;
};

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

type Financial = {
  periodo: { inicio: string; fim: string };
  recebido: {
    total: number;
    mensalidades: number;
    balcao: number;
    quantidade: number;
    qtMensalidades: number;
    qtBalcao: number;
    ticketMedioMensalidade: number;
    ticketMedioBalcao: number;
  };
  /** Nulo quando o relatorio esta filtrado por filial ou nao ha base ativa. */
  arpu: { valor: number; matriculasVigentes: number } | null;
  aReceber: { total: number; quantidade: number };
  inadimplencia: { total: number; quantidade: number; alunos: number };
};

type Cancellations = {
  total: number;
  porMotivo: Array<{ motivo: string; quantidade: number }>;
};

type InactiveStudent = {
  idAluno: number;
  nmAluno: string;
  anEmail: string;
  nrDDD: number | null;
  nrContato: string | null;
  plano: string | null;
  dtUltimoCheckIn: string | null;
  diasSemVir: number | null;
  visitas90Dias: number;
  nuncaVeio: boolean;
};

type Inactivity = {
  diasSemCheckIn: number;
  total: number;
  comHistorico: number;
  nuncaVieram: number;
  alunos: InactiveStudent[];
};

const brl = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ReportsView() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [financial, setFinancial] = useState<Financial | null>(null);
  const [cancellations, setCancellations] = useState<Cancellations | null>(null);
  const [inactivity, setInactivity] = useState<Inactivity | null>(null);
  const [checkInView, setCheckInView] = useState<'weekly' | 'monthly'>('weekly');

  // TUDO nesta tela vem agregado do servidor.
  //
  // O panorama comanda o estado de carregamento. Os outros tres blocos falham
  // em silencio de proposito: dependem de permissoes distintas (financeiro,
  // avisos) e o resto do relatorio continua util para quem nao as tem.
  useEffect(() => {
    void (async () => {
      try {
        const [overviewResponse, financialResponse, cancellationsResponse, inactivityResponse] =
          await Promise.all([
            fetch(`${apiUrl}/reports/overview`),
            fetch(`${apiUrl}/reports/financial`),
            fetch(`${apiUrl}/reports/cancellations`),
            // Sem `days`: vale o corte configurado no cliente.
            fetch(`${apiUrl}/reports/inactive-students`),
          ]);
        if (overviewResponse.ok) setOverview((await overviewResponse.json()) as Overview);
        if (financialResponse.ok) setFinancial((await financialResponse.json()) as Financial);
        if (cancellationsResponse.ok) {
          setCancellations((await cancellationsResponse.json()) as Cancellations);
        }
        if (inactivityResponse.ok) {
          setInactivity((await inactivityResponse.json()) as Inactivity);
        }
      } catch {
        // silencioso de proposito — ver comentario acima
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  if (isLoading) {
    return (
      <>
        <header className="module-page-header">
          <p className="section-label">Início</p>
          <h2 className="module-page-title">RELATÓRIOS</h2>
        </header>
        <div className="reports-loading">Carregando dados...</div>
      </>
    );
  }

  if (!overview) return null;

  const { alunos, matriculas, checkIns, retencao, series } = overview;

  // Retencao sem base no inicio do mes nao e 100%: e indefinida. Um numero
  // redondo inventado seria lido como excelencia.
  const retencaoLabel =
    retencao.taxa === null ? '—' : `${Math.round(retencao.taxa * 100)}%`;

  const planDistribution = overview.porPlano.map((plano, index) => ({
    label: plano.dsPlano,
    value: plano.quantidade,
    color: PLAN_COLORS[index % PLAN_COLORS.length]!,
  }));

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Início</p>
        <h2 className="module-page-title">RELATÓRIOS</h2>
      </header>

      <div className="reports-content">
        <section className="reports-kpis" aria-label="Indicadores">
          {/* Matricula VIGENTE, nao a flag da linha: contrato que ja comecou e
              ainda nao foi encerrado. Vem primeiro porque e a base sobre a qual
              todo o resto da tela e calculado. */}
          <div className="reports-kpi">
            <div className="reports-kpi-icon" style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
              <TrendingUp size={20} />
            </div>
            <div>
              <span className="reports-kpi-value">{matriculas.vigentes}</span>
              <span className="reports-kpi-label">Matrículas ativas</span>
              <span className="reports-kpi-hint">
                {matriculas.novasNoMes} nova(s) e {matriculas.encerradasNoMes} encerrada(s) no mês
              </span>
            </div>
          </div>
          {/* Cadastro e outra pergunta — e o card diz qual. Antes os dois
              numeros apareciam lado a lado com nomes parecidos e ninguem sabia
              por que discordavam. */}
          <div className="reports-kpi">
            <div className="reports-kpi-icon icon-blue">
              <Users size={20} />
            </div>
            <div>
              <span className="reports-kpi-value">{alunos.cadastrados}</span>
              <span className="reports-kpi-label">Alunos cadastrados</span>
              <span className="reports-kpi-hint">
                {alunos.ativos} ativo(s) · {alunos.inativos} inativo(s)
              </span>
            </div>
          </div>
          {/* Retencao de verdade: da base que existia no dia 1o, quanto
              continua. A tela antes mostrava `ativos ÷ total cadastrado`, que
              mede quanto da HISTORIA da academia ainda esta ativa. */}
          <div className="reports-kpi">
            <div className="reports-kpi-icon" style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
              <PieChart size={20} />
            </div>
            <div>
              <span className="reports-kpi-value">{retencaoLabel}</span>
              <span className="reports-kpi-label">Retenção no mês</span>
              <span className="reports-kpi-hint">
                {retencao.baseInicial > 0
                  ? `${retencao.encerradas} saíram de ${retencao.baseInicial} no início do mês`
                  : 'sem base no início do mês para comparar'}
              </span>
            </div>
          </div>
          {/* O card antigo somava "check-ins de sempre" dos alunos amostrados:
              so crescia e nao comparava com nada. Hoje = o numero que a recepcao
              usa; o periodo = o mesmo do grafico logo abaixo. */}
          <div className="reports-kpi">
            <div className="reports-kpi-icon icon-amber">
              <CalendarCheck size={20} />
            </div>
            <div>
              <span className="reports-kpi-value">{checkIns.hoje}</span>
              <span className="reports-kpi-label">Check-ins hoje</span>
              <span className="reports-kpi-hint">
                {checkIns.noPeriodo} nas últimas {checkIns.semanasNoPeriodo} semanas
              </span>
            </div>
          </div>
        </section>

        {financial ? (
          <section className="reports-financial" aria-label="Financeiro do mes">
            <div className="reports-card-header">
              <h3>Financeiro do mês</h3>
            </div>
            <div className="reports-financial-grid">
              <div className="reports-financial-item">
                <span className="reports-kpi-label">Recebido</span>
                <strong>{brl(financial.recebido.total)}</strong>
                <span className="reports-financial-detail">
                  {brl(financial.recebido.mensalidades)} em mensalidades ·{' '}
                  {brl(financial.recebido.balcao)} no balcão
                </span>
              </div>
              <div className="reports-financial-item">
                <span className="reports-kpi-label">A receber no mês</span>
                <strong>{brl(financial.aReceber.total)}</strong>
                <span className="reports-financial-detail">
                  {financial.aReceber.quantidade} parcela(s) em aberto
                </span>
              </div>
              <div className="reports-financial-item danger">
                <span className="reports-kpi-label">Inadimplência</span>
                <strong>{brl(financial.inadimplencia.total)}</strong>
                <span className="reports-financial-detail">
                  {/* Parcelas vencidas x pessoas: 40 parcelas podem ser 3 alunos,
                      e e o numero de pessoas que define quantas ligacoes fazer. */}
                  {financial.inadimplencia.quantidade} vencida(s) ·{' '}
                  {financial.inadimplencia.alunos} aluno(s)
                </span>
              </div>
              {/* Era "Ticket médio" = recebido ÷ nº de recebimentos, misturando
                  a creatina de R$ 90 com o plano anual: o número caía justamente
                  quando a loja vendia bem. Agora são duas contas separadas — a
                  receita por aluno, que se compara mês a mês, e o ticket só de
                  mensalidade. */}
              <div className="reports-financial-item">
                <span className="reports-kpi-label">Receita por aluno</span>
                <strong>{financial.arpu ? brl(financial.arpu.valor) : '—'}</strong>
                <span className="reports-financial-detail">
                  {financial.arpu
                    ? `sobre ${financial.arpu.matriculasVigentes} matrícula(s) vigente(s)`
                    : 'sem matrícula vigente no período'}
                </span>
              </div>
              <div className="reports-financial-item">
                <span className="reports-kpi-label">Ticket de mensalidade</span>
                <strong>{brl(financial.recebido.ticketMedioMensalidade)}</strong>
                <span className="reports-financial-detail">
                  sobre {financial.recebido.qtMensalidades} mensalidade(s) ·{' '}
                  {financial.recebido.qtBalcao} venda(s) de balcão à parte
                </span>
              </div>
            </div>
          </section>
        ) : null}

        {inactivity && inactivity.total > 0 ? (
          <section className="reports-evasion" aria-label="Alunos sumidos">
            <div className="reports-card-header">
              <h3>Sumiram, mas ainda pagam</h3>
              <span className="reports-financial-detail">
                sem vir há {inactivity.diasSemCheckIn} dias ou mais ·{' '}
                {inactivity.comHistorico} já treinavam · {inactivity.nuncaVieram} nunca vieram
              </span>
            </div>
            {/* Ordenados pela frequência de antes: quem treinava três vezes por
                semana e sumiu aparece primeiro. É de quem a ausência destoa —
                e é quem ainda dá para trazer de volta. */}
            <ul className="reports-evasion-list">
              {inactivity.alunos.slice(0, 25).map((aluno) => (
                <li className="reports-evasion-item" key={aluno.idAluno}>
                  <div className="reports-evasion-who">
                    <strong>{aluno.nmAluno}</strong>
                    <span>
                      {aluno.plano ?? 'Sem plano identificado'}
                      {aluno.nrContato
                        ? ` · (${aluno.nrDDD ?? ''}) ${aluno.nrContato}`
                        : aluno.anEmail
                          ? ` · ${aluno.anEmail}`
                          : ' · sem contato cadastrado'}
                    </span>
                  </div>
                  <div className="reports-evasion-when">
                    {aluno.nuncaVeio ? (
                      // Não é evasão: é uma matrícula que nunca começou. Quem
                      // vai ligar precisa saber a diferença antes de discar.
                      <span className="reports-evasion-never">nunca veio</span>
                    ) : (
                      <>
                        <strong>{aluno.diasSemVir} dias</strong>
                        <span>{aluno.visitas90Dias} visita(s) em 90 dias</span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {inactivity.total > 25 ? (
              <p className="reports-evasion-more">
                e mais {inactivity.total - 25} aluno(s) na mesma situação.
              </p>
            ) : null}
          </section>
        ) : null}

        {cancellations && cancellations.total > 0 ? (
          <section className="reports-financial" aria-label="Motivos de cancelamento">
            <div className="reports-card-header">
              <h3>Por que sairam neste mes</h3>
              <span className="reports-financial-detail">{cancellations.total} no total</span>
            </div>
            <ul className="reports-reasons">
              {cancellations.porMotivo.map((linha) => (
                <li key={linha.motivo}>
                  <span>{linha.motivo}</span>
                  <div
                    className="reports-reason-bar"
                    style={{
                      width: `${Math.max(6, (linha.quantidade / cancellations.total) * 100)}%`,
                    }}
                  />
                  <strong>{linha.quantidade}</strong>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

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
              data={
                checkInView === 'weekly' ? series.checkInsSemanal : series.checkInsMensal
              }
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
            <BarChartCanvas data={series.novosAlunosMensal} color="#2563eb" height={220} />
          </div>

          <div className="reports-card">
            <div className="reports-card-header">
              <h3>Status dos alunos</h3>
            </div>
            <div className="reports-donut-layout">
              <DonutChartCanvas
                data={[
                  { label: 'Ativos', value: alunos.ativos, color: '#1f7a53' },
                  { label: 'Inativos', value: alunos.inativos, color: '#dc2626' },
                ]}
                size={160}
              />
              <div className="reports-legend">
                <div className="reports-legend-item">
                  <span className="reports-legend-dot" style={{ background: '#1f7a53' }} />
                  <span className="reports-legend-label">Ativos</span>
                  <span className="reports-legend-value">{alunos.ativos}</span>
                </div>
                <div className="reports-legend-item">
                  <span className="reports-legend-dot" style={{ background: '#dc2626' }} />
                  <span className="reports-legend-label">Inativos</span>
                  <span className="reports-legend-value">{alunos.inativos}</span>
                </div>
                {/* Aqui ficava "Taxa de retenção" = ativos ÷ cadastrados, que
                    nao mede retencao e sim quanto do historico da casa segue
                    ativo. A retencao de verdade esta no KPI do topo; esta rosca
                    responde outra coisa — a composicao do cadastro. */}
                {alunos.cadastrados > 0 && (
                  <div className="reports-legend-item reports-legend-rate">
                    <PieChart size={14} />
                    <span className="reports-legend-label">Cadastros ativos</span>
                    <span className="reports-legend-value">
                      {Math.round((alunos.ativos / alunos.cadastrados) * 100)}%
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
