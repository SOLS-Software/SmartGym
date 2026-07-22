import { useEffect, useState } from 'react';
import { authFetch as fetch } from '../api/client';
import type { Client, ClientTheme, ClientLoaderState } from '../types/client';

interface UseClientLoaderOptions {
  clientId?: number;
  autoLoad?: boolean;
  timeout?: number;
}

function getApiUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

  if (configuredUrl) {
    return configuredUrl;
  }

  return 'http://10.0.2.2:3333';
}

export function useClientLoader(options: UseClientLoaderOptions = {}) {
  const { clientId, autoLoad = true, timeout = 10000 } = options;

  const [state, setState] = useState<ClientLoaderState>({
    data: null,
    theme: null,
    loading: true,
    error: null,
  });

  async function loadClient(id: number) {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const apiUrl = getApiUrl();

      const clientResponse = await Promise.race([
        fetch(`${apiUrl}/clients/${id}`),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout ao buscar cliente')), timeout),
        ),
      ]);

      if (!clientResponse.ok) {
        throw new Error('Cliente não encontrado');
      }

      const client = (await clientResponse.json()) as Client;

      let theme: ClientTheme | null = null;
      try {
        const themeResponse = await Promise.race([
          fetch(`${apiUrl}/clients/${id}/theme`),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout ao buscar tema')), timeout),
          ),
        ]);

        if (themeResponse.ok && themeResponse.status !== 204) {
          theme = (await themeResponse.json()) as ClientTheme;
        }
      } catch {
        console.warn('Não foi possível carregar o tema do cliente');
      }

      setState({
        data: client,
        theme,
        loading: false,
        error: null,
      });

      return { client, theme };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erro ao carregar cliente';

      setState({
        data: null,
        theme: null,
        loading: false,
        error: errorMessage,
      });

      throw error;
    }
  }

  useEffect(() => {
    if (autoLoad && clientId) {
      // O erro já é refletido em state.error; capturamos aqui para não gerar
      // uma unhandled promise rejection (red box em dev).
      loadClient(clientId).catch(() => {});
    }
  }, [clientId, autoLoad]);

  return {
    ...state,
    reload: loadClient,
    isLoading: state.loading,
    hasError: state.error !== null,
  };
}
