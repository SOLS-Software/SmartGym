import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../lib/components/Screen';
import { apiGet } from '../../lib/api/client';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';
import { formatDateDisplay } from '../../lib/utils/format';

// Avaliação física do aluno: o que mudou desde a última medida.
//
// Quem avalia é o professor (a escrita fica na web); aqui o aluno só lê. É o
// dado que responde "está adiantando?", e ele estava só no navegador.

type Avaliacao = {
  id: number;
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
  funcionario: { id: number; nmFuncionario: string } | null;
};

type ChaveMedida = Exclude<
  keyof Avaliacao,
  'id' | 'dtAvaliacao' | 'dtCadastro' | 'dsObservacao' | 'funcionario' | 'vlAltura'
>;

type Medida = {
  chave: ChaveMedida;
  rotulo: string;
  unidade: string;
  /** Direção que representa progresso — usada só para colorir a variação. */
  melhorQuando: 'baixa' | 'sobe' | 'neutro';
};

const MEDIDAS: Medida[] = [
  { chave: 'vlPeso', rotulo: 'Peso', unidade: 'kg', melhorQuando: 'neutro' },
  { chave: 'vlPercentualGordura', rotulo: '% de gordura', unidade: '%', melhorQuando: 'baixa' },
  { chave: 'vlMassaMagra', rotulo: 'Massa magra', unidade: 'kg', melhorQuando: 'sobe' },
  { chave: 'vlCircCintura', rotulo: 'Cintura', unidade: 'cm', melhorQuando: 'baixa' },
  { chave: 'vlCircPeitoral', rotulo: 'Peitoral', unidade: 'cm', melhorQuando: 'neutro' },
  { chave: 'vlCircQuadril', rotulo: 'Quadril', unidade: 'cm', melhorQuando: 'neutro' },
  { chave: 'vlCircBraco', rotulo: 'Braço', unidade: 'cm', melhorQuando: 'sobe' },
  { chave: 'vlCircCoxa', rotulo: 'Coxa', unidade: 'cm', melhorQuando: 'sobe' },
];

/** Zero aqui é "não mediram", não "mediu zero" — o formulário deixa em branco. */
function numeroDe(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero === 0) return null;
  return numero;
}

const arredonda = (valor: number) =>
  Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace('.', ',');

export default function EvolucaoScreen() {
  const t = useTokens();
  const { user } = useAuth();
  const idAluno = user?.idAluno ?? null;

  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    if (!idAluno) return;
    try {
      setErro('');
      const lista = await apiGet<Avaliacao[]>(`/students/${idAluno}/related/evolutions`);
      // Mais recente primeiro: é a medida que o aluno quer ver ao abrir.
      setAvaliacoes(
        [...lista].sort(
          (a, b) =>
            new Date(b.dtAvaliacao ?? b.dtCadastro).getTime() -
            new Date(a.dtAvaliacao ?? a.dtCadastro).getTime(),
        ),
      );
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível carregar sua evolução.');
    } finally {
      setIsLoading(false);
    }
  }, [idAluno]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const atual = avaliacoes[0] ?? null;
  const anterior = avaliacoes[1] ?? null;

  return (
    <Screen onBack={() => router.back()} sectionLabel="Conta" title="Minha evolução">
      {erro ? (
        <View style={[styles.aviso, { backgroundColor: '#fdeceb', borderRadius: t.radius }]}>
          <Text style={[styles.avisoTexto, { color: t.danger }]}>{erro}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={t.brand} style={styles.carregando} />
      ) : !atual ? (
        <Text style={[styles.vazio, { color: t.textSubtle }]}>
          Você ainda não tem avaliação física registrada. Fale com seu professor para marcar a
          primeira.
        </Text>
      ) : (
        <>
          <Text style={[styles.data, { color: t.text }]}>
            Avaliação de {formatDateDisplay(atual.dtAvaliacao ?? atual.dtCadastro)}
          </Text>
          <Text style={[styles.meta, { color: t.textSubtle }]}>
            {atual.funcionario?.nmFuncionario
              ? `Por ${atual.funcionario.nmFuncionario}`
              : 'Profissional não informado'}
            {anterior
              ? ` · comparado com ${formatDateDisplay(anterior.dtAvaliacao ?? anterior.dtCadastro)}`
              : ' · primeira medida'}
          </Text>

          <View style={styles.medidas}>
            {MEDIDAS.map((medida) => {
              const valor = numeroDe(atual[medida.chave]);
              if (valor === null) return null;
              const antes = anterior ? numeroDe(anterior[medida.chave]) : null;
              const variacao = antes === null ? null : Number((valor - antes).toFixed(1));

              // Sem direção definida (peso, por exemplo), a variação é
              // informação, não elogio nem alerta: fica neutra.
              const cor =
                variacao === null || variacao === 0 || medida.melhorQuando === 'neutro'
                  ? t.textSubtle
                  : (variacao > 0) === (medida.melhorQuando === 'sobe')
                    ? t.brand
                    : t.danger;

              return (
                <View
                  key={medida.chave}
                  style={[
                    styles.medida,
                    { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius },
                  ]}
                >
                  <Text style={[styles.medidaRotulo, { color: t.textSubtle }]}>{medida.rotulo}</Text>
                  <Text style={[styles.medidaValor, { color: t.text }]}>
                    {arredonda(valor)}
                    <Text style={styles.unidade}> {medida.unidade}</Text>
                  </Text>
                  {variacao !== null ? (
                    <Text style={[styles.variacao, { color: cor }]}>
                      {variacao > 0 ? '+' : ''}
                      {arredonda(variacao)} {medida.unidade}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>

          {atual.dsObservacao ? (
            <View
              style={[
                styles.observacao,
                { backgroundColor: t.inputBg, borderColor: t.border, borderRadius: t.radius },
              ]}
            >
              <Text style={[styles.medidaRotulo, { color: t.textSubtle }]}>Observação</Text>
              <Text style={[styles.meta, { color: t.text }]}>{atual.dsObservacao}</Text>
            </View>
          ) : null}

          {avaliacoes.length > 1 ? (
            <>
              <Text style={[styles.secao, { color: t.textSubtle }]}>AVALIAÇÕES ANTERIORES</Text>
              <View style={styles.pilha}>
                {avaliacoes.slice(1).map((avaliacao) => (
                  <View
                    key={avaliacao.id}
                    style={[
                      styles.historico,
                      { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius },
                    ]}
                  >
                    <Text style={[styles.medidaValor, { color: t.text }]}>
                      {formatDateDisplay(avaliacao.dtAvaliacao ?? avaliacao.dtCadastro)}
                    </Text>
                    <Text style={[styles.meta, { color: t.textSubtle }]}>
                      {MEDIDAS.map((medida) => {
                        const valor = numeroDe(avaliacao[medida.chave]);
                        return valor === null
                          ? null
                          : `${medida.rotulo} ${arredonda(valor)}${medida.unidade}`;
                      })
                        .filter(Boolean)
                        .join(' · ') || 'Sem medidas registradas'}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
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
  data: { fontSize: 17, fontWeight: '800' },
  meta: { fontSize: 13, lineHeight: 19 },
  medidas: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  medida: { borderWidth: 1, padding: 12, gap: 2, flexGrow: 1, flexBasis: '45%' },
  medidaRotulo: { fontSize: 11, fontWeight: '700' },
  medidaValor: { fontSize: 18, fontWeight: '800' },
  unidade: { fontSize: 12, fontWeight: '600' },
  variacao: { fontSize: 12, fontWeight: '700' },
  observacao: { borderWidth: 1, padding: 12, gap: 4, marginTop: 12 },
  secao: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 24, marginBottom: 8 },
  pilha: { gap: 8 },
  historico: { borderWidth: 1, padding: 12, gap: 2 },
});
