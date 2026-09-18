import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../lib/components/Screen';
import { apiGet, apiPost } from '../../lib/api/client';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';
import { formatDateDisplay } from '../../lib/utils/format';

// Ponto do próprio funcionário.
//
// É a porta de entrada da equipe no app porque /time-clock/me é a única rota
// que não depende de perfil de acesso: quem foi contratado ontem consegue
// registrar que chegou hoje, sem alguém ter que lembrar de dar permissão.
//
// QUEM DECIDE SE É ENTRADA OU SAÍDA É O SERVIDOR. A tela mostra `proximaBatida`
// só para a pessoa saber o que o botão vai gravar; se o botão mandasse o tipo,
// dois toques em sequência gravariam duas entradas seguidas.

type Batida = { id: number; cnTipo: 'entrada' | 'saida'; dtRegistro: string };

type Dia = {
  dia: string;
  batidas: Batida[];
  minutos: number;
  aberto: boolean;
  inconsistente: boolean;
};

type Espelho = {
  proximaBatida: 'entrada' | 'saida';
  ultimaBatida: Batida | null;
  totalFormatado: string;
  diasTrabalhados: number;
  dias: Dia[];
};

function formatHora(valor: string) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '--:--';
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatMinutos(minutos: number) {
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}`;
}

export default function PontoScreen() {
  const t = useTokens();
  const { user, signOut } = useAuth();

  const [espelho, setEspelho] = useState<Espelho | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBatendo, setIsBatendo] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    try {
      setErro('');
      setEspelho(await apiGet<Espelho>('/time-clock/me'));
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível carregar seu ponto.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function baterPonto() {
    if (isBatendo) return;
    setIsBatendo(true);
    setAviso('');
    setErro('');
    try {
      // A filial não vai no corpo: o servidor usa a do funcionário. Deixar a
      // tela escolher abriria espaço para bater ponto na unidade errada.
      const registro = await apiPost<Batida & { repetida: boolean }>('/time-clock/me', {});
      const hora = formatHora(registro.dtRegistro);
      setAviso(
        registro.repetida
          ? 'Esta batida já tinha sido registrada agora há pouco.'
          : registro.cnTipo === 'entrada'
            ? `Entrada registrada às ${hora}.`
            : `Saída registrada às ${hora}.`,
      );
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível registrar o ponto.');
    } finally {
      setIsBatendo(false);
    }
  }

  async function sair() {
    await signOut();
    router.replace('/login');
  }

  const proxima = espelho?.proximaBatida ?? 'entrada';
  const hoje = espelho?.dias?.[espelho.dias.length - 1] ?? null;

  return (
    <Screen sectionLabel="Equipe" title={user?.name ?? 'Meu ponto'}>
      {erro ? (
        <View style={[styles.aviso, { backgroundColor: '#fdeceb', borderRadius: t.radius }]}>
          <Text style={[styles.avisoTexto, { color: t.danger }]}>{erro}</Text>
        </View>
      ) : null}

      {aviso ? (
        <View style={[styles.aviso, { backgroundColor: t.brandTintSoft, borderRadius: t.radius }]}>
          <Text style={[styles.avisoTexto, { color: t.text }]}>{aviso}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={t.brand} style={styles.carregando} />
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            disabled={isBatendo}
            onPress={baterPonto}
            style={[
              styles.botao,
              {
                backgroundColor: proxima === 'entrada' ? t.brand : t.danger,
                borderRadius: t.radius,
                opacity: isBatendo ? 0.6 : 1,
              },
            ]}
          >
            <Text style={styles.botaoTexto}>
              {isBatendo
                ? 'Registrando...'
                : proxima === 'entrada'
                  ? 'Registrar entrada'
                  : 'Registrar saída'}
            </Text>
          </Pressable>

          <Text style={[styles.ultima, { color: t.textSubtle }]}>
            {espelho?.ultimaBatida
              ? `Última batida hoje: ${espelho.ultimaBatida.cnTipo === 'entrada' ? 'entrada' : 'saída'} às ${formatHora(espelho.ultimaBatida.dtRegistro)}`
              : 'Nenhuma batida hoje ainda.'}
          </Text>

          <View
            style={[
              styles.cartao,
              { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius },
            ]}
          >
            <Text style={[styles.cartaoTitulo, { color: t.textMuted }]}>NO MÊS</Text>
            <Text style={[styles.total, { color: t.text }]}>
              {espelho?.totalFormatado ?? '0h00'}
            </Text>
            <Text style={[styles.cartaoRodape, { color: t.textSubtle }]}>
              {espelho?.diasTrabalhados ?? 0} dia(s) com registro
            </Text>
          </View>

          {hoje ? (
            <View
              style={[
                styles.cartao,
                { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius },
              ]}
            >
              <Text style={[styles.cartaoTitulo, { color: t.textMuted }]}>
                {formatDateDisplay(hoje.dia)}
              </Text>
              {hoje.batidas.map((batida) => (
                <View key={batida.id} style={styles.linha}>
                  <Text style={[styles.linhaTipo, { color: t.text }]}>
                    {batida.cnTipo === 'entrada' ? 'Entrada' : 'Saída'}
                  </Text>
                  <Text style={[styles.linhaHora, { color: t.textMuted }]}>
                    {formatHora(batida.dtRegistro)}
                  </Text>
                </View>
              ))}
              <Text style={[styles.cartaoRodape, { color: t.textSubtle }]}>
                {formatMinutos(hoje.minutos)}
                {hoje.aberto ? ' · jornada em aberto' : ''}
                {/* Saída sem entrada antes dela: batida esquecida. A correção é
                    do gerente, pelo painel — aqui só se avisa, para a pessoa
                    não descobrir o furo no fechamento do mês. */}
                {hoje.inconsistente ? ' · há batida faltando, fale com o gerente' : ''}
              </Text>
            </View>
          ) : null}

          <Pressable accessibilityRole="button" onPress={sair} style={styles.sair}>
            <Text style={[styles.sairTexto, { color: t.danger }]}>Sair da conta</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  aviso: { padding: 12, marginBottom: 12 },
  avisoTexto: { fontSize: 14 },
  carregando: { marginTop: 32 },
  botao: { paddingVertical: 20, alignItems: 'center', marginBottom: 12 },
  botaoTexto: { color: '#fff', fontSize: 18, fontWeight: '700' },
  ultima: { fontSize: 13, marginBottom: 20, textAlign: 'center' },
  cartao: { borderWidth: 1, padding: 16, marginBottom: 12 },
  cartaoTitulo: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  cartaoRodape: { fontSize: 12, marginTop: 8 },
  total: { fontSize: 28, fontWeight: '700' },
  linha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  linhaTipo: { fontSize: 15 },
  linhaHora: { fontSize: 15, fontWeight: '600' },
  sair: { marginTop: 24, alignItems: 'center', paddingVertical: 12 },
  sairTexto: { fontSize: 15, fontWeight: '600' },
});
