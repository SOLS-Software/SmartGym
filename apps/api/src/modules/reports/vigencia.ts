// O que conta como matricula VIGENTE.
//
// A tela de Relatorios exibia lado a lado "Alunos ativos" e "Matriculas
// ativas" medindo coisas diferentes com nomes parecidos: o primeiro contava
// `Aluno.boInativo = false` (a flag do CADASTRO) e o segundo
// `AlunoPlano.boInativo = false` (a flag da LINHA, que ninguem desliga ao
// cancelar). Quem cancelava e nao era inativado entrava nos dois.
//
// Vigencia nao e flag: e intervalo. A matricula vale numa data quando ja
// comecou e ainda nao foi encerrada naquela data. Como a mesma definicao e
// usada pelo /reports/overview, pelo ARPU do /reports/financial e pela base de
// calculo da retencao, ela mora aqui — tres copias divergiriam no primeiro
// ajuste e os numeros da tela parariam de fechar entre si.
import type { Prisma } from '@solsfit/db';

/**
 * Filtro de matriculas vigentes em `referencia` dentro do tenant.
 *
 * Passe a data de HOJE para a base atual, ou o primeiro instante de um periodo
 * para saber qual era a base no comeco dele (o denominador da retencao).
 */
export function matriculaVigenteWhere(
  idCliente: number,
  referencia: Date,
): Prisma.AlunoPlanoWhereInput {
  return {
    boInativo: false,
    aluno: { idCliente },
    AND: [
      // Ainda nao encerrada na data de referencia. Nulo = contrato aberto.
      { OR: [{ dtEncerramento: null }, { dtEncerramento: { gte: referencia } }] },
      // E ja tinha comecado. `dtAdmissao` e nulavel; quando falta, `dtCadastro`
      // (NOT NULL) diz quando a linha passou a existir — sem esse fallback, uma
      // matricula antiga sem data de admissao sumiria da contagem.
      {
        OR: [
          { dtAdmissao: { lte: referencia } },
          { AND: [{ dtAdmissao: null }, { dtCadastro: { lte: referencia } }] },
        ],
      },
    ],
  };
}

/**
 * Filtro de matriculas TRANCADAS numa data.
 *
 * Espelha exatamente `trancamentoCobre` (shared/trancamento.ts): inicio <=
 * referencia, e o fim vem de `dtRetorno` quando existe, senao de
 * `dtPrevisaoRetorno`, senao nunca. As duas implementacoes precisam concordar —
 * uma decide o acesso do aluno na catraca e a outra o numero no painel, e um
 * gestor ligando para alguem que o sistema deixou entrar seria constrangedor.
 * Se mexer numa, mexa na outra; o teste de trancamento.test.ts trava a regra.
 *
 * Vigente NAO exclui trancada: o contrato pausado continua em vigor, so nao
 * vale hoje. Quem quer so as que estao valendo compoe com `NOT`.
 */
export function matriculaTrancadaWhere(referencia: Date): Prisma.AlunoPlanoWhereInput {
  return {
    trancamentos: {
      some: {
        boInativo: false,
        dtInicio: { lte: referencia },
        OR: [
          { dtRetorno: { gt: referencia } },
          { AND: [{ dtRetorno: null }, { dtPrevisaoRetorno: { gt: referencia } }] },
          { AND: [{ dtRetorno: null }, { dtPrevisaoRetorno: null }] },
        ],
      },
    },
  };
}

/**
 * Vigente E em uso hoje — o contrato existe e nao esta pausado.
 *
 * E este o numero que serve de denominador para receita por aluno: quem esta
 * trancado nao esta pagando, e divide-lo junto derrubaria o ARPU sem que a
 * academia tivesse perdido nada.
 */
export function matriculaAtivaWhere(
  idCliente: number,
  referencia: Date,
): Prisma.AlunoPlanoWhereInput {
  return {
    AND: [matriculaVigenteWhere(idCliente, referencia), { NOT: matriculaTrancadaWhere(referencia) }],
  };
}
