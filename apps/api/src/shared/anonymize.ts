import { prisma } from './prisma.js';
import { deleteComprefaceSubject } from './compreface.js';
import { getSupabaseConfig, getSupabaseClient } from './supabase.js';

// LGPD — eliminacao por ANONIMIZACAO (art. 18, VI).
//
// Decisao de negocio: anonimizar MANTENDO o financeiro. Apaga a PII e o dado
// sensivel (biometria local + no CompreFace, avaliacao fisica, arquivos) e
// embaralha a identidade da ficha, mas PRESERVA planos e pagamentos (retencao
// fiscal) — agora ligados a um titular sem identidade. Irreversivel.
//
// Extraido do handler POST /students/:id/anonymize para ser reusado tanto pela
// rota (a pedido do titular) quanto pelo expurgo em lote (scripts/retention.ts,
// retencao automatica). A LOGICA E A MESMA — mudar aqui muda os dois caminhos.
//
// IMPORTANTE: assume que o CHAMADOR ja validou que `idAluno` pertence a
// `idCliente` (a rota faz o 404 por tenant; o expurgo so consulta candidatos
// ja escopados). Este helper NAO refaz essa checagem.

// Logger minimo, compativel com o logger do Fastify (pino) e com o console.
export type AnonymizeLogger = { warn: (obj: unknown, msg?: string) => void };

export type AnonymizeResult = {
  idAluno: number;
  anonimizado: true;
  biometriasRemovidas: number;
  arquivosRemovidos: number;
  sessoesEncerradas: number;
  // Preserva o financeiro por retencao fiscal (decisao de negocio).
  financeiroPreservado: true;
  // O que nao foi removido de servicos externos (CompreFace/storage) e precisa
  // de reprocesso manual — ou, com skipExternal, o que foi deixado de proposito.
  pendenciasExternas: string[];
};

export async function anonymizeStudent(
  idAluno: number,
  idCliente: number,
  opts: { log?: AnonymizeLogger; skipExternal?: boolean } = {},
): Promise<AnonymizeResult> {
  const { log, skipExternal = false } = opts;

  // Coleta ANTES de apagar o que precisa ir para servicos externos.
  const biometrias = await prisma.alunoBiometriaFacial.findMany({
    where: { idAluno },
    select: { dsSubject: true },
  });
  const arquivos = await prisma.alunoArquivo.findMany({
    where: { idAluno },
    select: { anCaminho: true },
  });
  const usuarios = await prisma.usuario.findMany({
    where: { idAluno, idCliente },
    select: { id: true },
  });
  const idsUsuario = usuarios.map((u) => u.id);

  await prisma.$transaction(async (tx) => {
    // Dado sensivel e PII sai; a ordem respeita as FKs para AlunoArquivo.
    await tx.alunoBiometriaFacial.deleteMany({ where: { idAluno } });
    await tx.alunoEvolucao.deleteMany({ where: { idAluno } });
    await tx.alunoArquivo.deleteMany({ where: { idAluno } });
    // Encerra o acesso: dispositivos de push fora, usuarios inativos e com a
    // versao de sessao incrementada (derruba qualquer token vivo).
    if (idsUsuario.length > 0) {
      await tx.usuarioDispositivo.deleteMany({ where: { idUsuario: { in: idsUsuario } } });
      await tx.usuario.updateMany({
        where: { id: { in: idsUsuario } },
        data: { boInativo: true, nrTokenVersion: { increment: 1 } },
      });
    }
    // Embaralha a identidade da ficha; mantem o id (financeiro pende dele).
    await tx.aluno.update({
      where: { id: idAluno },
      data: {
        nmAluno: `Titular anonimizado #${idAluno}`,
        caCPF: '',
        caCPFHash: null,
        anEmail: '',
        nrDDD: 0,
        nrContato: null,
        anCEP: '',
        anLogradouro: '',
        anComplemento: '',
        anBairro: '',
        nrEndereco: null,
        dtNascimento: null,
        nrUsuarioCatraca: null,
        boInativo: true,
      },
    });
  });

  // Servicos externos: best-effort, FORA da transacao. A anonimizacao do banco
  // (o que a LGPD cobra) nao pode falhar por um provedor fora do ar; o que nao
  // apagar aqui fica no log/retorno para reprocessar a mao.
  const pendencias: string[] = [];
  if (skipExternal) {
    // Expurgo em lote pode optar por nao tocar CompreFace/storage no mesmo
    // momento (ex.: limpeza fora de janela); reporta o que ficou pendente.
    for (const bio of biometrias) if (bio.dsSubject) pendencias.push(`compreface:${bio.dsSubject}`);
    const nArquivos = arquivos.map((a) => a.anCaminho).filter(Boolean).length;
    if (nArquivos > 0) pendencias.push(`storage:${nArquivos} arquivo(s)`);
    return {
      idAluno,
      anonimizado: true,
      biometriasRemovidas: biometrias.length,
      arquivosRemovidos: arquivos.length,
      sessoesEncerradas: idsUsuario.length,
      financeiroPreservado: true,
      pendenciasExternas: pendencias,
    };
  }

  for (const bio of biometrias) {
    if (!bio.dsSubject) continue;
    try {
      await deleteComprefaceSubject(bio.dsSubject);
    } catch (err) {
      log?.warn({ err, subject: bio.dsSubject }, 'Anonimizacao: falha ao remover subject no CompreFace.');
      pendencias.push(`compreface:${bio.dsSubject}`);
    }
  }
  const caminhos = arquivos.map((a) => a.anCaminho).filter(Boolean);
  if (caminhos.length > 0) {
    try {
      const { bucket } = getSupabaseConfig();
      await getSupabaseClient().storage.from(bucket).remove(caminhos);
    } catch (err) {
      log?.warn({ err }, 'Anonimizacao: falha ao remover arquivos do storage.');
      pendencias.push(`storage:${caminhos.length} arquivo(s)`);
    }
  }

  return {
    idAluno,
    anonimizado: true,
    biometriasRemovidas: biometrias.length,
    arquivosRemovidos: arquivos.length,
    sessoesEncerradas: idsUsuario.length,
    financeiroPreservado: true,
    pendenciasExternas: pendencias,
  };
}
