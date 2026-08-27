import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { apiUrl, authFetch, sessaoTrancada, setAuthToken } from '../api/client';
import { desregistrarPush, registrarPush } from '../push/registrarPush';
import type { AuthenticatedUser } from '../types/auth';

const STORAGE_KEY = '@smartgym:auth_user';

// Persiste o AuthenticatedUser completo (inclui idAluno) e revalida via /auth/verify
// no boot. Espelha o padrão do web (sessionUtils), sem a camada de criptografia.
// O JWT fica no SecureStore (lib/api/client) — aqui só o perfil, sem credencial.
export function useAuthSession() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const signOut = useCallback(async () => {
    // Descadastra o aparelho ANTES de revogar o token: o servidor exige que o
    // aparelho seja do próprio usuário, e depois do logout não haveria mais
    // sessão para provar isso. Sem esta chamada o telefone continuaria
    // recebendo aviso de uma conta que já saiu dele.
    await desregistrarPush();

    // Revoga o token no servidor antes de descartá-lo (best-effort): mata a
    // sessão de verdade, não só apaga a credencial local. Enviado enquanto o
    // token ainda está no SecureStore (authFetch o injeta).
    try {
      await authFetch(`${apiUrl}/auth/logout`, { method: 'POST' });
    } catch {
      // Offline / API indisponível: segue com o logout local mesmo assim.
    }
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
    // Registra o aparelho para push. Nunca lança e não é aguardado: a entrada
    // no app não pode esperar o diálogo de permissão do sistema, e o aviso
    // continua saindo por e-mail se o registro falhar.
    void registrarPush();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) return;

        const parsed = JSON.parse(stored) as AuthenticatedUser;

        // Sessão trancada pela biometria: o token existe, mas só sai do cofre
        // depois do desbloqueio. Revalidar agora mandaria requisição sem
        // Authorization, tomaria 401 e derrubaria o login — justamente o
        // contrário do esperado. Mantém o perfil local e deixa a TravaSessao
        // pedir a identificação; a revalidação acontece na primeira chamada
        // depois disso.
        if (await sessaoTrancada()) {
          if (!cancelled) setUser(parsed);
          return;
        }

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
          // Reregistra a cada boot com sessão válida: o token do aparelho muda
          // ao reinstalar o app e é invalidado pelo Expo depois de um tempo
          // sem uso. Registrar só no login deixaria quem nunca desloga sem
          // push depois da primeira troca.
          void registrarPush();
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
