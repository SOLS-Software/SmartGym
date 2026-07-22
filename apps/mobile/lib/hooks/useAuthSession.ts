import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { apiUrl, authFetch, setAuthToken } from '../api/client';
import type { AuthenticatedUser } from '../types/auth';

const STORAGE_KEY = '@smartgym:auth_user';

// Persiste o AuthenticatedUser completo (inclui idAluno) e revalida via /auth/verify
// no boot. Espelha o padrão do web (sessionUtils), sem a camada de criptografia.
// O JWT fica no SecureStore (lib/api/client) — aqui só o perfil, sem credencial.
export function useAuthSession() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const signOut = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Erro ao limpar sessão:', error);
    }
    await setAuthToken(null);
    setUser(null);
  }, []);

  const signIn = useCallback(async (nextUser: AuthenticatedUser) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    } catch (error) {
      console.error('Erro ao salvar sessão:', error);
    }
    setUser(nextUser);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) return;

        const parsed = JSON.parse(stored) as AuthenticatedUser;

        // Revalida a sessão; se o token não for mais válido, derruba.
        // A identidade vem do JWT (Authorization) — o ?id= legado foi removido.
        try {
          const response = await authFetch(`${apiUrl}/auth/verify`);
          if (!response.ok) {
            await AsyncStorage.removeItem(STORAGE_KEY);
            await setAuthToken(null);
            return;
          }
          const verified = (await response.json()) as AuthenticatedUser;
          if (!cancelled) setUser(verified);
        } catch {
          // Offline / API indisponível: mantém a sessão local para não travar o app.
          if (!cancelled) setUser(parsed);
        }
      } catch (error) {
        console.warn('Erro ao ler sessão:', error);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, isLoaded, signIn, signOut };
}
