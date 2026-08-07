import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

// Trava de sessão por inatividade.
//
// A biometria NÃO autentica no servidor — o leitor nunca sai do aparelho e a
// API jamais vê digital. O que ela faz é destrancar localmente o JWT que já foi
// obtido com CPF+senha. Por isso o primeiro acesso é sempre por senha.
//
// O token do mobile dura 30 dias (TOKEN_EXPIRY_MOBILE na API), então não é
// preciso refresh token: basta reabrir o cofre. E o servidor mantém o poder de
// derrubar tudo pelo `nrTokenVersion`, checado a cada requisição.

/** Tempo em segundo plano a partir do qual a sessão é trancada. */
export const INATIVIDADE_MS = 15 * 60 * 1000;

const ULTIMA_ATIVIDADE_KEY = '@smartgym:ultima_atividade';
const PREFERENCIA_KEY = '@smartgym:biometria_preferida';

// A PREFERÊNCIA sobrevive ao logout; a proteção do token, não (o token é
// apagado). Sem guardar isso à parte, a trava se desligaria sozinha a cada
// login por senha e o usuário teria de reativar toda vez — inclusive no caso
// em que ele acabou de ser deslogado justamente porque a chave foi invalidada.
export async function lerPreferenciaBiometria(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PREFERENCIA_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function salvarPreferenciaBiometria(ativa: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFERENCIA_KEY, ativa ? '1' : '0');
  } catch {
    // ignora: sem preferência gravada o app apenas não reativa sozinho
  }
}

export type DisponibilidadeBiometria =
  | { disponivel: true; tipo: 'facial' | 'digital' | 'iris' | 'generico' }
  | { disponivel: false; motivo: 'sem-hardware' | 'sem-cadastro' };

/**
 * Checa hardware E cadastro. Sem os dois não adianta oferecer o recurso: o
 * botão apareceria e não funcionaria.
 */
export async function verificarBiometria(): Promise<DisponibilidadeBiometria> {
  try {
    if (!(await LocalAuthentication.hasHardwareAsync())) {
      return { disponivel: false, motivo: 'sem-hardware' };
    }
    if (!(await LocalAuthentication.isEnrolledAsync())) {
      return { disponivel: false, motivo: 'sem-cadastro' };
    }

    const tipos = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const { AuthenticationType } = LocalAuthentication;
    if (tipos.includes(AuthenticationType.FACIAL_RECOGNITION)) {
      return { disponivel: true, tipo: 'facial' };
    }
    if (tipos.includes(AuthenticationType.FINGERPRINT)) {
      return { disponivel: true, tipo: 'digital' };
    }
    if (tipos.includes(AuthenticationType.IRIS)) {
      return { disponivel: true, tipo: 'iris' };
    }
    return { disponivel: true, tipo: 'generico' };
  } catch {
    return { disponivel: false, motivo: 'sem-hardware' };
  }
}

export function rotuloBiometria(tipo: 'facial' | 'digital' | 'iris' | 'generico'): string {
  if (tipo === 'facial') return 'reconhecimento facial';
  if (tipo === 'digital') return 'impressão digital';
  if (tipo === 'iris') return 'leitura de íris';
  return 'biometria do aparelho';
}

/** Marca o instante em que o app saiu de vista. */
export async function registrarSaida(): Promise<void> {
  try {
    await AsyncStorage.setItem(ULTIMA_ATIVIDADE_KEY, String(Date.now()));
  } catch {
    // Sem registro o app tranca na volta (verificarInatividade devolve true),
    // que é o lado seguro do erro.
  }
}

export async function limparInatividade(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ULTIMA_ATIVIDADE_KEY);
  } catch {
    // ignora
  }
}

/**
 * Se o tempo fora passou do limite. Guardado em AsyncStorage (não em memória)
 * de propósito: assim vale também quando o sistema mata o processo em segundo
 * plano, que é o caso comum em Android com pouca RAM.
 */
export async function passouDaInatividade(): Promise<boolean> {
  try {
    const registro = await AsyncStorage.getItem(ULTIMA_ATIVIDADE_KEY);
    if (!registro) return false;
    const desde = Number(registro);
    if (!Number.isFinite(desde)) return true;
    return Date.now() - desde > INATIVIDADE_MS;
  } catch {
    return true;
  }
}
