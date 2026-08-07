import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  bloquearSessao,
  desbloquearToken,
  SessaoBloqueadaError,
  sessaoTrancada,
  travaBiometricaAtiva,
} from '../api/client';
import { limparInatividade, passouDaInatividade, registrarSaida } from '../auth/travaSessao';
import { useAuth } from '../contexts/AuthContext';
import { useTokens } from '../theme/tokens';

type TravaSessaoProps = { children: React.ReactNode };

/**
 * Envolve a área logada. Quando a trava biométrica está ligada e o app passou
 * tempo demais em segundo plano, esconde o conteúdo até o usuário se
 * identificar.
 *
 * A biometria em si não é pedida aqui: quem pede é o Keychain/Keystore ao ler
 * o token protegido em getAuthToken(). Esta tela só descarta o token da memória
 * e provoca a releitura — assim não existe caminho em que a UI "aprova" o
 * acesso sem o sistema ter aprovado antes.
 */
export function TravaSessao({ children }: TravaSessaoProps) {
  const t = useTokens();
  const { signOut } = useAuth();
  const [travada, setTravada] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [desbloqueando, setDesbloqueando] = useState(false);
  const [aviso, setAviso] = useState('');
  const estadoAnterior = useRef(AppState.currentState);

  const avaliar = useCallback(async () => {
    if (!(await travaBiometricaAtiva())) {
      setTravada(false);
      return;
    }
    // Duas razões para trancar: passou do tempo fora, ou o processo foi morto
    // em segundo plano e o token nunca foi aberto nesta execução (o cache de
    // memória some junto com o processo).
    if ((await passouDaInatividade()) || (await sessaoTrancada())) {
      bloquearSessao();
      setTravada(true);
    }
  }, []);

  // Avaliação no primeiro render: cobre o app aberto do zero depois de o
  // sistema ter matado o processo em segundo plano.
  useEffect(() => {
    void (async () => {
      await avaliar();
      setVerificando(false);
    })();
  }, [avaliar]);

  useEffect(() => {
    const inscricao = AppState.addEventListener('change', (proximo) => {
      const anterior = estadoAnterior.current;
      estadoAnterior.current = proximo;

      if (proximo.match(/inactive|background/)) {
        void registrarSaida();
        return;
      }
      if (proximo === 'active' && anterior.match(/inactive|background/)) {
        void avaliar();
      }
    });
    return () => inscricao.remove();
  }, [avaliar]);

  const desbloquear = useCallback(async () => {
    setDesbloqueando(true);
    setAviso('');
    try {
      // Dispara o prompt do sistema ao reler o token protegido.
      const token = await desbloquearToken();
      if (!token) {
        await signOut();
        return;
      }
      await limparInatividade();
      setTravada(false);
    } catch (erro) {
      if (erro instanceof SessaoBloqueadaError && erro.causa === 'chave-invalidada') {
        // Biometria do aparelho mudou: o sistema descarta a chave de propósito.
        // Não há como recuperar o token — só refazendo o login por senha.
        setAviso('A biometria do aparelho mudou. Entre com sua senha para continuar.');
        await signOut();
        return;
      }
      setAviso('Não foi possível confirmar. Tente de novo ou entre com sua senha.');
    } finally {
      setDesbloqueando(false);
    }
  }, [signOut]);

  if (verificando) {
    return <View style={[styles.cheio, { backgroundColor: t.bg }]} />;
  }

  if (!travada) return <>{children}</>;

  return (
    <SafeAreaView style={[styles.cheio, styles.centro, { backgroundColor: t.bg }]}>
      <Text style={styles.emoji}>🔒</Text>
      <Text style={[styles.titulo, { color: t.text }]}>Sessão bloqueada</Text>
      <Text style={[styles.texto, { color: t.textMuted }]}>
        Você ficou um tempo fora do app. Confirme que é você para continuar.
      </Text>

      {aviso ? <Text style={[styles.aviso, { color: t.danger }]}>{aviso}</Text> : null}

      <Pressable
        accessibilityLabel="Desbloquear"
        accessibilityRole="button"
        accessibilityState={{ disabled: desbloqueando, busy: desbloqueando }}
        disabled={desbloqueando}
        onPress={() => void desbloquear()}
        style={({ pressed }) => [
          styles.botao,
          {
            backgroundColor: t.brand,
            borderRadius: t.radius,
            opacity: desbloqueando ? 0.6 : pressed ? 0.85 : 1,
          },
        ]}
      >
        {desbloqueando ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.botaoTexto}>Desbloquear</Text>
        )}
      </Pressable>

      <Pressable
        accessibilityLabel="Entrar com senha"
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={styles.secundario}
      >
        <Text style={[styles.secundarioTexto, { color: t.textSubtle }]}>Entrar com senha</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cheio: { flex: 1 },
  centro: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  emoji: { fontSize: 42 },
  titulo: { fontSize: 20, fontWeight: '800' },
  texto: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  aviso: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  botao: { marginTop: 14, paddingHorizontal: 28, paddingVertical: 13, minWidth: 190, alignItems: 'center' },
  botaoTexto: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  secundario: { marginTop: 6, padding: 8 },
  secundarioTexto: { fontSize: 14, fontWeight: '600' },
});
