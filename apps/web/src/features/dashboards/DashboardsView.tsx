'use client';

import { useEffect, useState } from 'react';
import { Activity, CalendarClock, Coins, TrendingDown, UserPlus } from 'lucide-react';
import { apiFetch as fetch, apiUrl } from '../../shared/api/apiFetch';
import { classeDaTinta } from './calor';

/**
 * Aba Dashboards: os paineis analiticos que saíram do levantamento de
 * indicadores — retenção, recebíveis, funil e ocupação.
 *
 * Complementa a aba Relatórios, não a substitui. Relatórios é operacional
 * (quem sumiu, quem deve, quanto entrou este mês — listas para agir hoje);
 * aqui as perguntas são de tendência, e a resposta é uma decisão de gestão,
 * não uma ligação.
 *
 * Os gráficos são SVG e CSS, não canvas. Os canvas da tela de Relatórios leem
 * `classList.contains('dark')` uma vez, na hora de desenhar: quem troca o tema
 * com o gráfico na tela fica com as cores do tema anterior até o próximo
 * redesenho. Com tokens do CSS isso não acontece — e ainda dá texto
 * selecionável e legível por leitor de tela.
 */

type Coorte = {
  safra: string;
  label: string;
  tamanho: number;
  retidas: Array<number | null>;
};

type Retention = {
  coorte: { safras: Coorte[]; mesCorrente: string };
  churn: Array<{ label: string; base: number; saidas: number; taxa: number | null }>;
  permanencia: { encerradas: number; mediaDias: number | null; medianaDias: number | null };
  valorPorMatriculaEncerrada: { total: number; media: number; base: number } | null;
};

type Receivables = {
  aging: {
    faixas: Array<{ label: string; total: number; quantidade: number; alunos: number }>;
    total: number;
  };
  previsao: { semanas: Array<{ label: string; value: number; quantidade: number }>; total: number };
  pontualidade: {
    liquidadas: number;
    emAtraso: number;
    noPrazo: number;
    atrasoMedioDias: number | null;
    diasAnalisados: number;
  };
  formasDePagamento: Array<{ label: string; total: number; quantidade: number }>;
};

type Funnel = {
  total: number;
  convertidos: number;
  taxaConversao: number | null;
  semResponsavel: number;
  porStatus: Array<{ label: string; quantidade: number }>;
  porOrigem: Array<{ label: string; leads: number; convertidos: number; taxa: number | null }>;
  porVendedor: Array<{ label: string; leads: number; convertidos: number; taxa: number | null }>;
  planosDesejados: Array<{ label: string; quantidade: number }>;
  tempoAteContatoDias: number | null;
  semContato: number;
};

type Occupancy = {
  periodo: { semanas: number };
  mapa: Array<{ dia: number; hora: number; total: number }>;
  totalNoMapa: number;
  pico: { dia: number; hora: number; total: number } | null;
  atividades: Array<{
    label: string;
    turmas: number;
    vagas: number;
    inscritos: number;
    presencas: number;
    ocupacao: number | null;
    presenca: number | null;
  }>;
  turmasNoPeriodo: number;
  turmasSemCapacidade: number;
};

const brl = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Percentual com traço para nulo — um indicador sem denominador não é 0%. */
const pct = (valor: number | null | undefined) =>
  valor === null || valor === undefined ? '—' : `${Math.round(valor * 100)}%`;

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * Opacidade máxima da tintura das células de calor.
 *
 * Não é escolha estética: é o teto que mantém o número legível dentro da
 * célula. A tinta já é escolhida pela de maior contraste (ver ./calor.ts), mas
 * quando a marca do cliente é muito saturada nem a melhor das duas alcança o
 * mínimo de 4,5:1 — com a marca vermelha do cliente de teste, a célula cheia
 * ficava em 4,46:1 a 85%. Baixar o teto devolve contraste sem custar leitura:
 * a diferença entre 78% e 85% de tintura não é perceptível na comparação entre
 * células, que é para o que a cor serve aqui.
 *
 * Contra uma marca ainda mais extrema alguma célula pode ficar marginalmente
 * abaixo de AA. O valor continua no `title` e a posição na grade já carrega a
 * informação, então nada se perde — mas vale saber que o teto é mitigação, não
 * garantia.
 */
const TINTURA_MAXIMA = 0.78;

const STATUS_LEGIVEL: Record<string, string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

// ---------------------------------------------------------------------------
// Blocos visuais
// ---------------------------------------------------------------------------

/**
 * Cores vigentes do tema, relidas quando o cliente troca claro/escuro.
 *
 * A cor primária vem do tema do CLIENTE e é injetada em `document.documentElement`
 * por HomePage — pode ser qualquer marca. Os mapas de calor precisam dela para
 * decidir a tinta do texto (ver ./calor.ts); sem observar a troca de tema, a
 * escolha ficaria congelada na paleta anterior.
 */
function usePaletaDeCalor() {
  const [paleta, setPaleta] = useState({ primaria: '', superficie: '' });

  useEffect(() => {
    const ler = () => {
      const estilo = getComputedStyle(document.documentElement);
      setPaleta({
        primaria: estilo.getPropertyValue('--color-primary').trim(),
        superficie: estilo.getPropertyValue('--color-surface').trim(),
      });
    };
    ler();

    let agendado = 0;
    const observador = new MutationObserver(() => {
      // Coalescer a rajada. Trocar o tema nao e uma mutacao: sao NOVE (medidas)
      // — a classe `dark` mais os `setProperty` que HomePage aplica um a um para
      // cada cor do tema do cliente. Sem juntar, cada uma viraria um setState e
      // esta aba re-renderizaria nove vezes por clique no botao de tema.
      //
      // O par cancelar/agendar deixa valer so a ultima de cada quadro, e ainda
      // garante que a leitura acontece depois do recalculo de estilo do quadro,
      // e nao no meio da rajada de mutacoes.
      cancelAnimationFrame(agendado);
      agendado = requestAnimationFrame(ler);
    });
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });

    return () => {
      cancelAnimationFrame(agendado);
      observador.disconnect();
    };
  }, []);

  return paleta;
}

function Bloco({
  titulo,
  hint,
  children,
}: {
  titulo: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="dash-bloco" aria-label={titulo}>
      <div className="dash-bloco-header">
        <h3>{titulo}</h3>
        {hint ? <span className="dash-hint">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Kpi({
  icon: Icon,
  valor,
  rotulo,
  hint,
  tom,
}: {
  icon: typeof Activity;
  valor: string;
  rotulo: string;
  hint?: string;
  tom?: 'neutro' | 'alerta' | 'perigo';
}) {
  return (
    <div className={`dash-kpi${tom && tom !== 'neutro' ? ` tom-${tom}` : ''}`}>
      <div className="dash-kpi-icon">
        <Icon size={18} />
      </div>
      <div className="dash-kpi-corpo">
        <span className="dash-kpi-valor">{valor}</span>
        <span className="dash-kpi-rotulo">{rotulo}</span>
        {hint ? <span className="dash-kpi-hint">{hint}</span> : null}
      </div>
    </div>
  );
}

type ItemBarra = { label: string; valor: number; texto: string; hint?: string; tom?: string };

/**
 * Barras horizontais. Escolhidas em vez de barras verticais sempre que o rótulo
 * é uma palavra e não uma data: nome de vendedor, forma de pagamento e faixa de
 * atraso não cabem embaixo de uma coluna sem virar texto na diagonal.
 */
function BarrasHorizontais({ itens, vazio }: { itens: ItemBarra[]; vazio: string }) {
  if (itens.length === 0) return <p className="dash-vazio">{vazio}</p>;
  const maior = Math.max(...itens.map((item) => item.valor), 1);

  return (
    <ul className="dash-barras">
      {itens.map((item) => (
        <li key={item.label}>
          <div className="dash-barra-topo">
            <span className="dash-barra-label">{item.label}</span>
            <strong className="dash-barra-valor">{item.texto}</strong>
          </div>
          <div className="dash-barra-trilho">
            <div
              className={`dash-barra-preenchida${item.tom ? ` tom-${item.tom}` : ''}`}
              style={{ width: `${Math.max(1.5, (item.valor / maior) * 100)}%` }}
            />
          </div>
          {item.hint ? <span className="dash-barra-hint">{item.hint}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Barras verticais em SVG, para séries com rótulo de tempo. */
function BarrasVerticais({
  pontos,
  formatar,
  altura = 150,
  zerado,
}: {
  pontos: Array<{ label: string; value: number; hint?: string }>;
  formatar: (valor: number) => string;
  altura?: number;
  /** Texto para quando a série inteira é zero — ver comentário abaixo. */
  zerado?: string;
}) {
  const maior = Math.max(...pontos.map((ponto) => ponto.value), 1);
  const todosZero = pontos.every((ponto) => ponto.value === 0);

  return (
    <div className="dash-serie">
      {/* Série toda zerada desenha oito barras rasas e nenhum número: quem olha
          não distingue "não houve nada" de "o gráfico quebrou". A frase resolve
          a ambiguidade sem esconder o eixo, que ainda diz qual período é qual. */}
      {todosZero && zerado ? <p className="dash-nota-inline">{zerado}</p> : null}
      <div className="dash-serie-barras" style={{ height: `${altura}px` }}>
        {pontos.map((ponto) => (
          <div className="dash-serie-coluna" key={ponto.label}>
            <span className="dash-serie-valor">{ponto.value > 0 ? formatar(ponto.value) : ''}</span>
            <div
              className="dash-serie-barra"
              style={{ height: todosZero ? '2px' : `${Math.max(2, (ponto.value / maior) * 100)}%` }}
              title={ponto.hint ?? `${ponto.label}: ${formatar(ponto.value)}`}
            />
            <span className="dash-serie-label">{ponto.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A tabela de coorte. Cada linha é uma safra de matrícula; cada coluna, um mês
 * decorrido desde a entrada. O triângulo vazio à direita não é falta de dado:
 * é mês que ainda não aconteceu para aquela safra.
 *
 * Lê-se na diagonal e na coluna. Descer uma COLUNA compara safras no mesmo
 * ponto da vida do contrato — é ali que se vê se a academia está melhorando em
 * segurar aluno. Andar numa LINHA mostra em que mês aquela turma começou a
 * sumir.
 */
function CoorteTabela({
  safras,
  mesCorrente,
  paleta,
}: {
  safras: Coorte[];
  mesCorrente: string;
  paleta: { primaria: string; superficie: string };
}) {
  const comGente = safras.filter((safra) => safra.tamanho > 0);
  if (comGente.length === 0) {
    return <p className="dash-vazio">Nenhuma matrícula nova nos últimos meses.</p>;
  }

  const colunas = Math.max(...safras.map((safra) => safra.retidas.length));

  return (
    <div className="dash-tabela-scroll">
      <table className="dash-coorte">
        <thead>
          <tr>
            <th scope="col">Safra</th>
            <th scope="col">Entraram</th>
            {Array.from({ length: colunas }, (_, indice) => (
              <th scope="col" key={indice}>
                {indice === 0 ? 'mês 0' : `+${indice}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safras.map((safra) => (
            <tr key={safra.safra} className={safra.tamanho === 0 ? 'vazia' : undefined}>
              <th scope="row">
                {safra.label}
                {safra.label === mesCorrente ? <span className="dash-tag">em curso</span> : null}
              </th>
              <td className="dash-coorte-tamanho">{safra.tamanho}</td>
              {safra.retidas.map((retidas, indice) => {
                if (retidas === null) {
                  return <td className="dash-coorte-futuro" key={indice} aria-label="mês ainda não decorrido" />;
                }
                if (safra.tamanho === 0) {
                  return (
                    <td className="dash-coorte-na" key={indice}>
                      —
                    </td>
                  );
                }
                const taxa = retidas / safra.tamanho;
                const alpha = taxa * TINTURA_MAXIMA;
                const tinta = classeDaTinta(paleta.primaria, paleta.superficie, alpha);
                return (
                  <td
                    className={`dash-coorte-celula${tinta ? ` ${tinta}` : ''}`}
                    key={indice}
                    // A cor codifica a taxa; o número continua legível para quem
                    // não distingue a intensidade.
                    style={{ background: `color-mix(in srgb, var(--color-primary) ${Math.round(alpha * 100)}%, transparent)` }}
                    title={`${retidas} de ${safra.tamanho} continuavam`}
                  >
                    {Math.round(taxa * 100)}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Mapa de calor dia da semana × hora, recortado nas horas que têm movimento. */
function MapaDeCalor({
  mapa,
  pico,
  paleta,
}: {
  mapa: Occupancy['mapa'];
  pico: Occupancy['pico'];
  paleta: { primaria: string; superficie: string };
}) {
  if (mapa.length === 0) {
    return <p className="dash-vazio">Sem check-in registrado no período.</p>;
  }

  // Mostrar as 24 horas deixaria a grade quase toda vazia e ilegível. O recorte
  // é o intervalo com movimento, com uma hora de folga de cada lado.
  const horas = mapa.map((ponto) => ponto.hora);
  const primeira = Math.max(0, Math.min(...horas) - 1);
  const ultima = Math.min(23, Math.max(...horas) + 1);
  const faixa = Array.from({ length: ultima - primeira + 1 }, (_, i) => primeira + i);
  const maior = Math.max(...mapa.map((ponto) => ponto.total), 1);

  const porCelula = new Map(mapa.map((ponto) => [`${ponto.dia}-${ponto.hora}`, ponto.total]));

  return (
    <div className="dash-tabela-scroll">
      <table className="dash-mapa">
        <thead>
          <tr>
            <th scope="col" className="dash-mapa-canto" />
            {faixa.map((hora) => (
              <th scope="col" key={hora}>
                {`${hora}`.padStart(2, '0')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DIAS_CURTOS.map((dia, indice) => (
            <tr key={dia}>
              <th scope="row">{dia}</th>
              {faixa.map((hora) => {
                const total = porCelula.get(`${indice}-${hora}`) ?? 0;
                const ePico = pico?.dia === indice && pico?.hora === hora;
                const alpha = (total / maior) * TINTURA_MAXIMA;
                const tinta = total > 0 ? classeDaTinta(paleta.primaria, paleta.superficie, alpha) : null;
                return (
                  <td
                    key={hora}
                    className={`dash-mapa-celula${ePico ? ' pico' : ''}${tinta ? ` ${tinta}` : ''}`}
                    style={{
                      background:
                        total > 0
                          ? `color-mix(in srgb, var(--color-primary) ${Math.round(alpha * 100)}%, transparent)`
                          : undefined,
                    }}
                    title={`${dia} às ${hora}h: ${total} check-in(s)`}
                  >
                    {total > 0 ? total : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

export function DashboardsView() {
  const [retencao, setRetencao] = useState<Retention | null>(null);
  const [recebiveis, setRecebiveis] = useState<Receivables | null>(null);
  const [funil, setFunil] = useState<Funnel | null>(null);
  const [ocupacao, setOcupacao] = useState<Occupancy | null>(null);
  const [carregando, setCarregando] = useState(true);
  const paleta = usePaletaDeCalor();

  // Quatro requisições em paralelo, cada uma respondendo uma pergunta inteira.
  // Falham em silêncio e independentes: um painel que não carrega não apaga os
  // outros três.
  useEffect(() => {
    void (async () => {
      try {
        const [r1, r2, r3, r4] = await Promise.all([
          fetch(`${apiUrl}/reports/retention`),
          fetch(`${apiUrl}/reports/receivables`),
          fetch(`${apiUrl}/reports/funnel`),
          fetch(`${apiUrl}/reports/occupancy`),
        ]);
        if (r1.ok) setRetencao((await r1.json()) as Retention);
        if (r2.ok) setRecebiveis((await r2.json()) as Receivables);
        if (r3.ok) setFunil((await r3.json()) as Funnel);
        if (r4.ok) setOcupacao((await r4.json()) as Occupancy);
      } catch {
        // silencioso: os blocos que carregaram continuam úteis
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  if (carregando) {
    return (
      <>
        <header className="module-page-header">
          <p className="section-label">Início</p>
          <h2 className="module-page-title">DASHBOARDS</h2>
        </header>
        <div className="reports-loading">Carregando indicadores...</div>
      </>
    );
  }

  if (!retencao && !recebiveis && !funil && !ocupacao) {
    return (
      <>
        <header className="module-page-header">
          <p className="section-label">Início</p>
          <h2 className="module-page-title">DASHBOARDS</h2>
        </header>
        <p className="dash-vazio">
          Nenhum indicador disponível. Seu perfil de acesso pode não incluir relatórios.
        </p>
      </>
    );
  }

  const churnAtual = retencao?.churn[retencao.churn.length - 1] ?? null;

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Início</p>
        <h2 className="module-page-title">DASHBOARDS</h2>
      </header>

      <div className="dash-content">
        {/* ---------------------------------------------------------------- */}
        {retencao ? (
          <>
            <div className="dash-kpis">
              <Kpi
                icon={TrendingDown}
                valor={pct(churnAtual?.taxa)}
                rotulo="Churn no mês"
                hint={
                  churnAtual && churnAtual.base > 0
                    ? `${churnAtual.saidas} de ${churnAtual.base} matrículas · mês em curso`
                    : 'sem base no início do mês'
                }
                tom={churnAtual?.taxa !== null && (churnAtual?.taxa ?? 0) > 0.05 ? 'alerta' : 'neutro'}
              />
              <Kpi
                icon={CalendarClock}
                valor={
                  retencao.permanencia.medianaDias !== null
                    ? `${Math.round(retencao.permanencia.medianaDias)} dias`
                    : '—'
                }
                rotulo="Permanência mediana"
                hint={
                  retencao.permanencia.encerradas > 0
                    ? `sobre ${retencao.permanencia.encerradas} matrícula(s) já encerrada(s)`
                    : 'nenhuma matrícula encerrou ainda'
                }
              />
              <Kpi
                icon={Coins}
                valor={
                  retencao.valorPorMatriculaEncerrada
                    ? brl(retencao.valorPorMatriculaEncerrada.media)
                    : '—'
                }
                rotulo="Valor por matrícula encerrada"
                hint={
                  retencao.valorPorMatriculaEncerrada
                    ? `o que ${retencao.valorPorMatriculaEncerrada.base} contrato(s) renderam de fato`
                    : 'nenhum contrato encerrado'
                }
              />
            </div>

            <Bloco
              titulo="Retenção por safra"
              hint="de quem entrou em cada mês, quanto continua"
            >
              {/* A instrução de leitura fica junto da tabela porque coorte é a
                  única peça desta tela que não se explica sozinha. */}
              <p className="dash-legenda">
                Cada linha é o mês de entrada. <strong>Descer uma coluna</strong> compara safras no
                mesmo ponto do contrato — é onde se vê se a casa está melhorando em segurar aluno.
                <strong> Andar numa linha</strong> mostra em que mês aquela turma começou a sumir. O
                mês 0 é o próprio mês de entrada, e não é 100% de propósito: quem desiste em duas
                semanas aparece ali.
              </p>
              <CoorteTabela
                safras={retencao.coorte.safras}
                mesCorrente={retencao.coorte.mesCorrente}
                paleta={paleta}
              />
            </Bloco>

            <Bloco titulo="Churn mês a mês" hint="saídas sobre a base do início do mês">
              <BarrasVerticais
                pontos={retencao.churn.map((ponto) => ({
                  label: ponto.label,
                  value: ponto.taxa === null ? 0 : Math.round(ponto.taxa * 100),
                  hint:
                    ponto.taxa === null
                      ? `${ponto.label}: sem base para calcular`
                      : `${ponto.label}: ${ponto.saidas} de ${ponto.base}`,
                }))}
                formatar={(valor) => `${valor}%`}
                zerado="Nenhuma saída registrada no período."
              />
            </Bloco>
          </>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {recebiveis ? (
          <>
            <div className="dash-kpis">
              <Kpi
                icon={Coins}
                valor={brl(recebiveis.aging.total)}
                rotulo="Vencido em aberto"
                hint={`${recebiveis.aging.faixas.reduce((s, f) => s + f.quantidade, 0)} parcela(s)`}
                tom={recebiveis.aging.total > 0 ? 'perigo' : 'neutro'}
              />
              <Kpi
                icon={CalendarClock}
                valor={brl(recebiveis.previsao.total)}
                rotulo="A vencer em 8 semanas"
                hint={`${recebiveis.previsao.semanas.reduce((s, w) => s + w.quantidade, 0)} parcela(s) programada(s)`}
              />
              <Kpi
                icon={Activity}
                valor={
                  recebiveis.pontualidade.atrasoMedioDias !== null
                    ? `${Math.round(recebiveis.pontualidade.atrasoMedioDias)} dias`
                    : '—'
                }
                rotulo="Atraso médio de quem paga tarde"
                hint={`${recebiveis.pontualidade.noPrazo} no prazo · ${recebiveis.pontualidade.emAtraso} em atraso (${recebiveis.pontualidade.diasAnalisados}d)`}
                tom={(recebiveis.pontualidade.atrasoMedioDias ?? 0) > 15 ? 'alerta' : 'neutro'}
              />
            </div>

            <Bloco
              titulo="Idade da inadimplência"
              hint="um total não diz o que fazer; a idade diz"
            >
              {/* Vencido ontem é lembrete no WhatsApp; vencido há quatro meses é
                  prejuízo ainda não reconhecido. A cor sobe com a faixa. */}
              <BarrasHorizontais
                vazio="Nenhuma parcela vencida em aberto."
                itens={recebiveis.aging.faixas.map((faixa, indice) => ({
                  label: faixa.label,
                  valor: faixa.total,
                  texto: brl(faixa.total),
                  hint: `${faixa.quantidade} parcela(s) · ${faixa.alunos} aluno(s)`,
                  tom: ['ok', 'alerta', 'alerta', 'perigo'][indice],
                }))}
              />
            </Bloco>

            <div className="dash-duas-colunas">
              <Bloco titulo="Previsão de caixa" hint="o que vence nas próximas 8 semanas">
                <BarrasVerticais
                  pontos={recebiveis.previsao.semanas.map((semana) => ({
                    label: semana.label,
                    value: semana.value,
                    hint: `semana de ${semana.label}: ${brl(semana.value)} em ${semana.quantidade} parcela(s)`,
                  }))}
                  formatar={(valor) => brl(valor).replace('R$', '').trim()}
                  zerado="Nenhum valor a vencer nas próximas 8 semanas."
                />
              </Bloco>

              <Bloco
                titulo="Como o dinheiro entra"
                hint={`liquidado nos últimos ${recebiveis.pontualidade.diasAnalisados} dias`}
              >
                <BarrasHorizontais
                  vazio="Nenhum recebimento no período."
                  itens={recebiveis.formasDePagamento.map((forma) => ({
                    label: forma.label,
                    valor: forma.total,
                    texto: brl(forma.total),
                    hint: `${forma.quantidade} recebimento(s)`,
                  }))}
                />
              </Bloco>
            </div>
          </>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {funil ? (
          <>
            <div className="dash-kpis">
              <Kpi icon={UserPlus} valor={String(funil.total)} rotulo="Interessados no período" hint="últimos 6 meses" />
              <Kpi
                icon={Activity}
                valor={pct(funil.taxaConversao)}
                rotulo="Viraram aluno"
                hint={`${funil.convertidos} de ${funil.total}`}
              />
              <Kpi
                icon={CalendarClock}
                valor={
                  funil.tempoAteContatoDias !== null
                    ? `${funil.tempoAteContatoDias.toFixed(1)} dias`
                    : '—'
                }
                rotulo="Até o primeiro contato"
                hint={
                  funil.total === 0
                    ? 'nenhum interessado no período'
                    : funil.semContato > 0
                      ? `${funil.semContato} nunca contatado(s)`
                      : 'todos contatados'
                }
                tom={funil.semContato > 0 ? 'alerta' : 'neutro'}
              />
            </div>

            <div className="dash-duas-colunas">
              <Bloco titulo="Conversão por origem" hint="de onde vem quem fecha">
                <BarrasHorizontais
                  vazio="Nenhum interessado registrado no período."
                  itens={funil.porOrigem.map((origem) => ({
                    label: origem.label,
                    valor: origem.leads,
                    texto: `${origem.leads} · ${pct(origem.taxa)}`,
                    hint: `${origem.convertidos} viraram aluno`,
                  }))}
                />
              </Bloco>

              <Bloco titulo="Por responsável" hint="quem fecha e quem só acumula">
                <BarrasHorizontais
                  vazio={
                    funil.total > 0
                      ? `${funil.semResponsavel} interessado(s) sem responsável definido.`
                      : 'Nenhum interessado registrado no período.'
                  }
                  itens={funil.porVendedor.map((vendedor) => ({
                    label: vendedor.label,
                    valor: vendedor.leads,
                    texto: `${vendedor.convertidos}/${vendedor.leads} · ${pct(vendedor.taxa)}`,
                  }))}
                />
              </Bloco>
            </div>

            {funil.porStatus.length > 0 ? (
              <Bloco titulo="Onde o interessado trava" hint="distribuição por estágio">
                <BarrasHorizontais
                  vazio="Sem dados."
                  itens={funil.porStatus.map((status) => ({
                    label: STATUS_LEGIVEL[status.label] ?? status.label,
                    valor: status.quantidade,
                    texto: String(status.quantidade),
                  }))}
                />
              </Bloco>
            ) : null}
          </>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {ocupacao ? (
          <>
            <Bloco
              titulo="Quando a casa enche"
              hint={`check-ins por dia e hora · últimas ${ocupacao.periodo.semanas} semanas`}
            >
              {ocupacao.pico ? (
                <p className="dash-legenda">
                  Pico em <strong>{DIAS_CURTOS[ocupacao.pico.dia]}</strong> às{' '}
                  <strong>{`${ocupacao.pico.hora}`.padStart(2, '0')}h</strong>, com{' '}
                  {ocupacao.pico.total} check-in(s). É a hora que decide escala de recepção e de
                  professor — e o horário onde uma aula nova encontra gente.
                </p>
              ) : null}
              <MapaDeCalor mapa={ocupacao.mapa} pico={ocupacao.pico} paleta={paleta} />
            </Bloco>

            <Bloco
              titulo="As aulas enchem?"
              hint={`${ocupacao.turmasNoPeriodo} turma(s) no período`}
            >
              <BarrasHorizontais
                vazio="Nenhuma turma no período."
                itens={ocupacao.atividades.map((atividade) => ({
                  label: atividade.label,
                  valor: atividade.inscritos,
                  texto:
                    atividade.ocupacao !== null
                      ? `${pct(atividade.ocupacao)} das vagas`
                      : `${atividade.inscritos} inscrito(s)`,
                  hint:
                    atividade.ocupacao === null
                      ? `${atividade.turmas} turma(s) sem capacidade cadastrada — sem vagas não há taxa`
                      : `${atividade.inscritos} de ${atividade.vagas} vagas · presença ${pct(atividade.presenca)}`,
                }))}
              />
              {ocupacao.turmasSemCapacidade > 0 ? (
                <p className="dash-nota">
                  {ocupacao.turmasSemCapacidade} turma(s) não têm capacidade cadastrada. Sem esse
                  número não existe taxa de ocupação — a linha mostra os inscritos e nada mais.
                </p>
              ) : null}
            </Bloco>
          </>
        ) : null}
      </div>
    </>
  );
}
