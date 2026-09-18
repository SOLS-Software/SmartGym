import * as SecureStore from 'expo-secure-store';
import {
  authFetch,
  bloquearSessao,
  desbloquearToken,
  getAuthToken,
  publicFetch,
  SessaoBloqueadaError,
  sessaoTrancada,
  setAuthToken,
  travaBiometricaAtiva,
} from './client';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
}));

const cofre = SecureStore as jest.Mocked<typeof SecureStore>;

/** Simula o cofre do sistema, respeitando a exigência de autenticação. */
function montarCofre(inicial: Record<string, string> = {}, opcoes?: { biometriaFalha?: 'cancelado' | 'invalidada' }) {
  const dados: Record<string, string> = { ...inicial };

  cofre.getItemAsync.mockImplementation(async (chave: string, cfg?: { requireAuthentication?: boolean }) => {
    if (cfg?.requireAuthentication) {
      if (opcoes?.biometriaFalha === 'invalidada') throw new Error('Key permanently invalidated');
      if (opcoes?.biometriaFalha === 'cancelado') throw new Error('User canceled the authentication');
    }
    return dados[chave] ?? null;
  });
  cofre.setItemAsync.mockImplementation(async (chave: string, valor: string) => {
    dados[chave] = valor;
  });
  cofre.deleteItemAsync.mockImplementation(async (chave: string) => {
    delete dados[chave];
  });

  return dados;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  bloquearSessao();
});

describe('token sem proteção', () => {
  it('lê direto, sem exigir autenticação do sistema', async () => {
    montarCofre({ smartgym_token: 'jwt-abc', smartgym_token_protegido: '0' });

    expect(await getAuthToken()).toBe('jwt-abc');
    expect(cofre.getItemAsync).toHaveBeenCalledWith('smartgym_token');
  });

  it('não considera a sessão trancada', async () => {
    montarCofre({ smartgym_token: 'jwt-abc', smartgym_token_protegido: '0' });

    expect(await sessaoTrancada()).toBe(false);
  });
});

describe('token protegido', () => {
  it('grava exigindo autenticação e marca a flag', async () => {
    const dados = montarCofre();

    await setAuthToken('jwt-abc', { protegido: true });

    expect(cofre.setItemAsync).toHaveBeenCalledWith(
      'smartgym_token',
      'jwt-abc',
      expect.objectContaining({ requireAuthentication: true }),
    );
    expect(dados.smartgym_token_protegido).toBe('1');
    expect(await travaBiometricaAtiva()).toBe(true);
  });

  // O ponto central do desenho: nenhuma requisicao de tela pode abrir o prompt
  // do sistema num momento arbitrario.
  it('getAuthToken devolve null em vez de pedir biometria', async () => {
    montarCofre({ smartgym_token: 'jwt-abc', smartgym_token_protegido: '1' });

    expect(await getAuthToken()).toBeNull();
    expect(cofre.getItemAsync).not.toHaveBeenCalledWith(
      'smartgym_token',
      expect.objectContaining({ requireAuthentication: true }),
    );
  });

  it('sessão fica trancada até o desbloqueio explícito', async () => {
    montarCofre({ smartgym_token: 'jwt-abc', smartgym_token_protegido: '1' });

    expect(await sessaoTrancada()).toBe(true);
    expect(await desbloquearToken()).toBe('jwt-abc');
    expect(await sessaoTrancada()).toBe(false);
  });

  it('depois de desbloquear, as requisições saem da memória sem novo prompt', async () => {
    montarCofre({ smartgym_token: 'jwt-abc', smartgym_token_protegido: '1' });

    await desbloquearToken();
    cofre.getItemAsync.mockClear();

    expect(await getAuthToken()).toBe('jwt-abc');
    expect(cofre.getItemAsync).not.toHaveBeenCalled();
  });

  // É isto que faz a trava valer "só após inatividade": o contador zera o
  // cache e a próxima leitura volta a exigir identificação.
  it('bloquearSessao devolve a sessão ao estado trancado sem apagar o token', async () => {
    montarCofre({ smartgym_token: 'jwt-abc', smartgym_token_protegido: '1' });
    await desbloquearToken();

    bloquearSessao();

    expect(await sessaoTrancada()).toBe(true);
    expect(cofre.deleteItemAsync).not.toHaveBeenCalled();
  });
});

describe('falhas da autenticação do sistema', () => {
  it('classifica cancelamento como recuperável', async () => {
    montarCofre({ smartgym_token: 'jwt-abc', smartgym_token_protegido: '1' }, { biometriaFalha: 'cancelado' });

    await expect(desbloquearToken()).rejects.toMatchObject({
      name: 'SessaoBloqueadaError',
      causa: 'cancelado',
    });
  });

  // Cadastrar digital nova invalida a chave de propósito. Não há recuperação:
  // a tela precisa mandar o usuário para o login por senha.
  it('classifica chave invalidada, que exige novo login por senha', async () => {
    montarCofre({ smartgym_token: 'jwt-abc', smartgym_token_protegido: '1' }, { biometriaFalha: 'invalidada' });

    const erro = await desbloquearToken().catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(SessaoBloqueadaError);
    expect((erro as SessaoBloqueadaError).causa).toBe('chave-invalidada');
  });
});

describe('logout', () => {
  it('apaga token e flag de proteção', async () => {
    montarCofre({ smartgym_token: 'jwt-abc', smartgym_token_protegido: '1' });

    await setAuthToken(null);

    expect(cofre.deleteItemAsync).toHaveBeenCalledWith('smartgym_token');
    expect(cofre.deleteItemAsync).toHaveBeenCalledWith('smartgym_token_protegido');
    expect(await getAuthToken()).toBeNull();
  });
});

// Falha de rede: o que o aluno LÊ quando a requisição não vira resposta.
//
// A tela mostra `error.message` direto, então o texto cru do runtime chegava ao
// usuário. Estes testes existem porque o caso do AbortError é contraintuitivo —
// ele TEM que passar sem tradução, senão cada busca cancelada (meu-treino
// aborta a anterior ao trocar de treino) viraria um erro visível na tela.
describe('tradução de falha de rede', () => {
  const fetchOriginal = global.fetch;

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  /** Faz o fetch global rejeitar com o erro dado. */
  function fetchQueFalhaCom(erro: unknown) {
    global.fetch = jest.fn().mockRejectedValue(erro) as unknown as typeof fetch;
  }

  it('troca "Network request failed" por instrução em português', async () => {
    montarCofre();
    fetchQueFalhaCom(new TypeError('Network request failed'));

    const erro = await publicFetch('https://exemplo.test/x').catch((e: unknown) => e);

    expect((erro as Error).message).toBe(
      'Sem conexão com o servidor. Verifique sua internet e tente novamente.',
    );
  });

  it('NÃO traduz cancelamento deliberado, que as telas ignoram em silêncio', async () => {
    montarCofre();
    const abortado = new Error('Aborted');
    abortado.name = 'AbortError';
    fetchQueFalhaCom(abortado);

    const erro = await publicFetch('https://exemplo.test/x').catch((e: unknown) => e);

    // Idêntico ao lançado: meu-treino confere `error.name === 'AbortError'`.
    expect(erro).toBe(abortado);
    expect((erro as Error).name).toBe('AbortError');
  });

  it('traduz estouro de tempo com texto próprio', async () => {
    montarCofre();
    const estouro = new Error('timed out');
    estouro.name = 'TimeoutError';
    fetchQueFalhaCom(estouro);

    const erro = await publicFetch('https://exemplo.test/x').catch((e: unknown) => e);

    expect((erro as Error).message).toBe('O servidor demorou demais para responder. Tente novamente.');
  });

  it('vale também para chamada autenticada', async () => {
    montarCofre({ smartgym_token: 'jwt-abc' });
    fetchQueFalhaCom(new TypeError('Network request failed'));

    const erro = await authFetch('https://exemplo.test/x').catch((e: unknown) => e);

    expect((erro as Error).message).toBe(
      'Sem conexão com o servidor. Verifique sua internet e tente novamente.',
    );
  });
});
