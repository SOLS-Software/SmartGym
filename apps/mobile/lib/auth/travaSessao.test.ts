import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  INATIVIDADE_MS,
  lerPreferenciaBiometria,
  limparInatividade,
  passouDaInatividade,
  registrarSaida,
  salvarPreferenciaBiometria,
  verificarBiometria,
} from './travaSessao';

jest.mock('@react-native-async-storage/async-storage', () => {
  let dados: Record<string, string> = {};
  return {
    getItem: jest.fn(async (k: string) => dados[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      dados[k] = v;
    }),
    removeItem: jest.fn(async (k: string) => {
      delete dados[k];
    }),
    __limpar: () => {
      dados = {};
    },
  };
});

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
}));

const mockado = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

beforeEach(() => {
  (AsyncStorage as unknown as { __limpar: () => void }).__limpar();
  jest.clearAllMocks();
});

describe('inatividade', () => {
  it('não tranca sem registro de saída (sessão nunca saiu de vista)', async () => {
    expect(await passouDaInatividade()).toBe(false);
  });

  it('não tranca antes do limite', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await registrarSaida();
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000 + INATIVIDADE_MS - 1000);

    expect(await passouDaInatividade()).toBe(false);
  });

  it('tranca depois do limite', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await registrarSaida();
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000 + INATIVIDADE_MS + 1000);

    expect(await passouDaInatividade()).toBe(true);
  });

  it('limpar libera a sessão', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await registrarSaida();
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000 + INATIVIDADE_MS + 1000);
    await limparInatividade();

    expect(await passouDaInatividade()).toBe(false);
  });

  // Registro corrompido tem de trancar, não liberar: na dúvida, o lado seguro.
  it('tranca quando o registro está corrompido', async () => {
    await AsyncStorage.setItem('@smartgym:ultima_atividade', 'nao-e-numero');

    expect(await passouDaInatividade()).toBe(true);
  });
});

describe('preferência', () => {
  it('começa desligada e persiste depois de ligada', async () => {
    expect(await lerPreferenciaBiometria()).toBe(false);
    await salvarPreferenciaBiometria(true);
    expect(await lerPreferenciaBiometria()).toBe(true);
    await salvarPreferenciaBiometria(false);
    expect(await lerPreferenciaBiometria()).toBe(false);
  });
});

describe('disponibilidade', () => {
  it('recusa aparelho sem leitor', async () => {
    mockado.hasHardwareAsync.mockResolvedValue(false);

    expect(await verificarBiometria()).toEqual({ disponivel: false, motivo: 'sem-hardware' });
  });

  // Hardware presente mas sem digital cadastrada: oferecer o recurso mostraria
  // um botão que não funciona.
  it('recusa aparelho sem biometria cadastrada', async () => {
    mockado.hasHardwareAsync.mockResolvedValue(true);
    mockado.isEnrolledAsync.mockResolvedValue(false);

    expect(await verificarBiometria()).toEqual({ disponivel: false, motivo: 'sem-cadastro' });
  });

  it('identifica reconhecimento facial', async () => {
    mockado.hasHardwareAsync.mockResolvedValue(true);
    mockado.isEnrolledAsync.mockResolvedValue(true);
    mockado.supportedAuthenticationTypesAsync.mockResolvedValue([
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
    ]);

    expect(await verificarBiometria()).toEqual({ disponivel: true, tipo: 'facial' });
  });

  it('identifica digital', async () => {
    mockado.hasHardwareAsync.mockResolvedValue(true);
    mockado.isEnrolledAsync.mockResolvedValue(true);
    mockado.supportedAuthenticationTypesAsync.mockResolvedValue([
      LocalAuthentication.AuthenticationType.FINGERPRINT,
    ]);

    expect(await verificarBiometria()).toEqual({ disponivel: true, tipo: 'digital' });
  });

  it('não quebra se a consulta ao hardware falhar', async () => {
    mockado.hasHardwareAsync.mockRejectedValue(new Error('modulo indisponivel'));

    expect(await verificarBiometria()).toEqual({ disponivel: false, motivo: 'sem-hardware' });
  });
});
