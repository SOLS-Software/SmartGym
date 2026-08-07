import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { desbloquearToken, setAuthToken, travaBiometricaAtiva } from '../api/client';
import {
  INATIVIDADE_MS,
  rotuloBiometria,
  salvarPreferenciaBiometria,
  verificarBiometria,
  type DisponibilidadeBiometria,
} from '../auth/travaSessao';
import { useTokens } from '../theme/tokens';

/**
 * Interruptor da trava biométrica, para a tela de perfil.
 *
 * Ligar significa regravar o MESMO token no SecureStore exigindo autenticação
 * do sistema para leitura. Não há chamada à API: a biometria é local e o
 * servidor continua enxergando o mesmo JWT de sempre.
 */
export function AjusteBiometria() {
  const t = useTokens();
  const [disponibilidade, setDisponibilidade] = useState<DisponibilidadeBiometria | null>(null);
  const [ativa, setAtiva] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    void (async () => {
      setDisponibilidade(await verificarBiometria());
      setAtiva(await travaBiometricaAtiva());
    })();
  }, []);

  const alternar = useCallback(async (proximo: boolean) => {
    setOcupado(true);
    setAviso('');
    try {
      // A sessão está aberta, então o token vem da memória e ligar não dispara
      // prompt. `desbloquearToken` cobre o caso de borda em que o cache foi
      // limpo entre a montagem da tela e o toque no interruptor.
      const token = await desbloquearToken();
      if (!token) {
        setAviso('Sessão não encontrada. Entre novamente para configurar.');
        return;
      }
      await setAuthToken(token, { protegido: proximo });
      await salvarPreferenciaBiometria(proximo);
      setAtiva(proximo);
    } catch {
      setAviso('Não foi possível alterar agora. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  }, []);

  if (!disponibilidade) return null;

  const minutos = Math.round(INATIVIDADE_MS / 60000);

  if (!disponibilidade.disponivel) {
    return (
      <View style={[styles.caixa, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
        <Text style={[styles.titulo, { color: t.text }]}>Desbloqueio pelo aparelho</Text>
        <Text style={[styles.descricao, { color: t.textSubtle }]}>
          {disponibilidade.motivo === 'sem-hardware'
            ? 'Este aparelho não tem leitor biométrico.'
            : 'Cadastre uma biometria ou senha nas configurações do aparelho para usar este recurso.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.caixa, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
      <View style={styles.linha}>
        <View style={styles.texto}>
          <Text style={[styles.titulo, { color: t.text }]}>Desbloqueio pelo aparelho</Text>
          <Text style={[styles.descricao, { color: t.textSubtle }]}>
            Usar {rotuloBiometria(disponibilidade.tipo)} para voltar ao app depois de {minutos} minutos
            fora. Sua senha continua necessária no primeiro acesso.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Desbloqueio pelo aparelho"
          accessibilityRole="switch"
          accessibilityState={{ checked: ativa, disabled: ocupado }}
          disabled={ocupado}
          onValueChange={(v) => void alternar(v)}
          thumbColor="#ffffff"
          trackColor={{ false: t.borderStrong, true: t.brand }}
          value={ativa}
        />
      </View>
      {aviso ? <Text style={[styles.aviso, { color: t.danger }]}>{aviso}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { borderWidth: 1, padding: 14, gap: 8 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  texto: { flex: 1, gap: 3 },
  titulo: { fontSize: 15, fontWeight: '800' },
  descricao: { fontSize: 12.5, lineHeight: 18 },
  aviso: { fontSize: 12.5, fontWeight: '600' },
});
