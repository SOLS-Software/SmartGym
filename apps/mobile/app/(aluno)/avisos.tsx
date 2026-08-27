import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../lib/components/Screen';
import { apiGet, apiPost } from '../../lib/api/client';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';

// Avisos do aluno — o destino do push.
//
// Sem esta tela o push não teria para onde levar: tocar na notificação abriria
// o app na home e o aluno teria que adivinhar o que a academia queria dizer.
// A mesma lista que o painel do web mostra, com a marcação de lido.

type Aviso = {
  id: number;
  type: 'danger' | 'warning' | 'info';
  title: string;
  message: string;
  cnTipo: string;
  dtLeitura: string | null;
  dtCadastro: string;
};

/** Amarelo de atenção. Não está nos tokens do tema porque não é cor de marca:
 *  a severidade tem que significar a mesma coisa em qualquer academia. */
const COR_ATENCAO = '#b45309';

const data = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export default function AvisosScreen() {
  const t = useTokens();
  const { user } = useAuth();

  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    if (!user?.idAluno) return;
    try {
      setErro('');
      setAvisos(await apiGet<Aviso[]>(`/students/${user.idAluno}/notifications`));
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível carregar seus avisos.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.idAluno]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function marcarLido(aviso: Aviso) {
    if (aviso.dtLeitura || !user?.idAluno) return;
    // Otimista: a marcação de lido não muda nada além do próprio selo, e
    // esperar a rede para riscar um aviso deixa a lista com cara de travada.
    setAvisos((atuais) =>
      atuais.map((item) =>
        item.id === aviso.id ? { ...item, dtLeitura: new Date().toISOString() } : item,
      ),
    );
    try {
      await apiPost(`/students/${user.idAluno}/notifications/${aviso.id}/read`, {});
    } catch {
      // Falhou: o servidor continua com o aviso não lido e a próxima abertura
      // o traz de volta como novo. Melhor do que mostrar erro por um selo.
    }
  }

  /** Cor pela severidade — a mesma escala do painel do web. */
  function corDe(tipo: Aviso['type']) {
    if (tipo === 'danger') return t.danger;
    if (tipo === 'warning') return COR_ATENCAO;
    return t.brand;
  }

  const naoLidos = avisos.filter((aviso) => !aviso.dtLeitura).length;

  return (
    <Screen
      headerRight={
        naoLidos > 0 ? (
          <View style={[styles.badge, { backgroundColor: t.danger }]}>
            <Text style={styles.badgeText}>{naoLidos}</Text>
          </View>
        ) : null
      }
      sectionLabel="Sua academia"
      title="Avisos"
    >
      <View style={styles.list}>
        {erro ? <Text style={[styles.erro, { color: t.danger }]}>{erro}</Text> : null}

        {isLoading ? (
          <Text style={[styles.vazio, { color: t.textSubtle }]}>Carregando...</Text>
        ) : null}

        {!isLoading && avisos.length === 0 && !erro ? (
          <Text style={[styles.vazio, { color: t.textSubtle }]}>
            Nenhum aviso por aqui. Está tudo em dia.
          </Text>
        ) : null}

        {avisos.map((aviso) => (
          <Pressable
            accessibilityLabel={aviso.title}
            accessibilityRole="button"
            key={aviso.id}
            onPress={() => void marcarLido(aviso)}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: t.surface,
                borderColor: t.border,
                borderLeftColor: corDe(aviso.type),
                borderRadius: t.radius,
                opacity: pressed ? 0.75 : aviso.dtLeitura ? 0.6 : 1,
              },
            ]}
          >
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: t.text }]}>{aviso.title}</Text>
              <Text style={[styles.cardDate, { color: t.textSubtle }]}>
                {data(aviso.dtCadastro)}
              </Text>
            </View>
            <Text style={[styles.cardMessage, { color: t.textSubtle }]}>{aviso.message}</Text>
            {!aviso.dtLeitura ? (
              <Text style={[styles.novo, { color: corDe(aviso.type) }]}>
                toque para marcar lido
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  erro: { fontSize: 13, fontWeight: '600' },
  vazio: { fontSize: 14, fontWeight: '500', paddingVertical: 24, textAlign: 'center' },
  badge: { minWidth: 22, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 11 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  card: { borderWidth: 1, borderLeftWidth: 4, padding: 14, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '800' },
  cardDate: { fontSize: 12, fontWeight: '600' },
  cardMessage: { fontSize: 13.5, fontWeight: '500', lineHeight: 19 },
  novo: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
});
