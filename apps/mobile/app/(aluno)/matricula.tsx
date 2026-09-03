import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../../lib/components/Screen';
import { apiGet, apiPost } from '../../lib/api/client';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';
import { formatDateDisplay } from '../../lib/utils/format';
import { estaAtivo } from '../../lib/utils/flags';

// Matrícula, cobranças e Pix — o que o aluno resolvia só pelo navegador.
//
// É a lacuna mais fora de lugar da paridade web/app: o aviso de vencimento
// chega por push NO CELULAR, e para pagar o aluno precisava abrir o navegador.
// O app do banco está aqui; o código Pix passa a estar também.

type PlanoDoAluno = {
  id: number;
  nrDiaPagamento: number | null;
  dtAdmissao: string | null;
  dtVencimento: string | null;
  dtCadastro: string | null;
  boInativo: boolean | number;
  empresa?: { id: number; dsEmpresa?: string } | null;
  plano?: {
    id: number;
    dsPlano?: string;
    frequencia?: { dsFrequencia?: string } | null;
    planoValores?: Array<{ id: number; vlVenda?: number | string | null }>;
  } | null;
};

type Cobranca = {
  id: number;
  vlPrevisto: number | string | null;
  vlPago: number | string | null;
  dtVencimento: string | null;
  dtPagamento: string | null;
  boInativo: boolean | number;
  statusPagamento?: { id: number; dsStatusPagamento: string } | null;
  alunoPlano?: { id: number; plano?: { id: number; dsPlano: string } | null } | null;
};

type Pedido = {
  id: number;
  cnTipo: 'cancelamento' | 'renovacao' | 'troca';
  cnStatus: 'pendente' | 'aprovada' | 'recusada';
  dsObservacao: string | null;
  dsResposta: string | null;
  dtCadastro: string;
  motivoCancelamento?: { id: number; dsMotivoCancelamento: string } | null;
};

type MotivoCancelamento = { id: number; dsMotivoCancelamento: string };

type Beneficio = {
  idPlanoBeneficio: number;
  descricao: string;
  limite: number;
  usadas: number;
  restantes: number;
  podeUsar: boolean;
  /** "por matrícula", "neste mês", "neste ano" */
  janela: string;
};

const NOME_DO_TIPO: Record<Pedido['cnTipo'], string> = {
  cancelamento: 'cancelamento',
  renovacao: 'renovação',
  troca: 'troca de plano',
};

type CobrancaPix = {
  codigo: string;
  valor: number;
  dtVencimento: string | null;
  beneficiario: string;
  /** 'provedor' = a confirmação é automática; 'pix_proprio' = a academia confirma. */
  origem: 'pix_proprio' | 'provedor';
  instrucao: string;
};

const dinheiro = (valor: number | string | null | undefined) => {
  if (valor === null || valor === undefined || valor === '') return '-';
  // O Decimal do Prisma chega como string ("150"); Number() antes de formatar.
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const estaPaga = (cobranca: Cobranca) =>
  (cobranca.statusPagamento?.dsStatusPagamento ?? '').toLowerCase() === 'pago';

/** Em aberto e com o vencimento já passado. */
function estaVencida(cobranca: Cobranca) {
  if (estaPaga(cobranca) || !cobranca.dtVencimento) return false;
  const vencimento = new Date(cobranca.dtVencimento);
  if (Number.isNaN(vencimento.getTime())) return false;
  vencimento.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return vencimento.getTime() < hoje.getTime();
}

export default function MatriculaScreen() {
  const t = useTokens();
  const { user } = useAuth();
  const idAluno = user?.idAluno ?? null;

  const [planos, setPlanos] = useState<PlanoDoAluno[]>([]);
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState('');

  // O Pix de UMA cobrança por vez. Não pré-carregamos a tela inteira: cada
  // código embute a chave da academia (ou cria a cobrança no provedor), e
  // gerar em massa espalharia isso sem ninguém ter pedido.
  // Pedidos de cancelamento/renovação. O aluno abre; quem decide é a academia
  // — prazo e multa são regras do contrato dela, não do aplicativo.
  const [beneficios, setBeneficios] = useState<Beneficio[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [motivos, setMotivos] = useState<MotivoCancelamento[]>([]);
  const [tipoPedido, setTipoPedido] = useState<'cancelamento' | 'renovacao' | null>(null);
  const [idMotivo, setIdMotivo] = useState<number | null>(null);
  const [observacao, setObservacao] = useState('');
  const [isEnviando, setIsEnviando] = useState(false);
  const [erroPedido, setErroPedido] = useState('');

  const [idPix, setIdPix] = useState<number | null>(null);
  const [pix, setPix] = useState<CobrancaPix | null>(null);
  const [isGerandoPix, setIsGerandoPix] = useState(false);
  const [erroPix, setErroPix] = useState('');
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    if (!idAluno) return;
    try {
      setErro('');
      const [planosDoAluno, cobrancasDoAluno] = await Promise.all([
        apiGet<PlanoDoAluno[]>(`/students/${idAluno}/related/plans`),
        apiGet<Cobranca[]>(`/students/${idAluno}/related/payments`),
      ]);
      setPlanos(planosDoAluno);
      setCobrancas(cobrancasDoAluno.filter((cobranca) => estaAtivo(cobranca.boInativo)));
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível carregar sua matrícula.');
    } finally {
      setIsLoading(false);
    }
  }, [idAluno]);

  // Separado do carregamento principal de propósito: pedido e motivos são
  // extras da tela. Se falharem, a matrícula — que é o conteúdo — continua
  // aparecendo, em vez de a tela inteira virar uma mensagem de erro.
  const carregarPedidos = useCallback(async () => {
    if (!idAluno) return;
    try {
      setPedidos(await apiGet<Pedido[]>(`/students/${idAluno}/related/plan-requests`));
    } catch {
      // silêncio proposital: ver comentário acima
    }
  }, [idAluno]);

  useEffect(() => {
    void carregar();
    void carregarPedidos();
    void (async () => {
      try {
        const dados = await apiGet<{ beneficios?: Beneficio[] }>(`/students/${idAluno}/benefits`);
        setBeneficios(dados.beneficios ?? []);
      } catch {
        // extra da tela; a matrícula continua aparecendo
      }
      try {
        setMotivos(await apiGet<MotivoCancelamento[]>('/cancellation-reasons'));
      } catch {
        // sem a lista, o pedido ainda pode ser aberto sem motivo escolhido
      }
    })();
  }, [carregar, carregarPedidos]);

  const planoAtivo = planos.find((plano) => estaAtivo(plano.boInativo)) ?? planos[0] ?? null;
  // Um pedido em aberto por vez: enquanto a academia não responde, o aluno vê o
  // estado em vez de um botão que abriria um segundo pedido igual.
  const pedidoPendente = pedidos.find((pedido) => pedido.cnStatus === 'pendente') ?? null;
  const pedidosRespondidos = pedidos.filter((pedido) => pedido.cnStatus !== 'pendente');
  const emAberto = cobrancas.filter((cobranca) => !estaPaga(cobranca));
  const vencidas = emAberto.filter(estaVencida);

  async function enviarPedido(cnTipo: 'cancelamento' | 'renovacao') {
    if (!idAluno || !planoAtivo) return;
    try {
      setIsEnviando(true);
      setErroPedido('');
      await apiPost(`/students/${idAluno}/related/plan-requests`, {
        idAlunoPlano: planoAtivo.id,
        cnTipo,
        idMotivoCancelamento: cnTipo === 'cancelamento' ? idMotivo : null,
        dsObservacao: observacao.trim() || null,
      });
      setTipoPedido(null);
      setIdMotivo(null);
      setObservacao('');
      await carregarPedidos();
    } catch (error) {
      setErroPedido(error instanceof Error ? error.message : 'Erro ao enviar o pedido.');
    } finally {
      setIsEnviando(false);
    }
  }

  async function abrirPix(cobranca: Cobranca) {
    if (!idAluno) return;

    // Segundo toque na mesma cobrança fecha o painel.
    if (idPix === cobranca.id) {
      setIdPix(null);
      setPix(null);
      setErroPix('');
      return;
    }

    setIdPix(cobranca.id);
    setPix(null);
    setErroPix('');
    setCopiado(false);
    setIsGerandoPix(true);
    try {
      // POST porque, em conta de gateway, gerar o código CRIA a cobrança no
      // provedor. É idempotente: pedir de novo devolve a mesma cobrança.
      setPix(
        await apiPost<CobrancaPix>(
          `/students/${idAluno}/related/payments/${cobranca.id}/charge`,
          {},
        ),
      );
    } catch (error) {
      // O erro fica no painel da cobrança, não no topo: é sobre aquela parcela,
      // e lá em cima o aluno não saberia de qual.
      setErroPix(error instanceof Error ? error.message : 'Não foi possível gerar o código Pix.');
    } finally {
      setIsGerandoPix(false);
    }
  }

  async function copiar() {
    if (!pix) return;
    try {
      await Clipboard.setStringAsync(pix.codigo);
      setCopiado(true);
    } catch {
      // O código continua na tela, selecionável. Não é erro de verdade — é uma
      // instrução diferente.
      setCopiado(false);
      setErroPix('Não foi possível copiar. Toque e segure no código para selecionar.');
    }
  }

  return (
    <Screen onBack={() => router.back()} sectionLabel="Conta" title="Matrícula">
      {erro ? (
        <View style={[styles.aviso, { backgroundColor: '#fdeceb', borderRadius: t.radius }]}>
          <Text style={[styles.avisoTexto, { color: t.danger }]}>{erro}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={t.brand} style={styles.carregando} />
      ) : (
        <>
          {/* --- plano --- */}
          <Text style={[styles.secao, { color: t.textSubtle }]}>PLANO</Text>
          {planoAtivo ? (
            <View
              style={[
                styles.cartao,
                { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius },
              ]}
            >
              <View style={styles.linhaTopo}>
                <Text style={[styles.plano, { color: t.text }]}>
                  {planoAtivo.plano?.dsPlano ?? 'Plano'}
                </Text>
                <View
                  style={[
                    styles.selo,
                    {
                      backgroundColor: estaAtivo(planoAtivo.boInativo) ? t.brandTintSoft : t.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.seloTexto,
                      { color: estaAtivo(planoAtivo.boInativo) ? t.brand : t.textSubtle },
                    ]}
                  >
                    {estaAtivo(planoAtivo.boInativo) ? 'Ativo' : 'Encerrado'}
                  </Text>
                </View>
              </View>

              <Dado rotulo="Unidade" valor={planoAtivo.empresa?.dsEmpresa ?? '-'} />
              <Dado
                rotulo="Desde"
                valor={formatDateDisplay(planoAtivo.dtAdmissao ?? planoAtivo.dtCadastro)}
              />
              {planoAtivo.dtVencimento ? (
                <Dado rotulo="Vence em" valor={formatDateDisplay(planoAtivo.dtVencimento)} />
              ) : null}
              <Dado
                rotulo="Dia de pagamento"
                valor={planoAtivo.nrDiaPagamento ? `Todo dia ${planoAtivo.nrDiaPagamento}` : '-'}
              />
              {planoAtivo.plano?.frequencia?.dsFrequencia ? (
                <Dado rotulo="Frequência" valor={planoAtivo.plano.frequencia.dsFrequencia} />
              ) : null}
            </View>
          ) : (
            <Vazio texto="Nenhum plano registrado." />
          )}

          {/* --- direitos do plano --- */}
          {beneficios.length > 0 ? (
            <>
              <Text style={[styles.secao, styles.secaoDistante, { color: t.textSubtle }]}>
                O QUE SEU PLANO DÁ
              </Text>
              <View style={styles.pilha}>
                {beneficios.map((beneficio) => (
                  <View
                    key={beneficio.idPlanoBeneficio}
                    style={[
                      styles.cartao,
                      { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius },
                    ]}
                  >
                    <View style={styles.linhaTopo}>
                      <View style={{ flexShrink: 1 }}>
                        <Text style={[styles.dadoValor, { color: t.text, textAlign: 'left' }]}>
                          {beneficio.descricao}
                        </Text>
                        <Text style={[styles.meta, { color: t.textSubtle }]}>{beneficio.janela}</Text>
                      </View>
                      <Text
                        style={[
                          styles.status,
                          { color: beneficio.podeUsar ? t.brand : t.textSubtle },
                        ]}
                      >
                        {beneficio.restantes} de {beneficio.limite}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
              {/* Dito porque o aluno pode achar que o app entrega: quem
                  entrega é a recepção, e o registro é dela. */}
              <Text style={[styles.meta, { color: t.textSubtle, marginTop: 8 }]}>
                A retirada é registrada pela recepção quando você recebe.
              </Text>
            </>
          ) : null}

          {/* --- cancelamento e renovação --- */}
          {planoAtivo ? (
            <>
              <Text style={[styles.secao, styles.secaoDistante, { color: t.textSubtle }]}>
                CANCELAMENTO E RENOVAÇÃO
              </Text>
              <View
                style={[
                  styles.cartao,
                  { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius },
                ]}
              >
                {pedidoPendente ? (
                  <Text style={[styles.meta, { color: t.text }]}>
                    Você já tem um pedido de{' '}
                    <Text style={styles.negrito}>{NOME_DO_TIPO[pedidoPendente.cnTipo]}</Text>
                    {' '}aguardando resposta da academia.
                  </Text>
                ) : tipoPedido ? (
                  <>
                    {tipoPedido === 'cancelamento' && motivos.length > 0 ? (
                      <>
                        <Text style={[styles.dadoRotulo, { color: t.textSubtle }]}>Motivo</Text>
                        {/* Toque em vez de lista suspensa: no celular, abrir um
                            seletor nativo para escolher entre poucas opções é
                            mais atrito do que tocar direto na escolha. */}
                        <View style={styles.motivos}>
                          <Opcao
                            ativa={idMotivo === null}
                            aoTocar={() => setIdMotivo(null)}
                            texto="Prefiro não informar"
                          />
                          {motivos.map((motivo) => (
                            <Opcao
                              ativa={idMotivo === motivo.id}
                              aoTocar={() => setIdMotivo(motivo.id)}
                              key={motivo.id}
                              texto={motivo.dsMotivoCancelamento}
                            />
                          ))}
                        </View>
                      </>
                    ) : null}

                    <Text style={[styles.dadoRotulo, { color: t.textSubtle }]}>
                      Observação (opcional)
                    </Text>
                    <TextInput
                      maxLength={500}
                      multiline
                      onChangeText={setObservacao}
                      placeholder={
                        tipoPedido === 'cancelamento'
                          ? 'Algo que a academia deveria saber'
                          : 'Alguma preferência para a renovação'
                      }
                      placeholderTextColor={t.placeholder}
                      style={[
                        styles.campo,
                        { backgroundColor: t.inputBg, borderColor: t.border, color: t.text },
                      ]}
                      value={observacao}
                    />

                    {erroPedido ? (
                      <Text style={[styles.meta, { color: t.danger }]}>{erroPedido}</Text>
                    ) : null}

                    <View style={styles.acoes}>
                      <Pressable
                        accessibilityLabel="Voltar"
                        accessibilityRole="button"
                        onPress={() => {
                          setTipoPedido(null);
                          setErroPedido('');
                        }}
                        style={({ pressed }) => [
                          styles.botao,
                          styles.acao,
                          {
                            backgroundColor: t.inputBg,
                            borderColor: t.border,
                            borderWidth: 1,
                            borderRadius: t.radius,
                            opacity: pressed ? 0.75 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.botaoTexto, { color: t.textMuted }]}>Voltar</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel="Enviar pedido"
                        accessibilityRole="button"
                        disabled={isEnviando}
                        onPress={() => void enviarPedido(tipoPedido)}
                        style={({ pressed }) => [
                          styles.botao,
                          styles.acao,
                          {
                            backgroundColor: t.brand,
                            borderRadius: t.radius,
                            opacity: pressed || isEnviando ? 0.75 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.botaoTexto, { color: '#ffffff' }]}>
                          {isEnviando ? 'Enviando...' : 'Enviar pedido'}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <View style={styles.acoes}>
                    <Pressable
                      accessibilityLabel="Quero renovar"
                      accessibilityRole="button"
                      onPress={() => setTipoPedido('renovacao')}
                      style={({ pressed }) => [
                        styles.botao,
                        styles.acao,
                        {
                          backgroundColor: t.brand,
                          borderRadius: t.radius,
                          opacity: pressed ? 0.75 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.botaoTexto, { color: '#ffffff' }]}>Quero renovar</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Quero cancelar"
                      accessibilityRole="button"
                      onPress={() => setTipoPedido('cancelamento')}
                      style={({ pressed }) => [
                        styles.botao,
                        styles.acao,
                        {
                          backgroundColor: t.inputBg,
                          borderColor: t.border,
                          borderWidth: 1,
                          borderRadius: t.radius,
                          opacity: pressed ? 0.75 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.botaoTexto, { color: t.textMuted }]}>
                        Quero cancelar
                      </Text>
                    </Pressable>
                  </View>
                )}

                {/* O pedido não cancela sozinho: quem encerra a matrícula é a
                    academia, porque prazo e multa são regras do contrato dela. */}
                <Text style={[styles.meta, { color: t.textSubtle }]}>
                  O pedido vai para a recepção responder. Nada muda na sua matrícula até lá.
                </Text>

                {pedidosRespondidos.length > 0 ? (
                  <View style={styles.historico}>
                    {pedidosRespondidos.map((pedido) => (
                      <View key={pedido.id} style={styles.historicoLinha}>
                        <Text style={[styles.meta, { color: t.textSubtle, flexShrink: 1 }]}>
                          {NOME_DO_TIPO[pedido.cnTipo]} · {formatDateDisplay(pedido.dtCadastro)}
                          {pedido.dsResposta ? ` — ${pedido.dsResposta}` : ''}
                        </Text>
                        <Text
                          style={[
                            styles.status,
                            { color: pedido.cnStatus === 'aprovada' ? t.brand : t.danger },
                          ]}
                        >
                          {pedido.cnStatus}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </>
          ) : null}

          {/* --- cobranças --- */}
          <View style={styles.cabecalhoCobrancas}>
            <Text style={[styles.secao, { color: t.textSubtle }]}>COBRANÇAS</Text>
            <Situacao emAberto={emAberto.length} vencidas={vencidas.length} />
          </View>

          {cobrancas.length === 0 ? (
            <Vazio texto="Nenhuma cobrança registrada." />
          ) : (
            <View style={styles.pilha}>
              {cobrancas.map((cobranca) => {
                const paga = estaPaga(cobranca);
                const vencida = estaVencida(cobranca);
                const corSelo = paga ? t.brand : vencida ? t.danger : '#b45309';

                return (
                  <View
                    key={cobranca.id}
                    style={[
                      styles.cartao,
                      { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius },
                    ]}
                  >
                    <View style={styles.linhaTopo}>
                      <View>
                        <Text style={[styles.valor, { color: t.text }]}>
                          {dinheiro(paga ? cobranca.vlPago ?? cobranca.vlPrevisto : cobranca.vlPrevisto)}
                        </Text>
                        <Text style={[styles.meta, { color: t.textSubtle }]}>
                          {cobranca.dtVencimento
                            ? `Vence ${formatDateDisplay(cobranca.dtVencimento)}`
                            : 'Vencimento a definir'}
                          {cobranca.alunoPlano?.plano?.dsPlano
                            ? ` · ${cobranca.alunoPlano.plano.dsPlano}`
                            : ''}
                        </Text>
                      </View>
                      <Text style={[styles.status, { color: corSelo }]}>
                        {paga
                          ? 'Pago'
                          : vencida
                            ? 'Vencido'
                            : cobranca.statusPagamento?.dsStatusPagamento ?? 'Em aberto'}
                      </Text>
                    </View>

                    {/* Só em cobrança aberta: gerar Pix de parcela quitada
                        convidaria ao pagamento em dobro, e estorno de Pix
                        depende da boa vontade de quem recebeu. */}
                    {!paga ? (
                      <Pressable
                        accessibilityLabel={
                          idPix === cobranca.id ? 'Fechar código Pix' : 'Pagar com Pix'
                        }
                        accessibilityRole="button"
                        onPress={() => void abrirPix(cobranca)}
                        style={({ pressed }) => [
                          styles.botao,
                          {
                            backgroundColor: idPix === cobranca.id ? t.inputBg : t.brand,
                            borderColor: t.border,
                            borderRadius: t.radius,
                            opacity: pressed ? 0.75 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.botaoTexto,
                            { color: idPix === cobranca.id ? t.textMuted : '#ffffff' },
                          ]}
                        >
                          {idPix === cobranca.id ? 'Fechar' : 'Pagar com Pix'}
                        </Text>
                      </Pressable>
                    ) : null}

                    {idPix === cobranca.id ? (
                      <View
                        style={[
                          styles.painelPix,
                          { backgroundColor: t.inputBg, borderRadius: t.radius },
                        ]}
                      >
                        {isGerandoPix ? (
                          <Text style={[styles.meta, { color: t.textSubtle }]}>
                            Gerando código...
                          </Text>
                        ) : pix ? (
                          /* O código vem ANTES do erro de propósito: falha ao
                             copiar é um aviso ao lado dele, não no lugar dele —
                             a mensagem manda selecionar à mão, e esconder o
                             código tornaria a instrução impossível. */
                          <>
                            <Text style={[styles.meta, { color: t.textSubtle }]}>
                              {dinheiro(pix.valor)} para {pix.beneficiario}
                            </Text>
                            <Text
                              selectable
                              style={[
                                styles.codigo,
                                { color: t.text, backgroundColor: t.surface, borderColor: t.border },
                              ]}
                            >
                              {pix.codigo}
                            </Text>
                            <Pressable
                              accessibilityLabel="Copiar código Pix"
                              accessibilityRole="button"
                              onPress={() => void copiar()}
                              style={({ pressed }) => [
                                styles.botao,
                                {
                                  backgroundColor: copiado ? t.brandTintSoft : t.brand,
                                  borderRadius: t.radius,
                                  opacity: pressed ? 0.75 : 1,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.botaoTexto,
                                  { color: copiado ? t.brand : '#ffffff' },
                                ]}
                              >
                                {copiado ? 'Copiado' : 'Copiar código'}
                              </Text>
                            </Pressable>
                            {erroPix ? (
                              <Text style={[styles.meta, { color: t.danger }]}>{erroPix}</Text>
                            ) : null}
                            <Text style={[styles.meta, { color: t.textSubtle }]}>
                              {pix.instrucao}
                              {/* Dito ao aluno porque muda o que ele deve
                                  esperar: com gateway o acesso libera sozinho;
                                  sem, ele pode precisar avisar a recepção. */}
                              {pix.origem === 'provedor' ? (
                                <Text style={{ color: t.text }}> Não precisa avisar ninguém.</Text>
                              ) : null}
                            </Text>
                          </>
                        ) : erroPix ? (
                          <Text style={[styles.meta, { color: t.danger }]}>{erroPix}</Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

/** Resumo em uma palavra: é o que o aluno quer saber antes de ler a lista. */
function Situacao({ emAberto, vencidas }: { emAberto: number; vencidas: number }) {
  const t = useTokens();
  if (vencidas > 0) {
    return (
      <Text style={[styles.resumo, { color: t.danger }]}>
        {vencidas === 1 ? '1 vencida' : `${vencidas} vencidas`}
      </Text>
    );
  }
  if (emAberto > 0) {
    return (
      <Text style={[styles.resumo, { color: '#b45309' }]}>
        {emAberto === 1 ? '1 em aberto' : `${emAberto} em aberto`}
      </Text>
    );
  }
  return <Text style={[styles.resumo, { color: t.brand }]}>Em dia</Text>;
}

/** Escolha única por toque — para poucas opções, melhor que lista suspensa. */
function Opcao({ ativa, aoTocar, texto }: { ativa: boolean; aoTocar: () => void; texto: string }) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityLabel={texto}
      accessibilityRole="radio"
      accessibilityState={{ selected: ativa }}
      onPress={aoTocar}
      style={({ pressed }) => [
        styles.opcao,
        {
          backgroundColor: ativa ? t.brandTintSoft : t.inputBg,
          borderColor: ativa ? t.brand : t.border,
          borderRadius: t.radius,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={[styles.opcaoTexto, { color: ativa ? t.brand : t.textMuted }]}>{texto}</Text>
    </Pressable>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  const t = useTokens();
  return (
    <View style={styles.dado}>
      <Text style={[styles.dadoRotulo, { color: t.textSubtle }]}>{rotulo}</Text>
      <Text style={[styles.dadoValor, { color: t.text }]}>{valor}</Text>
    </View>
  );
}

function Vazio({ texto }: { texto: string }) {
  const t = useTokens();
  return <Text style={[styles.vazio, { color: t.textSubtle }]}>{texto}</Text>;
}

const styles = StyleSheet.create({
  carregando: { marginTop: 32 },
  aviso: { padding: 12, marginBottom: 12 },
  avisoTexto: { fontSize: 14, fontWeight: '600' },
  secao: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  cabecalhoCobrancas: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  resumo: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  pilha: { gap: 10 },
  cartao: { borderWidth: 1, padding: 14, gap: 6 },
  linhaTopo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  plano: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  selo: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  seloTexto: { fontSize: 11, fontWeight: '700' },
  valor: { fontSize: 17, fontWeight: '700' },
  meta: { fontSize: 13, lineHeight: 19 },
  status: { fontSize: 12, fontWeight: '700' },
  dado: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  dadoRotulo: { fontSize: 13 },
  dadoValor: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  botao: { paddingVertical: 10, alignItems: 'center', marginTop: 6 },
  botaoTexto: { fontSize: 14, fontWeight: '700' },
  painelPix: { padding: 12, marginTop: 8, gap: 8 },
  codigo: {
    fontSize: 12,
    lineHeight: 18,
    padding: 10,
    borderWidth: 1,
    borderRadius: 6,
    fontFamily: 'monospace',
  },
  vazio: { fontSize: 14, paddingVertical: 8 },
  secaoDistante: { marginTop: 24 },
  negrito: { fontWeight: '700' },
  motivos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  opcao: { paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1 },
  opcaoTexto: { fontSize: 13, fontWeight: '600' },
  campo: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  acoes: { flexDirection: 'row', gap: 8 },
  acao: { flex: 1 },
  historico: { gap: 6, marginTop: 4 },
  historicoLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
});
