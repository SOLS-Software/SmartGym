import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../lib/components/Screen';
import { apiGet } from '../../lib/api/client';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';
import { formatDateDisplay } from '../../lib/utils/format';

// Extrato de pontos do aluno.
//
// Fidelidade que o aluno não vê no bolso não muda comportamento: os pontos já
// eram creditados no check-in e trocados no balcão, mas só a equipe enxergava
// o saldo. Aqui ele vê quanto tem e de onde veio cada ponto.

type Saldo = { idEmpresa: number; dsEmpresa: string; qtDisponivel: number };

type Lancamento = {
  id: number;
  idEmpresa: number;
  qtPontos: number;
  qtDisponivel: number;
  dsHistorico: string | null;
  dtCadastro: string;
  empresa: { id: number; dsEmpresa: string } | null;
  pontuacao: { id: number; dsPontuacao: string } | null;
  produtoMovimentacao: { id: number; produto: { id: number; dsProduto: string } | null } | null;
  alunoCheckIn: { id: number; dtCadastro: string } | null;
};

/** De onde veio (ou para onde foi) o lançamento, em uma linha. */
function origemDe(lancamento: Lancamento) {
  if (lancamento.produtoMovimentacao?.produto?.dsProduto) {
    return `Resgate · ${lancamento.produtoMovimentacao.produto.dsProduto}`;
  }
  if (lancamento.pontuacao?.dsPontuacao) return lancamento.pontuacao.dsPontuacao;
  if (lancamento.alunoCheckIn) return 'Check-in na academia';
  return lancamento.dsHistorico ?? 'Lançamento';
}

export default function PontosScreen() {
  const t = useTokens();
  const { user } = useAuth();
  const idAluno = user?.idAluno ?? null;

  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    if (!idAluno) return;
    try {
      setErro('');
      const dados = await apiGet<{ saldos: Saldo[]; lancamentos: Lancamento[] }>(
        `/students/${idAluno}/related/points`,
      );
      setSaldos(dados.saldos);
      setLancamentos(dados.lancamentos);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível carregar seus pontos.');
    } finally {
      setIsLoading(false);
    }
  }, [idAluno]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <Screen onBack={() => router.back()} sectionLabel="Conta" title="Meus pontos">
      {erro ? (
        <View style={[styles.aviso, { backgroundColor: '#fdeceb', borderRadius: t.radius }]}>
          <Text style={[styles.avisoTexto, { color: t.danger }]}>{erro}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={t.brand} style={styles.carregando} />
      ) : lancamentos.length === 0 && saldos.length === 0 ? (
        <Text style={[styles.vazio, { color: t.textSubtle }]}>
          Você ainda não tem pontos. Eles entram a cada treino registrado na catraca ou na recepção.
        </Text>
      ) : (
        <>
          <View style={styles.saldos}>
            {saldos.map((saldo) => (
              <View
                key={saldo.idEmpresa}
                style={[
                  styles.saldo,
                  { backgroundColor: t.brandTintFaint, borderColor: t.brand, borderRadius: t.radius },
                ]}
              >
                <Text style={[styles.saldoNumero, { color: t.brand }]}>{saldo.qtDisponivel}</Text>
                <Text style={[styles.saldoRotulo, { color: t.textMuted }]}>
                  {saldos.length > 1 ? saldo.dsEmpresa : 'pontos disponíveis'}
                </Text>
              </View>
            ))}
          </View>

          <Text style={[styles.secao, { color: t.textSubtle }]}>EXTRATO</Text>
          <View style={styles.pilha}>
            {lancamentos.map((lancamento) => {
              const credito = lancamento.qtPontos >= 0;
              return (
                <View
                  key={lancamento.id}
                  style={[
                    styles.linha,
                    { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius },
                  ]}
                >
                  <View style={styles.linhaTexto}>
                    <Text style={[styles.origem, { color: t.text }]}>{origemDe(lancamento)}</Text>
                    <Text style={[styles.meta, { color: t.textSubtle }]}>
                      {formatDateDisplay(lancamento.dtCadastro)}
                      {saldos.length > 1 && lancamento.empresa
                        ? ` · ${lancamento.empresa.dsEmpresa}`
                        : ''}
                    </Text>
                  </View>
                  {/* O sinal fica no número, não numa cor só: quem não
                      distingue as cores continua lendo -30 e +10. */}
                  <Text style={[styles.pontos, { color: credito ? t.brand : t.danger }]}>
                    {credito ? '+' : ''}
                    {lancamento.qtPontos}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* O extrato é append-only: correção se faz com lançamento contrário,
              como em qualquer livro-caixa. Dizer isso evita o "sumiu um ponto". */}
          <Text style={[styles.rodape, { color: t.textSubtle }]}>
            Cada linha guarda o saldo que existia depois dela. Correções aparecem como um novo
            lançamento, nunca apagando o anterior.
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  carregando: { marginTop: 32 },
  aviso: { padding: 12, marginBottom: 12 },
  avisoTexto: { fontSize: 14, fontWeight: '600' },
  vazio: { fontSize: 14, lineHeight: 20, paddingVertical: 8 },
  saldos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  saldo: { borderWidth: 1, paddingVertical: 14, paddingHorizontal: 18, flexGrow: 1 },
  saldoNumero: { fontSize: 30, fontWeight: '800' },
  saldoRotulo: { fontSize: 12, fontWeight: '600' },
  secao: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  pilha: { gap: 8 },
  linha: {
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  linhaTexto: { flexShrink: 1, gap: 2 },
  origem: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 12 },
  pontos: { fontSize: 16, fontWeight: '800' },
  rodape: { fontSize: 12, lineHeight: 18, marginTop: 16 },
});
