// Cadastro de digital pelo painel web — sem app desktop e sem estar na rede da
// catraca.
//
// Isto e possivel porque o canal de push nao e um canal de "coletar log": e um
// RPC generico para dentro do equipamento. O SmartGym enfileira
// {endpoint, body}, a catraca executa contra a PROPRIA API local e devolve o
// resultado em /controlid/result (ver o comentario do handler de push em
// routes.ts). O bootstrap do modo online ja usava isso para CRIAR objetos no
// equipamento (`create_objects` em `devices`); aqui o mesmo mecanismo cria o
// usuario e dispara o enrolamento da biometria.
//
// Fluxo de uma sessao (uma por equipamento — a catraca tem um leitor so):
//
//   aluno sem numero -> create_objects(users)  -> id gerado -> grava vinculo
//   aluno com numero -> load_objects(templates) -> quantas digitais ja existem
//                    -> remote_enroll(user_id)  -> catraca entra em captura
//                    -> load_objects(templates) a cada ciclo: +1 digital = fim
//
// ESTADO EM MEMORIA, de proposito, como a fila de comandos: uma sessao dura
// segundos e so faz sentido enquanto alguem esta parado na frente do
// equipamento. Reiniciar a API no meio cancela o cadastro em andamento e o
// operador clica de novo. O que NAO se perde e o resultado: usuario criado e
// vinculo aluno<->numero ja estao no banco quando a sessao morre.
//
// AVISO SOBRE O FIRMWARE: `remote_enroll` nunca foi exercitado neste
// equipamento (5.13.2). O modo online tambem era "suportado" pela documentacao
// e simplesmente nunca engatou (docs/catraca-controlid.md). Por isso cada passo
// aqui trata erro do equipamento como resposta legitima e leva a mensagem
// inteira para a tela, em vez de virar um "erro ao cadastrar" generico: quando
// algo nao existir neste firmware, queremos LER o que ele respondeu.
import { prisma } from '../../shared/prisma.js';
import { comando, enfileirar, type ComandoControlid } from './fila.js';
import { paraHoraDoEquipamento } from './events.js';
import { forcarSync } from './sincronizacao.js';

// Tempo maximo de uma sessao. E o prazo para a pessoa encostar o dedo no
// leitor: ela ja esta na frente do equipamento quando o operador clica, entao
// dois minutos sobram. Passou disso, a tela para de esperar em vez de girar
// para sempre.
const TIMEOUT_MS = Number(process.env.CONTROLID_CADASTRO_TIMEOUT_MS ?? 120_000);

// Intervalo entre confirmacoes (contagem de digitais do usuario). Curto porque
// e um fluxo interativo: e o que separa "encostou o dedo" de "a tela avisou".
const INTERVALO_VERIFICACAO_MS = Number(process.env.CONTROLID_CADASTRO_VERIFICACAO_MS ?? 3_000);

// Modo do remote_enroll:
//
//   sync=false (padrao) - o equipamento responde na hora e captura a digital em
//     paralelo; a confirmacao vem da contagem de templates.
//   sync=true - o equipamento SEGURA a resposta ate o dedo encostar. Dentro do
//     laco de push isso significa a catraca parada esperando uma pessoa, e nao
//     sabemos como este firmware reage a um comando que demora. Nao arriscamos
//     por padrao — mas e a saida caso `load_objects` em `templates` nao exista
//     aqui, porque nesse modo a propria resposta do enrolamento e o resultado.
const ENROLL_SYNC = process.env.CONTROLID_ENROLL_SYNC === 'true';

export type EtapaCadastro =
  | 'criando_usuario'
  | 'lendo_digitais'
  | 'aguardando_dedo'
  | 'concluido'
  | 'cancelado'
  | 'erro'
  | 'expirado';

export type SessaoCadastro = {
  deviceId: string;
  idCatraca: number;
  idAluno: number;
  nmAluno: string;
  nrUsuarioCatraca: number | null;
  etapa: EtapaCadastro;
  dsMensagem: string;
  /** Digitais que o usuario ja tinha ANTES deste cadastro (a linha de base). */
  qtDigitaisAntes: number;
  qtDigitaisAgora: number;
  /**
   * O equipamento nao respondeu a consulta de digitais: o cadastro segue, mas
   * sem confirmacao automatica. A tela precisa dizer isso em vez de fingir
   * sucesso.
   */
  boVerificacaoIndisponivel: boolean;
  dtInicio: Date;
  dtAtualizacao: Date;
};

// Controle de tempo em relogio MONOTONICO, separado das datas de exibicao. Um
// ajuste de NTP para tras ja congelou o envio de comandos por horas neste
// modulo (ver o regulador de trafego em routes.ts); aqui o mesmo ajuste
// deixaria uma sessao pendurada sem nunca expirar.
type ControleDeTempo = {
  msInicio: number;
  msUltimaVerificacao: number;
  boVerificando: boolean;
};

const sessoes = new Map<string, SessaoCadastro>();
const tempos = new Map<string, ControleDeTempo>();

function agora(): number {
  return performance.now();
}

function intervalo(valor: number, padrao: number): number {
  return Number.isFinite(valor) && valor > 0 ? valor : padrao;
}

const ETAPAS_ATIVAS: EtapaCadastro[] = ['criando_usuario', 'lendo_digitais', 'aguardando_dedo'];

function estaAtiva(sessao: SessaoCadastro): boolean {
  return ETAPAS_ATIVAS.includes(sessao.etapa);
}

function tocar(sessao: SessaoCadastro): SessaoCadastro {
  sessao.dtAtualizacao = new Date();
  return sessao;
}

function falhar(sessao: SessaoCadastro, mensagem: string): SessaoCadastro {
  sessao.etapa = 'erro';
  sessao.dsMensagem = mensagem;
  forcarSync(sessao.deviceId);
  return tocar(sessao);
}

function concluir(sessao: SessaoCadastro, mensagem: string): SessaoCadastro {
  sessao.etapa = 'concluido';
  sessao.dsMensagem = mensagem;
  // A validade do aluno no equipamento e concedida pela reconciliacao, nao por
  // aqui — cadastro de digital nao decide quem pode entrar. Forcamos o ciclo
  // para que a decisao saia em segundos, e nao nos ate 5 minutos do intervalo
  // normal: o aluno acabou de cadastrar e vai testar a catraca agora.
  forcarSync(sessao.deviceId);
  return tocar(sessao);
}

function expirarSeNecessario(sessao: SessaoCadastro): SessaoCadastro {
  if (!estaAtiva(sessao)) return sessao;
  const tempo = tempos.get(sessao.deviceId);
  if (!tempo) return sessao;
  if (agora() - tempo.msInicio < intervalo(TIMEOUT_MS, 120_000)) return sessao;

  sessao.etapa = 'expirado';
  sessao.dsMensagem = sessao.boVerificacaoIndisponivel
    ? 'Tempo esgotado. O comando foi aceito pela catraca, mas este equipamento nao permite confirmar o cadastro pelo sistema — confira a digital no proprio equipamento.'
    : 'Tempo esgotado sem leitura de digital. Verifique se a catraca entrou em modo de cadastro e tente de novo.';
  forcarSync(sessao.deviceId);
  return tocar(sessao);
}

export function sessaoDoDevice(deviceId: string): SessaoCadastro | null {
  const sessao = sessoes.get(deviceId);
  return sessao ? expirarSeNecessario(sessao) : null;
}

export function sessaoAtiva(deviceId: string): boolean {
  const sessao = sessaoDoDevice(deviceId);
  return sessao !== null && estaAtiva(sessao);
}

/**
 * Encerra a espera do SmartGym.
 *
 * NAO tira a catraca do modo de captura: o comando ja foi entregue e quem sai
 * dele e o proprio equipamento, pelo timeout interno dele. Cancelar aqui
 * significa "pare de esperar e me libere a tela", nao "desfaca".
 */
export function cancelarCadastro(deviceId: string): SessaoCadastro | null {
  const sessao = sessaoDoDevice(deviceId);
  if (!sessao || !estaAtiva(sessao)) return sessao;
  sessao.etapa = 'cancelado';
  sessao.dsMensagem = 'Cadastro cancelado. A catraca sai do modo de captura sozinha em alguns segundos.';
  forcarSync(deviceId);
  return tocar(sessao);
}

// -------------------------------------------------------------------
// Comandos enviados ao equipamento.
// -------------------------------------------------------------------

function comandoDeCriacaoDeUsuario(idAluno: number, nmAluno: string): ComandoControlid {
  // O usuario nasce BLOQUEADO (validade encerrada 1s atras) e quem o abre e a
  // reconciliacao, se o aluno estiver em dia. O caminho oposto — criar liberado
  // e deixar a sincronizacao fechar depois — daria passagem livre a um
  // inadimplente ate o proximo ciclo, e o cadastro de digital e exatamente o
  // momento em que a pessoa esta na recepcao querendo entrar.
  const bloqueado = paraHoraDoEquipamento(new Date()) - 1;
  return comando('create_objects', {
    object: 'users',
    values: [
      {
        // O firmware trunca nomes longos silenciosamente; cortamos aqui para
        // que o nome no equipamento seja o mesmo que a tela mostrou.
        name: nmAluno.slice(0, 60),
        // Matricula no equipamento = id do aluno no SmartGym. Quem abrir a tela
        // da catraca consegue voltar ao cadastro certo sem adivinhar por nome.
        registration: String(idAluno),
        begin_time: 0,
        end_time: bloqueado,
      },
    ],
  });
}

// Forma de `where` em ARRAY, a mesma do load_objects de access_logs — a unica
// comprovadamente aceita por este firmware.
function comandoDeContagemDeDigitais(userId: number): ComandoControlid {
  return comando('load_objects', {
    object: 'templates',
    where: [{ object: 'templates', field: 'user_id', operator: '=', value: userId }],
  });
}

function comandoDeEnrolamento(userId: number): ComandoControlid {
  return comando('remote_enroll', {
    type: 'biometry',
    user_id: userId,
    save: true,
    sync: ENROLL_SYNC,
  });
}

/**
 * Comando de confirmacao, quando for a hora. Chamado pelo handler de push a
 * cada ciclo do equipamento — e o que transforma "mandei cadastrar" em "a
 * digital esta gravada".
 */
export function comandoDeVerificacaoPendente(deviceId: string): ComandoControlid | null {
  const sessao = sessaoDoDevice(deviceId);
  if (!sessao || sessao.etapa !== 'aguardando_dedo') return null;
  if (sessao.nrUsuarioCatraca === null) return null;
  // No modo bloqueante a resposta do proprio enrolamento e o resultado; e
  // quando a consulta de digitais nao existe neste firmware, insistir so gastaria
  // um ciclo de push por vez sem nunca responder nada diferente.
  if (ENROLL_SYNC || sessao.boVerificacaoIndisponivel) return null;

  const tempo = tempos.get(deviceId);
  if (!tempo || tempo.boVerificando) return null;
  if (agora() - tempo.msUltimaVerificacao < intervalo(INTERVALO_VERIFICACAO_MS, 3_000)) return null;

  tempo.boVerificando = true;
  tempo.msUltimaVerificacao = agora();
  return comandoDeContagemDeDigitais(sessao.nrUsuarioCatraca);
}

// -------------------------------------------------------------------
// Ciclo de vida.
// -------------------------------------------------------------------

export function iniciarCadastro(params: {
  deviceId: string;
  idCatraca: number;
  idAluno: number;
  nmAluno: string;
  nrUsuarioCatraca: number | null;
}): SessaoCadastro {
  const { deviceId, idCatraca, idAluno, nmAluno, nrUsuarioCatraca } = params;

  const sessao: SessaoCadastro = {
    deviceId,
    idCatraca,
    idAluno,
    nmAluno,
    nrUsuarioCatraca,
    etapa: 'criando_usuario',
    dsMensagem: 'Criando o usuario na catraca...',
    qtDigitaisAntes: 0,
    qtDigitaisAgora: 0,
    boVerificacaoIndisponivel: false,
    dtInicio: new Date(),
    dtAtualizacao: new Date(),
  };

  sessoes.set(deviceId, sessao);
  tempos.set(deviceId, {
    msInicio: agora(),
    msUltimaVerificacao: agora(),
    boVerificando: false,
  });

  if (nrUsuarioCatraca === null) {
    enfileirar(deviceId, comandoDeCriacaoDeUsuario(idAluno, nmAluno));
    return sessao;
  }

  // Aluno que ja tem numero (segunda digital, ou digital que nao le mais).
  // Antes de mandar cadastrar precisamos saber quantas digitais ele ja tem:
  // sem essa linha de base, "existe uma digital" nao prova que a NOVA entrou —
  // a contagem antiga daria sucesso imediato mesmo com o leitor desligado.
  sessao.etapa = 'lendo_digitais';
  sessao.dsMensagem = 'Consultando as digitais ja cadastradas...';
  enfileirar(deviceId, comandoDeContagemDeDigitais(nrUsuarioCatraca));
  return sessao;
}

// Numero de digitais na resposta. `null` quando a resposta NAO e uma consulta de
// templates — o mesmo endpoint `load_objects` carrega a reconciliacao de
// usuarios, e confundir as duas encerraria a sessao com dado de outro comando.
function contarDigitais(resposta: Record<string, unknown> | null): number | null {
  const lista = resposta?.templates;
  return Array.isArray(lista) ? lista.length : null;
}

/**
 * Avanca a sessao com o que a catraca respondeu em /controlid/result.
 *
 * Retorna a sessao quando a resposta era desta maquina de estados, ou `null`
 * quando o resultado pertencia a outro comando (reconciliacao, bootstrap,
 * coleta de log) — o chamador usa isso so para decidir se loga.
 */
export async function processarRespostaDeCadastro(
  deviceId: string,
  endpoint: string,
  resposta: Record<string, unknown> | null,
  erro: string,
): Promise<SessaoCadastro | null> {
  const sessao = sessaoDoDevice(deviceId);
  if (!sessao || !estaAtiva(sessao)) return null;
  const tempo = tempos.get(deviceId);

  // Passo 1: usuario criado no equipamento.
  if (endpoint === 'create_objects' && sessao.etapa === 'criando_usuario') {
    if (erro) {
      return falhar(sessao, `A catraca recusou a criacao do usuario: ${erro}`);
    }
    const ids = Array.isArray(resposta?.ids) ? (resposta?.ids as unknown[]) : [];
    const idCriado = Number(ids[0]);
    if (!Number.isInteger(idCriado) || idCriado <= 0) {
      return falhar(
        sessao,
        'A catraca confirmou a criacao do usuario mas nao informou o numero gerado.',
      );
    }

    sessao.nrUsuarioCatraca = idCriado;

    // Vincula IMEDIATAMENTE. Usuario que existe no equipamento e nao pertence a
    // nenhum aluno e exatamente o que a reconciliacao bloqueia
    // (CONTROLID_BLOQUEAR_NAO_VINCULADOS): sem esta gravacao, o cadastro que
    // acabamos de fazer seria fechado no ciclo seguinte.
    try {
      await prisma.aluno.update({
        where: { id: sessao.idAluno },
        data: { nrUsuarioCatraca: idCriado },
      });
    } catch {
      return falhar(
        sessao,
        `Usuario ${idCriado} criado na catraca, mas este numero ja esta vinculado a outro aluno no SmartGym. Desfaca o vinculo antigo e cadastre de novo.`,
      );
    }

    sessao.etapa = 'aguardando_dedo';
    sessao.dsMensagem = 'Peca para a pessoa encostar o dedo no leitor da catraca.';
    enfileirar(deviceId, comandoDeEnrolamento(idCriado));
    return tocar(sessao);
  }

  // Passo 1-b: linha de base das digitais de um aluno que ja tinha numero.
  if (endpoint === 'load_objects' && sessao.etapa === 'lendo_digitais') {
    const quantidade = contarDigitais(resposta);
    if (erro || quantidade === null) {
      // Sem linha de base nao da para provar que a digital NOVA entrou. Seguimos
      // assim mesmo — melhor cadastrar sem confirmacao automatica do que travar
      // o operador —, mas a tela vai dizer que nao houve confirmacao.
      sessao.boVerificacaoIndisponivel = true;
      sessao.qtDigitaisAntes = 0;
      sessao.qtDigitaisAgora = 0;
    } else {
      sessao.qtDigitaisAntes = quantidade;
      sessao.qtDigitaisAgora = quantidade;
    }

    if (sessao.nrUsuarioCatraca === null) {
      return falhar(sessao, 'Sessao sem numero de usuario da catraca.');
    }

    sessao.etapa = 'aguardando_dedo';
    sessao.dsMensagem = 'Peca para a pessoa encostar o dedo no leitor da catraca.';
    enfileirar(deviceId, comandoDeEnrolamento(sessao.nrUsuarioCatraca));
    return tocar(sessao);
  }

  // Passo 2: o equipamento aceitou (ou nao) o comando de enrolamento.
  if (endpoint === 'remote_enroll') {
    if (erro) {
      return falhar(
        sessao,
        `A catraca recusou o comando de cadastro de digital: ${erro}. Se o endpoint nao existir neste firmware, o cadastro tera de ser feito no proprio equipamento.`,
      );
    }
    if (ENROLL_SYNC) {
      // Modo bloqueante: a resposta so chega DEPOIS da captura, entao ela ja e
      // o resultado.
      sessao.qtDigitaisAgora = sessao.qtDigitaisAntes + 1;
      return concluir(sessao, 'Digital cadastrada no equipamento.');
    }
    sessao.dsMensagem = 'Catraca em modo de captura. Encoste o dedo no leitor.';
    return tocar(sessao);
  }

  // Passo 3: confirmacao — a digital nova apareceu no equipamento?
  if (endpoint === 'load_objects' && sessao.etapa === 'aguardando_dedo') {
    const quantidade = contarDigitais(resposta);
    // Resposta de outro load_objects (a reconciliacao usa o mesmo endpoint):
    // nao e nossa, e mexer no controle de tempo aqui atrasaria a confirmacao.
    if (!erro && quantidade === null) return null;
    if (tempo) tempo.boVerificando = false;

    if (erro) {
      sessao.boVerificacaoIndisponivel = true;
      sessao.dsMensagem = `Comando entregue, mas este equipamento nao permite confirmar o cadastro pelo sistema (${erro}). Confira a digital na propria catraca.`;
      return tocar(sessao);
    }

    sessao.qtDigitaisAgora = quantidade ?? sessao.qtDigitaisAgora;
    if ((quantidade ?? 0) > sessao.qtDigitaisAntes) {
      return concluir(sessao, 'Digital cadastrada e confirmada no equipamento.');
    }
    return tocar(sessao);
  }

  return null;
}
