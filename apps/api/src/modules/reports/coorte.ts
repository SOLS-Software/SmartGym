// Retencao por safra, churn mensal e permanencia — a partir de uma lista de
// intervalos de matricula.
//
// Modulo PURO (sem prisma, sem fastify), como janelas.ts: a aritmetica de
// coorte e a que mais engana. Um "mes 0" definido errado inverte a leitura da
// tabela inteira, e o resultado continua parecendo plausivel — 100% na primeira
// coluna e queda suave nas seguintes e exatamente o que se espera ver, esteja
// certo ou errado. So teste pega.
//
// O QUE E UMA COORTE AQUI
//
// Safra = o mes em que a matricula comecou. Para cada safra, a linha mostra
// quantas daquelas matriculas continuavam vivas ao FIM de cada mes seguinte.
//
// O mes 0 NAO e 100% de proposito: e quantas sobreviveram ao proprio mes de
// entrada. Quem assina e desiste em duas semanas e um problema diferente de
// quem sai no quinto mes, e a tabela precisa saber distinguir os dois. Fixar o
// mes 0 em 100% (como e comum) esconderia justamente a desistencia mais cara,
// que e a imediata.
//
// RETENCAO CONTRATUAL, NAO COMPORTAMENTAL
//
// "Continuar vivo" = matricula ainda nao encerrada. A alternativa seria "fez
// check-in naquele mes", que descreve melhor quem de fato treina — mas depende
// de a academia registrar toda entrada. Onde o registro e parcial (catraca
// recem-instalada, aula solta sem check-in), a coorte comportamental mostra
// evasao que nao existe. A contratual e a que casa com o churn e com a receita,
// entao e ela que manda aqui.

import { MESES_PT } from './janelas.js';

/** Uma matricula reduzida ao que a coorte precisa: quando comecou e se acabou. */
export type Matricula = {
  inicio: Date;
  /** Nulo = contrato aberto. */
  fim: Date | null;
};

export type LinhaCoorte = {
  /** Chave da safra, 'YYYY-MM'. */
  safra: string;
  /** Rotulo curto, 'ago/26'. */
  label: string;
  /** Quantas matriculas entraram nessa safra — o denominador da linha. */
  tamanho: number;
  /**
   * Retidas ao fim de cada mes decorrido. `null` marca mes que ainda nao
   * terminou: sem isso, o mes corrente apareceria como queda brusca so porque
   * ainda esta acontecendo, e a ultima coluna da tabela sempre pareceria um
   * desastre.
   */
  retidas: Array<number | null>;
};

function inicioDoMes(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), 1);
}

/** Ultimo instante do mes `offset` meses depois de `base`. */
function fimDoMesDeslocado(base: Date, offset: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + offset + 1, 0, 23, 59, 59, 999);
}

function chaveDoMes(data: Date): string {
  return `${data.getFullYear()}-${`${data.getMonth() + 1}`.padStart(2, '0')}`;
}

function rotuloDoMes(data: Date): string {
  return `${MESES_PT[data.getMonth()]}/${`${data.getFullYear()}`.slice(2)}`;
}

/**
 * Monta a matriz de retencao: uma linha por safra, uma coluna por mes decorrido.
 *
 * `quantidadeSafras` conta para tras a partir do mes de `referencia`. A safra
 * mais recente tem so a coluna 0 medida; a mais antiga tem todas — e esse
 * triangulo e a propria leitura da tabela.
 */
export function montarCoorte(
  matriculas: Matricula[],
  quantidadeSafras: number,
  referencia: Date = new Date(),
): LinhaCoorte[] {
  const mesReferencia = inicioDoMes(referencia);
  const linhas: LinhaCoorte[] = [];

  for (let i = quantidadeSafras - 1; i >= 0; i -= 1) {
    const safra = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth() - i, 1);
    const proximaSafra = new Date(safra.getFullYear(), safra.getMonth() + 1, 1);

    const daSafra = matriculas.filter(
      (matricula) => matricula.inicio >= safra && matricula.inicio < proximaSafra,
    );

    // A safra mais antiga tem `quantidadeSafras - 1` meses decorridos; a mais
    // nova, zero. O laco de colunas vai ate i porque i E a distancia dela ate
    // hoje.
    const retidas: Array<number | null> = [];
    for (let offset = 0; offset < quantidadeSafras; offset += 1) {
      if (offset > i) {
        retidas.push(null); // mes ainda nao aconteceu para esta safra
        continue;
      }
      const corte = fimDoMesDeslocado(safra, offset);
      retidas.push(
        daSafra.filter((matricula) => matricula.fim === null || matricula.fim > corte).length,
      );
    }

    linhas.push({
      safra: chaveDoMes(safra),
      label: rotuloDoMes(safra),
      tamanho: daSafra.length,
      retidas,
    });
  }

  return linhas;
}

export type PontoChurn = {
  label: string;
  /** Matriculas vivas no primeiro instante do mes — o denominador. */
  base: number;
  saidas: number;
  /** Nulo quando nao havia base: mes sem denominador nao tem taxa. */
  taxa: number | null;
};

/**
 * Churn mes a mes: quantas saiam sobre quantas havia no comeco do mes.
 *
 * O mes corrente entra na serie, mas incompleto por natureza — quem le precisa
 * saber que a ultima barra ainda esta sendo escrita. A rota devolve o mes de
 * referencia junto para a tela poder marcar.
 */
export function churnMensal(
  matriculas: Matricula[],
  quantidadeMeses: number,
  referencia: Date = new Date(),
): PontoChurn[] {
  const mesReferencia = inicioDoMes(referencia);
  const pontos: PontoChurn[] = [];

  for (let i = quantidadeMeses - 1; i >= 0; i -= 1) {
    const mes = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth() - i, 1);
    const proximoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);

    // Base: comecou antes do mes e ainda nao tinha encerrado quando ele abriu.
    const base = matriculas.filter(
      (matricula) =>
        matricula.inicio < mes && (matricula.fim === null || matricula.fim >= mes),
    ).length;

    const saidas = matriculas.filter(
      (matricula) => matricula.fim !== null && matricula.fim >= mes && matricula.fim < proximoMes,
    ).length;

    pontos.push({
      label: rotuloDoMes(mes),
      base,
      saidas,
      taxa: base > 0 ? saidas / base : null,
    });
  }

  return pontos;
}

export type Permanencia = {
  /** Quantas matriculas ja encerraram — a amostra da qual a media sai. */
  encerradas: number;
  /** Media em dias. Nula quando nenhuma matricula encerrou ainda. */
  mediaDias: number | null;
  /** Mediana em dias: resiste ao aluno de dez anos que sozinho puxa a media. */
  medianaDias: number | null;
};

/**
 * Quanto tempo a matricula media dura, medido so sobre as que JA acabaram.
 *
 * Incluir as abertas subestimaria tudo — uma matricula de ontem entraria como
 * "1 dia de permanencia" e derrubaria a media junto com quem realmente saiu no
 * dia seguinte. O preco de excluir e conhecido e vale dizer na tela: quem fica
 * muito tempo demora a aparecer nesta conta.
 */
export function permanencia(matriculas: Matricula[]): Permanencia {
  const duracoes = matriculas
    .filter((matricula): matricula is Matricula & { fim: Date } => matricula.fim !== null)
    .map((matricula) => (matricula.fim.getTime() - matricula.inicio.getTime()) / 86_400_000)
    .filter((dias) => Number.isFinite(dias) && dias >= 0)
    .sort((a, b) => a - b);

  if (duracoes.length === 0) {
    return { encerradas: 0, mediaDias: null, medianaDias: null };
  }

  const soma = duracoes.reduce((total, dias) => total + dias, 0);
  const meio = Math.floor(duracoes.length / 2);
  const mediana =
    duracoes.length % 2 === 0 ? (duracoes[meio - 1]! + duracoes[meio]!) / 2 : duracoes[meio]!;

  return {
    encerradas: duracoes.length,
    mediaDias: soma / duracoes.length,
    medianaDias: mediana,
  };
}
