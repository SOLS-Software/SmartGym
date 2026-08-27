'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type Evolution = {
  id: number;
  idAluno: number;
  idFuncionario: number | null;
  idAlunoArquivo: number | null;
  dtAvaliacao: string | null;
  dtCadastro: string;
  vlAltura: string | number | null;
  vlPeso: string | number | null;
  vlPercentualGordura: string | number | null;
  vlMassaMagra: string | number | null;
  vlCircPeitoral: string | number | null;
  vlCircCintura: string | number | null;
  vlCircQuadril: string | number | null;
  vlCircBraco: string | number | null;
  vlCircCoxa: string | number | null;
  dsObservacao: string | null;
  boInativo: boolean;
  funcionario: { id: number; nmFuncionario: string } | null;
  alunoArquivo: { id: number; dsArquivo: string; anCaminho: string } | null;
};

type MetricKey =
  | 'vlPeso'
  | 'vlPercentualGordura'
  | 'vlMassaMagra'
  | 'vlCircCintura'
  | 'vlCircPeitoral'
  | 'vlCircQuadril'
  | 'vlCircBraco'
  | 'vlCircCoxa';

type Metric = {
  key: MetricKey;
  label: string;
  unit: string;
  /** Direção que representa progresso — usada só para colorir a variação. */
  betterWhen: 'down' | 'up' | 'neutral';
};

const METRICS: Metric[] = [
  { key: 'vlPeso', label: 'Peso', unit: 'kg', betterWhen: 'neutral' },
  { key: 'vlPercentualGordura', label: '% de gordura', unit: '%', betterWhen: 'down' },
  { key: 'vlMassaMagra', label: 'Massa magra', unit: 'kg', betterWhen: 'up' },
  { key: 'vlCircCintura', label: 'Cintura', unit: 'cm', betterWhen: 'down' },
  { key: 'vlCircPeitoral', label: 'Peitoral', unit: 'cm', betterWhen: 'neutral' },
  { key: 'vlCircQuadril', label: 'Quadril', unit: 'cm', betterWhen: 'neutral' },
  { key: 'vlCircBraco', label: 'Braço', unit: 'cm', betterWhen: 'up' },
  { key: 'vlCircCoxa', label: 'Coxa', unit: 'cm', betterWhen: 'up' },
];

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  return parsed;
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatValue(value: number | null, unit: string) {
  if (value === null) return '-';
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${unit}`;
}

/**
 * IMC não é coluna no banco: é peso/altura², derivado aqui. Guardar o índice
 * junto das medidas criaria um valor que pode discordar das colunas que o
 * originam (alguém corrige o peso, o índice fica velho).
 */
function calculateImc(peso: number | null, altura: number | null) {
  if (!peso || !altura) return null;
  // Altura é gravada em metros; digitação em centímetros (170) é convertida
  // para não devolver um IMC de 0,006.
  const metros = altura > 3 ? altura / 100 : altura;
  return peso / (metros * metros);
}

export function StudentEvolutionView({
  studentId,
  studentName,
}: {
  studentId: number | null;
  studentName: string;
}) {
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [metricKey, setMetricKey] = useState<MetricKey>('vlPeso');
  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!studentId) {
      setIsLoading(false);
      return;
    }

    void (async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${apiUrl}/students/${studentId}/related/evolutions`);
        if (!response.ok) await getApiError(response, 'Não foi possível carregar suas avaliações.');
        const data = (await response.json()) as Evolution[];
        setEvolutions(data.filter((item) => item.boInativo === false));
        setFeedback('');
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Erro ao carregar avaliações.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [studentId]);

  // URLs assinadas das fotos, uma por avaliação que tem arquivo. Falha de uma
  // foto não derruba a tela: o card simplesmente fica sem imagem.
  useEffect(() => {
    if (!studentId) return;
    const withPhoto = evolutions.filter((item) => item.idAlunoArquivo);
    if (withPhoto.length === 0) return;

    void (async () => {
      const entries = await Promise.all(
        withPhoto.map(async (item) => {
          try {
            const response = await fetch(
              `${apiUrl}/students/${studentId}/files/${item.idAlunoArquivo}/url`,
            );
            if (!response.ok) return null;
            const data = (await response.json()) as { url?: string };
            return data.url ? ([item.id, data.url] as const) : null;
          } catch {
            return null;
          }
        }),
      );

      setPhotoUrls(Object.fromEntries(entries.filter((entry) => entry !== null)));
    })();
  }, [evolutions, studentId]);

  // A API devolve da mais recente para a mais antiga; o gráfico precisa da
  // ordem cronológica.
  const chronological = useMemo(
    () =>
      [...evolutions].sort((a, b) => {
        const left = new Date(a.dtAvaliacao ?? a.dtCadastro).getTime();
        const right = new Date(b.dtAvaliacao ?? b.dtCadastro).getTime();
        return left - right;
      }),
    [evolutions],
  );

  const latest = chronological[chronological.length - 1] ?? null;
  const first = chronological[0] ?? null;
  const metric = METRICS.find((item) => item.key === metricKey) ?? METRICS[0]!;

  const series = chronological
    .map((item) => ({
      date: item.dtAvaliacao ?? item.dtCadastro,
      value: toNumber(item[metric.key]),
    }))
    .filter((point): point is { date: string; value: number } => point.value !== null);

  if (!studentId) {
    return (
      <>
        <header className="module-page-header">
          <p className="section-label">Minha conta</p>
          <h2 className="module-page-title">MINHA EVOLUÇÃO</h2>
        </header>
        <div className="form-view">
          <p className="evolution-empty">Não foi possível identificar seu cadastro.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Minha conta</p>
        <h2 className="module-page-title">MINHA EVOLUÇÃO</h2>
        <p className="module-page-subtitle">{studentName}</p>
      </header>

      <div className="form-view evolution-view">
        {feedback ? <div className="form-feedback">{feedback}</div> : null}

        {isLoading ? (
          <p className="evolution-empty">Carregando suas avaliações...</p>
        ) : evolutions.length === 0 ? (
          <div className="evolution-empty-state">
            <strong>Você ainda não tem avaliação física registrada.</strong>
            <p>
              Fale com seu professor para agendar a primeira. É a partir dela que esta tela
              passa a mostrar sua evolução ao longo do tempo.
            </p>
          </div>
        ) : (
          <>
            <section className="evolution-summary" aria-label="Últimas medidas">
              <SummaryCard
                label="Peso"
                current={toNumber(latest?.vlPeso ?? null)}
                previous={toNumber(first?.vlPeso ?? null)}
                unit="kg"
                betterWhen="neutral"
              />
              <SummaryCard
                label="IMC"
                current={calculateImc(toNumber(latest?.vlPeso ?? null), toNumber(latest?.vlAltura ?? null))}
                previous={calculateImc(toNumber(first?.vlPeso ?? null), toNumber(first?.vlAltura ?? null))}
                unit=""
                betterWhen="neutral"
              />
              <SummaryCard
                label="% de gordura"
                current={toNumber(latest?.vlPercentualGordura ?? null)}
                previous={toNumber(first?.vlPercentualGordura ?? null)}
                unit="%"
                betterWhen="down"
              />
              <SummaryCard
                label="Massa magra"
                current={toNumber(latest?.vlMassaMagra ?? null)}
                previous={toNumber(first?.vlMassaMagra ?? null)}
                unit="kg"
                betterWhen="up"
              />
            </section>

            <section className="evolution-chart-card" aria-label="Evolução ao longo do tempo">
              <div className="evolution-chart-head">
                <div>
                  <p className="section-label">Ao longo do tempo</p>
                  <strong>{metric.label}</strong>
                </div>
                <label className="search-field">
                  <span>Medida</span>
                  <select
                    onChange={(event) => setMetricKey(event.target.value as MetricKey)}
                    value={metricKey}
                  >
                    {METRICS.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {series.length < 2 ? (
                <p className="evolution-empty">
                  {series.length === 1
                    ? 'Uma medição registrada. A curva aparece a partir da segunda avaliação.'
                    : 'Nenhuma medição desta medida ainda.'}
                </p>
              ) : (
                <LineChart points={series} unit={metric.unit} />
              )}
            </section>

            <section className="evolution-history" aria-label="Histórico de avaliações">
              <p className="section-label">Histórico</p>
              {evolutions.map((item) => {
                const imc = calculateImc(toNumber(item.vlPeso), toNumber(item.vlAltura));
                return (
                  <article className="evolution-entry" key={item.id}>
                    <div className="evolution-entry-head">
                      <strong>{formatDate(item.dtAvaliacao ?? item.dtCadastro)}</strong>
                      {item.funcionario ? <span>{item.funcionario.nmFuncionario}</span> : null}
                    </div>
                    <dl className="evolution-entry-measures">
                      {METRICS.map((definition) => {
                        const value = toNumber(item[definition.key]);
                        if (value === null) return null;
                        return (
                          <div key={definition.key}>
                            <dt>{definition.label}</dt>
                            <dd>{formatValue(value, definition.unit)}</dd>
                          </div>
                        );
                      })}
                      {imc !== null ? (
                        <div>
                          <dt>IMC</dt>
                          <dd>{imc.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {item.dsObservacao ? (
                      <p className="evolution-entry-note">{item.dsObservacao}</p>
                    ) : null}
                    {photoUrls[item.id] ? (
                      <img
                        alt={`Foto da avaliação de ${formatDate(item.dtAvaliacao ?? item.dtCadastro)}`}
                        className="evolution-entry-photo"
                        src={photoUrls[item.id]}
                      />
                    ) : null}
                  </article>
                );
              })}
            </section>
          </>
        )}
      </div>
    </>
  );
}

function SummaryCard({
  label,
  current,
  previous,
  unit,
  betterWhen,
}: {
  label: string;
  current: number | null;
  previous: number | null;
  unit: string;
  betterWhen: 'up' | 'down' | 'neutral';
}) {
  const delta = current !== null && previous !== null ? current - previous : null;
  const isImprovement =
    delta === null || delta === 0 || betterWhen === 'neutral'
      ? null
      : betterWhen === 'up'
        ? delta > 0
        : delta < 0;

  return (
    <div className="evolution-card">
      <span className="evolution-card-label">{label}</span>
      <strong className="evolution-card-value">
        {current === null
          ? '-'
          : `${current.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`}
      </strong>
      {delta !== null && delta !== 0 ? (
        <span
          className={`evolution-card-delta ${
            isImprovement === null ? '' : isImprovement ? 'up' : 'down'
          }`}
        >
          {delta > 0 ? '+' : ''}
          {delta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} desde a primeira
        </span>
      ) : (
        <span className="evolution-card-delta">Primeira medição</span>
      )}
    </div>
  );
}

/**
 * Curva simples em SVG. Fica em SVG (e não canvas como os Relatórios) porque
 * aqui são poucos pontos e o traço precisa acompanhar a cor do tema — em canvas
 * a cor seria fixada no momento do desenho e não seguiria o modo escuro.
 */
function LineChart({ points, unit }: { points: { date: string; value: number }[]; unit: string }) {
  const width = 720;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 44 };

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Série constante (todo mundo com o mesmo valor) zeraria o divisor e mandaria
  // a linha para fora do quadro.
  const span = max - min || Math.max(max * 0.1, 1);
  const floor = min - span * 0.15;
  const ceiling = max + span * 0.15;

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const coordinates = points.map((point, index) => {
    const x =
      padding.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const y = padding.top + innerHeight - ((point.value - floor) / (ceiling - floor)) * innerHeight;
    return { ...point, x, y };
  });

  const path = coordinates
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');

  const area = `${path} L ${coordinates[coordinates.length - 1]!.x.toFixed(1)} ${(
    padding.top + innerHeight
  ).toFixed(1)} L ${coordinates[0]!.x.toFixed(1)} ${(padding.top + innerHeight).toFixed(1)} Z`;

  return (
    <div className="evolution-chart-scroll">
      <svg
        className="evolution-chart"
        role="img"
        aria-label={`Evolução de ${points.length} medições, de ${points[0]!.value} a ${
          points[points.length - 1]!.value
        } ${unit}`}
        viewBox={`0 0 ${width} ${height}`}
      >
        <line
          className="evolution-chart-axis"
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + innerHeight}
          y2={padding.top + innerHeight}
        />
        <path className="evolution-chart-area" d={area} />
        <path className="evolution-chart-line" d={path} />
        {coordinates.map((point, index) => (
          <g key={point.date + String(index)}>
            <circle
              className={`evolution-chart-dot ${index === coordinates.length - 1 ? 'last' : ''}`}
              cx={point.x}
              cy={point.y}
              r={index === coordinates.length - 1 ? 5 : 3.5}
            />
            {index === 0 || index === coordinates.length - 1 ? (
              <text className="evolution-chart-label" x={point.x} y={point.y - 12}>
                {point.value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
              </text>
            ) : null}
          </g>
        ))}
        <text className="evolution-chart-axis-label" x={padding.left} y={height - 8}>
          {formatDate(points[0]!.date)}
        </text>
        <text
          className="evolution-chart-axis-label end"
          x={width - padding.right}
          y={height - 8}
        >
          {formatDate(points[points.length - 1]!.date)}
        </text>
      </svg>
    </div>
  );
}
