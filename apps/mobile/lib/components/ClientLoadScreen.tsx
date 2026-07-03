import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useClientLoader } from '../hooks/useClientLoader';

interface ClientLoadScreenProps {
  clientId: number;
  onSuccess?: (theme: import('../types/client').ClientTheme | null) => void;
  onError?: (error: string) => void;
}

export function ClientLoadScreen({
  clientId,
  onSuccess,
  onError,
}: ClientLoadScreenProps) {
  const { data, theme, loading, error, reload, hasError } = useClientLoader({
    clientId,
    timeout: 10000,
  });

  const [displayError, setDisplayError] = useState<string | null>(null);

  useEffect(() => {
    if (data && !loading && !error) {
      onSuccess?.(theme);
    }
  }, [data, loading, error, onSuccess, theme]);

  useEffect(() => {
    if (error) {
      setDisplayError(error);
      onError?.(error);
    }
  }, [error, onError]);

  const bgColor = theme?.corFundo || '#FFFFFF';
  const primaryColor = theme?.corPrimaria || '#000000';
  const textColor = theme?.corTexto || '#000000';
  const accentColor = theme?.corAcentuacao || '#FF0000';

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={primaryColor} style={styles.spinner} />
          <Text style={[styles.loadingText, { color: textColor }]}>
            Carregando informações do cliente...
          </Text>
          <Text style={[styles.loadingSubtext, { color: textColor }]}>ID: {clientId}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (hasError || displayError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]}>
        <View style={styles.centerContent}>
          <Text style={[styles.errorTitle, { color: textColor }]}>Erro ao carregar</Text>
          <Text style={[styles.errorMessage, { color: textColor }]}>
            {displayError || error || 'Erro desconhecido ao carregar cliente'}
          </Text>
          <Pressable
            onPress={() => {
              setDisplayError(null);
              void reload(clientId);
            }}
            style={[styles.retryButton, { backgroundColor: primaryColor }]}
          >
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </Pressable>
          <Text style={[styles.debugInfo, { color: textColor }]}>
            ID do cliente: {clientId}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (data) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]}>
        <View style={styles.centerContent}>
          <Text style={[styles.successTitle, { color: textColor }]}>Bem-vindo!</Text>
          <Text style={[styles.clientName, { color: primaryColor }]}>{data.dsCliente}</Text>
          {data.caCNPJ && (
            <Text style={[styles.cnpj, { color: textColor }]}>CNPJ: {data.caCNPJ}</Text>
          )}
          <Text style={[styles.status, { color: data.boInativo === 0 ? '#10B981' : '#EF4444' }]}>
            {data.boInativo === 0 ? 'Ativo' : 'Inativo'}
          </Text>
          {theme && (
            <View style={styles.themeInfo}>
              <Text style={[styles.themeLabel, { color: textColor }]}>
                Tema customizado aplicado
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerContent: { alignItems: 'center', paddingHorizontal: 24 },
  spinner: { marginBottom: 24 },
  loadingText: { fontSize: 18, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  loadingSubtext: { fontSize: 14, opacity: 0.7 },
  errorTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  errorMessage: { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  retryButton: { paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8, marginBottom: 16 },
  retryButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  debugInfo: { fontSize: 12, opacity: 0.5, marginTop: 12 },
  successTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  clientName: { fontSize: 24, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  cnpj: { fontSize: 12, marginBottom: 12, opacity: 0.7 },
  status: { fontSize: 14, fontWeight: '600', marginBottom: 24 },
  themeInfo: { marginTop: 24, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.05)' },
  themeLabel: { fontSize: 12, textAlign: 'center' },
});
