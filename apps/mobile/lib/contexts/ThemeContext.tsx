import React, { createContext, useContext } from 'react';
import type { ClientTheme } from '../types/client';

const ThemeContext = createContext<ClientTheme | null>(null);

export function ThemeProvider({
  theme,
  children,
}: {
  theme: ClientTheme | null;
  children: React.ReactNode;
}) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
