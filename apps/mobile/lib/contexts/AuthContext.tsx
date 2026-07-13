import { createContext, useContext, type ReactNode } from 'react';
import { useAuthSession } from '../hooks/useAuthSession';
import type { AuthenticatedUser } from '../types/auth';

type AuthContextValue = {
  user: AuthenticatedUser | null;
  isLoaded: boolean;
  signIn: (user: AuthenticatedUser) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Provê UMA instância de sessão para toda a árvore, para que o login (signIn)
// e os guards de rota vejam o mesmo estado.
export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useAuthSession();
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return value;
}
