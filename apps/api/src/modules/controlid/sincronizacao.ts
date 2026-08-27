// Plano B: manter a catraca sabendo quem pode entrar.
//
// O modo online (a catraca perguntar ao servidor a cada identificacao) nao
// engata no firmware 5.13.2 deste equipamento — ver docs/catraca-controlid.md.
// Em vez de esperar a pergunta, empurramos a resposta antes: cada usuario da
// catraca tem uma JANELA DE VALIDADE (`users.begin_time` / `users.end_time`) que
// o proprio equipamento respeita offline. Basta mante-la alinhada com a
// situacao do aluno no SmartGym.
//
// Duas propriedades que o modo online nao teria:
//
//  - FALHA FECHADO. Se a API parar, as validades expiram e o acesso fecha
//    sozinho. No modo online, com a regra local "Sempre Liberado", API fora do
//    ar significaria catraca liberando todo mundo.
//  - Funciona com a rede caida. A catraca decide sozinha, com dado correto.
//
// O custo e a latencia: entre quitar o pagamento e a catraca saber, passa um
// ciclo de sincronizacao (segundos). Para academia, irrelevante.
import { prisma } from '../../shared/prisma.js';
import { getStudentAccessStatus } from '../../shared/studentAccess.js';
import { paraHoraDoEquipamento } from './events.js';
import { comando, enfileirar, type ComandoControlid } from './fila.js';

// Por quanto tempo um aluno em dia fica valido na catraca antes de precisar de
// renovacao. Curto de proposito: e o prazo maximo que um aluno continuaria
// entrando se a sincronizacao parasse. Longo demais vira porta aberta; curto
// demais barra gente legitima em qualquer soluco. 48h e o meio termo.
const JANELA_VALIDADE_MINUTOS = Number(process.env.CONTROLID_SYNC_JANELA_MINUTOS ?? 2880);

// Intervalo entre reconciliacoes de um mesmo equipamento.
const INTERVALO_SYNC_MS = Number(process.env.CONTROLID_SYNC_INTERVALO_MS ?? 300_000);

// Relogio MONOTONICO (ver o comentario do regulador de trafego em routes.ts:
// ajuste de NTP para tras congelou o envio de comandos por horas).
const ultimaSync = new Map<string, number>();

function minutos(valor: number, padrao: number): number {
  return Number.isFinite(valor) && valor > 0 ? valor : padrao;
}

export function syncPendente(deviceId: string): boolean {
  const intervalo = minutos(INTERVALO_SYNC_MS, 300_000);
  const ultima = ultimaSync.get(deviceId);
  return ultima === undefined || performance.now() - ultima >= intervalo;
}

export function marcarSyncIniciada(deviceId: string) {
  ultimaSync.set(deviceId, performance.now());
}

// Faz o proximo push ja pedir a lista de usuarios, sem esperar o intervalo.
//
// Usado pelo cadastro de digital: um usuario recem-criado nasce bloqueado e so
// e liberado pela reconciliacao. Sem forcar o ciclo, o aluno que acabou de
// cadastrar a digital esperaria ate CONTROLID_SYNC_INTERVALO_MS (5 min) para a
// catraca aceitar o dedo dele — e testaria o equipamento bem antes disso.
export function forcarSync(deviceId: string) {
  ultimaSync.delete(deviceId);
}

// Passo 1 da reconciliacao: pedir a catraca a lista de usuarios com as validades
// que ELA tem hoje. Sem isso a gente reescreveria todo mundo a cada ciclo.
export function comandoDeLeituraDeUsuarios(): ComandoControlid {
  return comando('load_objects', { object: 'users' });
}

export type UsuarioNoEquipamento = {
  id?: unknown;
  name?: unknown;
  end_time?: unknown;
  begin_time?: unknown;
};

function comoInteiro(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.trunc(numero) : null;
}

// `end_time` 0 significa "sem prazo" no equipamento — acesso permanente.
const SEM_PRAZO = 0;

export type ResultadoSync = {
  avaliados: number;
  liberados: number;
  bloqueados: number;
  /** Usuarios do equipamento que nao pertencem a nenhum aluno. */
  bloqueadosSemVinculo: number;
  semAlteracao: number;
  naoGerenciados: number;
};

/**
 * Compara a situacao dos alunos no SmartGym com as validades gravadas na
 * catraca e enfileira apenas as DIFERENCAS.
 *
 * Escreve so o que mudou: em regime, um ciclo nao gera comando nenhum. Reescrever
 * todo mundo a cada 5 minutos encheria a fila e o log de ruido, escondendo as
 * alteracoes que importam.
 */
export async function reconciliarAcessos(params: {
  idCatraca: number;
  deviceId: string;
  usuarios: UsuarioNoEquipamento[];
}): Promise<ResultadoSync> {
  const { idCatraca, deviceId, usuarios } = params;

  const resultado: ResultadoSync = {
    avaliados: 0,
    liberados: 0,
    bloqueados: 0,
    bloqueadosSemVinculo: 0,
    semAlteracao: 0,
    naoGerenciados: 0,
  };

  const catraca = await prisma.catraca.findUnique({
    where: { id: idCatraca },
    select: { empresa: { select: { idCliente: true } } },
  });
  const idCliente = catraca?.empresa?.idCliente;
  // Catraca sem empresa vinculada nao tem escopo de alunos: nao ha o que
  // sincronizar, e sair adivinhando cliente vazaria acesso entre tenants.
  if (!idCliente) return resultado;

  const alunos = await prisma.aluno.findMany({
    where: { idCliente, boInativo: false, nrUsuarioCatraca: { not: null } },
    select: { id: true, nmAluno: true, nrUsuarioCatraca: true },
  });

  const validadePorUsuario = new Map<number, number | null>();
  for (const usuario of usuarios) {
    const id = comoInteiro(usuario.id);
    if (id !== null) validadePorUsuario.set(id, comoInteiro(usuario.end_time));
  }

  const agora = new Date();
  const janela = minutos(JANELA_VALIDADE_MINUTOS, 2880);
  const fimDesejado = paraHoraDoEquipamento(new Date(agora.getTime() + janela * 60_000));
  const agoraNoEquipamento = paraHoraDoEquipamento(agora);
  // Renova antes de chegar perto do fim: se so renovassemos no limite, um ciclo
  // perdido ja barraria aluno em dia.
  const limiteDeRenovacao = paraHoraDoEquipamento(new Date(agora.getTime() + (janela / 2) * 60_000));

  const comandos: ComandoControlid[] = [];

  for (const aluno of alunos) {
    const usuarioCatraca = aluno.nrUsuarioCatraca;
    if (usuarioCatraca === null) continue;

    // Aluno vinculado a um numero que nao existe no equipamento: nada a fazer
    // aqui (a digital dele ainda nao foi cadastrada na catraca).
    if (!validadePorUsuario.has(usuarioCatraca)) {
      resultado.naoGerenciados += 1;
      continue;
    }

    resultado.avaliados += 1;
    const fimAtual = validadePorUsuario.get(usuarioCatraca) ?? null;
    const status = await getStudentAccessStatus(prisma, aluno.id);

    if (status.canAccess) {
      const precisaRenovar =
        fimAtual === null || fimAtual === SEM_PRAZO || fimAtual < limiteDeRenovacao;
      if (!precisaRenovar) {
        resultado.semAlteracao += 1;
        continue;
      }
      comandos.push(
        comando('modify_objects', {
          object: 'users',
          values: { begin_time: 0, end_time: fimDesejado },
          where: { users: { id: usuarioCatraca } },
        }),
      );
      resultado.liberados += 1;
      continue;
    }

    // Bloqueio: validade encerrada 1s atras. Nao apagamos o usuario nem a
    // biometria — o aluno volta a entrar assim que quitar, sem recadastrar a
    // digital.
    const jaBloqueado =
      fimAtual !== null && fimAtual !== SEM_PRAZO && fimAtual <= agoraNoEquipamento;
    if (jaBloqueado) {
      resultado.semAlteracao += 1;
      continue;
    }
    comandos.push(
      comando('modify_objects', {
        object: 'users',
        values: { end_time: agoraNoEquipamento - 1 },
        where: { users: { id: usuarioCatraca } },
      }),
    );
    resultado.bloqueados += 1;
  }

  // Usuarios que existem NO EQUIPAMENTO e nao pertencem a nenhum aluno.
  //
  // Ficavam de fora da reconciliacao, e um usuario sem prazo (`end_time = 0`)
  // entrava para sempre — cadastro antigo, ex-funcionario, teste esquecido: todos
  // com acesso vitalicio que o SmartGym nao controla. Passam a ser bloqueados.
  //
  // CONSEQUENCIA OPERACIONAL: quem for cadastrado direto na catraca (funcionario,
  // personal) e barrado no ciclo seguinte ate ser vinculado a um aluno pela tela
  // de catracas. E o comportamento escolhido — "so entra quem o sistema conhece".
  // CONTROLID_BLOQUEAR_NAO_VINCULADOS="false" volta ao comportamento anterior.
  const bloquearNaoVinculados = process.env.CONTROLID_BLOQUEAR_NAO_VINCULADOS !== 'false';
  if (bloquearNaoVinculados) {
    const numerosDeAlunos = new Set(
      alunos.map((aluno) => aluno.nrUsuarioCatraca).filter((numero): numero is number => numero !== null),
    );

    for (const [idUsuario, fimAtual] of validadePorUsuario) {
      if (numerosDeAlunos.has(idUsuario)) continue;
      const jaBloqueado =
        fimAtual !== null && fimAtual !== SEM_PRAZO && fimAtual <= agoraNoEquipamento;
      if (jaBloqueado) {
        resultado.semAlteracao += 1;
        continue;
      }
      comandos.push(
        comando('modify_objects', {
          object: 'users',
          values: { end_time: agoraNoEquipamento - 1 },
          where: { users: { id: idUsuario } },
        }),
      );
      resultado.bloqueadosSemVinculo += 1;
    }
  }

  enfileirar(deviceId, ...comandos);
  return resultado;
}
