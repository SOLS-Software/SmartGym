// Maquina de estados do cadastro de digital.
//
// Este teste existe porque o outro lado do fluxo — a catraca — so pode ser
// exercitado presencialmente, com alguem encostando o dedo no leitor. Tudo o
// que da para verificar sem o equipamento e verificado aqui: os comandos que
// saem, a ordem das etapas e, principalmente, os dois pontos onde a sessao
// poderia mentir "cadastrado" sem ter cadastrado nada.
//
// O prisma e mockado: o banco de desenvolvimento aponta para a nuvem, e um
// teste que grava vinculo de aluno de verdade sujaria dado real.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { alunoUpdate } = vi.hoisted(() => ({ alunoUpdate: vi.fn() }));

vi.mock('../../shared/prisma.js', () => ({
  prisma: { aluno: { update: alunoUpdate } },
}));

import {
  cancelarCadastro,
  comandoDeVerificacaoPendente,
  iniciarCadastro,
  processarRespostaDeCadastro,
  sessaoAtiva,
} from './cadastro.js';
import { proximoComando, tamanhoDaFila } from './fila.js';

// Um serial por teste: fila e sessoes sao mapas de modulo, indexados por
// device. Compartilhar o mesmo serial faria um teste herdar a fila do anterior.
let contador = 0;
function novoDevice(): string {
  contador += 1;
  return `TESTE-${contador}`;
}

function esvaziar(deviceId: string) {
  while (proximoComando(deviceId)) {
    /* descarta */
  }
}

describe('cadastro de digital pelo painel', () => {
  beforeEach(() => {
    alunoUpdate.mockReset();
    alunoUpdate.mockResolvedValue({});
  });

  it('cria o usuario BLOQUEADO — quem libera e a reconciliacao, nao o cadastro', () => {
    const deviceId = novoDevice();
    iniciarCadastro({ deviceId, idCatraca: 1, idAluno: 10, nmAluno: 'Ana', nrUsuarioCatraca: null });

    const comando = proximoComando(deviceId);
    expect(comando?.endpoint).toBe('create_objects');
    expect(comando?.body.object).toBe('users');

    const valores = (comando?.body.values as Record<string, unknown>[])[0] ?? {};
    expect(valores.name).toBe('Ana');
    // Matricula no equipamento = id do aluno no SmartGym.
    expect(valores.registration).toBe('10');
    expect(valores.begin_time).toBe(0);
    // Validade ja encerrada: um inadimplente cadastrado agora nao passa antes do
    // proximo ciclo de reconciliacao.
    expect(Number(valores.end_time)).toBeLessThan(Math.floor(Date.now() / 1000));
  });

  it('grava o vinculo assim que a catraca devolve o numero gerado', async () => {
    const deviceId = novoDevice();
    iniciarCadastro({ deviceId, idCatraca: 1, idAluno: 10, nmAluno: 'Ana', nrUsuarioCatraca: null });
    esvaziar(deviceId);

    const sessao = await processarRespostaDeCadastro(
      deviceId,
      'create_objects',
      { ids: [1013] },
      '',
    );

    // Sem esta gravacao, o usuario recem-criado seria bloqueado no ciclo
    // seguinte por "nao pertence a nenhum aluno".
    expect(alunoUpdate).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { nrUsuarioCatraca: 1013 },
    });
    expect(sessao?.etapa).toBe('aguardando_dedo');
    expect(sessao?.nrUsuarioCatraca).toBe(1013);

    const comando = proximoComando(deviceId);
    expect(comando?.endpoint).toBe('remote_enroll');
    expect(comando?.body.user_id).toBe(1013);
    expect(comando?.body.save).toBe(true);
  });

  it('so conclui quando a contagem de digitais SOBE', async () => {
    const deviceId = novoDevice();
    // Aluno que ja tem numero: o cadastro comeca lendo a linha de base.
    iniciarCadastro({ deviceId, idCatraca: 1, idAluno: 10, nmAluno: 'Ana', nrUsuarioCatraca: 55 });
    expect(proximoComando(deviceId)?.endpoint).toBe('load_objects');

    await processarRespostaDeCadastro(
      deviceId,
      'load_objects',
      { templates: [{ id: 1 }] },
      '',
    );
    esvaziar(deviceId);
    await processarRespostaDeCadastro(deviceId, 'remote_enroll', {}, '');

    // Mesma quantidade da linha de base: ninguem encostou o dedo ainda. Sem a
    // comparacao, "existe uma digital" daria sucesso imediato mesmo com o
    // leitor desligado.
    const parcial = await processarRespostaDeCadastro(
      deviceId,
      'load_objects',
      { templates: [{ id: 1 }] },
      '',
    );
    expect(parcial?.etapa).toBe('aguardando_dedo');

    const final = await processarRespostaDeCadastro(
      deviceId,
      'load_objects',
      { templates: [{ id: 1 }, { id: 2 }] },
      '',
    );
    expect(final?.etapa).toBe('concluido');
  });

  it('ignora o load_objects da reconciliacao — mesmo endpoint, outro comando', async () => {
    const deviceId = novoDevice();
    iniciarCadastro({ deviceId, idCatraca: 1, idAluno: 10, nmAluno: 'Ana', nrUsuarioCatraca: null });
    esvaziar(deviceId);
    await processarRespostaDeCadastro(deviceId, 'create_objects', { ids: [1013] }, '');
    esvaziar(deviceId);

    // A sincronizacao periodica responde `users`, nao `templates`. Se a sessao
    // tratasse isso como confirmacao, contaria 0 digitais e mexeria no controle
    // de tempo da verificacao.
    const resultado = await processarRespostaDeCadastro(
      deviceId,
      'load_objects',
      { users: [{ id: 1013, end_time: 0 }] },
      '',
    );
    expect(resultado).toBeNull();
    expect(sessaoAtiva(deviceId)).toBe(true);
  });

  it('leva a mensagem do equipamento para a tela quando o comando e recusado', async () => {
    const deviceId = novoDevice();
    iniciarCadastro({ deviceId, idCatraca: 1, idAluno: 10, nmAluno: 'Ana', nrUsuarioCatraca: null });
    esvaziar(deviceId);
    await processarRespostaDeCadastro(deviceId, 'create_objects', { ids: [1013] }, '');
    esvaziar(deviceId);

    const sessao = await processarRespostaDeCadastro(
      deviceId,
      'remote_enroll',
      null,
      'Node or attribute not found',
    );

    expect(sessao?.etapa).toBe('erro');
    // O texto do firmware precisa chegar inteiro: e ele que diz se o endpoint
    // existe neste equipamento.
    expect(sessao?.dsMensagem).toContain('Node or attribute not found');
    expect(sessaoAtiva(deviceId)).toBe(false);
  });

  it('segue sem confirmacao automatica se o equipamento nao souber consultar digitais', async () => {
    const deviceId = novoDevice();
    iniciarCadastro({ deviceId, idCatraca: 1, idAluno: 10, nmAluno: 'Ana', nrUsuarioCatraca: 55 });
    esvaziar(deviceId);

    const sessao = await processarRespostaDeCadastro(
      deviceId,
      'load_objects',
      null,
      'Invalid object: templates',
    );

    // Travar o operador seria pior do que cadastrar sem confirmar — mas a tela
    // precisa saber que nao houve confirmacao.
    expect(sessao?.etapa).toBe('aguardando_dedo');
    expect(sessao?.boVerificacaoIndisponivel).toBe(true);
    expect(proximoComando(deviceId)?.endpoint).toBe('remote_enroll');
    // E nao adianta ficar perguntando de novo a cada ciclo de push.
    expect(comandoDeVerificacaoPendente(deviceId)).toBeNull();
  });

  it('cancelar encerra a espera sem enfileirar mais nada', async () => {
    const deviceId = novoDevice();
    iniciarCadastro({ deviceId, idCatraca: 1, idAluno: 10, nmAluno: 'Ana', nrUsuarioCatraca: null });
    esvaziar(deviceId);
    await processarRespostaDeCadastro(deviceId, 'create_objects', { ids: [1013] }, '');
    esvaziar(deviceId);

    const sessao = cancelarCadastro(deviceId);
    expect(sessao?.etapa).toBe('cancelado');
    expect(sessaoAtiva(deviceId)).toBe(false);
    expect(tamanhoDaFila(deviceId)).toBe(0);
  });
});
