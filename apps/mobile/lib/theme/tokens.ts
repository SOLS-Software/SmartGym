import { useTheme } from '../contexts/ThemeContext';

// Paleta default do app (a mesma já usada no StyleSheet de app/index.tsx),
// com overrides opcionais vindos do ClientTheme (multi-tenant) via useTheme().
export interface Tokens {
  brand: string;
  brandTintSoft: string;
  brandTintFaint: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  placeholder: string;
  bg: string;
  surface: string;
  inputBg: string;
  border: string;
  borderStrong: string;
  danger: string;
  radius: number;
}

const DEFAULT_TOKENS: Tokens = {
  brand: '#1f7a53',
  brandTintSoft: '#e8f4ed',
  brandTintFaint: '#f0f8f3',
  text: '#17211c',
  textMuted: '#52605a',
  textSubtle: '#6b7a72',
  placeholder: '#82918a',
  bg: '#f3f6f4',
  surface: '#ffffff',
  inputBg: '#f8faf8',
  border: '#dde6df',
  borderStrong: '#ccd8d0',
  danger: '#dc2626',
  radius: 8,
};

export function useTokens(): Tokens {
  const theme = useTheme();

  return {
    ...DEFAULT_TOKENS,
    brand: theme?.corPrimaria ?? DEFAULT_TOKENS.brand,
    text: theme?.corTexto ?? DEFAULT_TOKENS.text,
    bg: theme?.corFundo ?? DEFAULT_TOKENS.bg,
    radius: theme?.raioCardBorder ?? DEFAULT_TOKENS.radius,
  };
}

export { DEFAULT_TOKENS };
