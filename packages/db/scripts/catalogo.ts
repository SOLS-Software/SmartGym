// Manifesto do CATÁLOGO GLOBAL — a referência que toda instalação do SOLSFIT
// precisa e que é igual em todas elas: exercícios, áreas corporais, esportes,
// formas de pagamento, níveis, unidades, cargos.
//
// Por que este arquivo existe separado do `tenantTables.ts`: a classificação de
// lá responde "em qual banco esta tabela mora"; esta responde "o que é semeado
// num banco novo, e em que ordem". São perguntas diferentes, e DUAS tabelas que
// o tenantTables lista como `catalog` NÃO podem ser semeadas globalmente:
//
//   - `Localidade`  -> tem idEmpresa OBRIGATÓRIO, geometria e vínculo com
//     AtividadeAgenda. São os espaços físicos da academia (sala, piscina), não
//     uma lista geográfica. É dado de aplicação.
//   - `ExercicioEquipamento` -> a FK aponta para `Equipamento`, que é de
//     aplicação. Liga exercício global ao equipamento DE UMA academia.
//
// Ambas ficam de fora daqui. A divergência com o tenantTables é intencional e
// está documentada; se aquela classificação for corrigida, este comentário sai.

/** Tabelas do catálogo, JÁ NA ORDEM DE CARGA (pai antes de filho). */
export const CATALOGO = [
  // --- sem dependências entre si ---
  'areaCorporal',
  'esporte',
  'formaPagamento',
  'metodoTreino',
  'nivel',
  'statusPagamento',
  'tema',
  'tipoArquivo',
  'unidadeMedida',
  'unidadeTempo',
  'cargo',
  'frequencia',

  // --- dependem dos de cima ---
  'exercicio', // só os globais; ver EXERCICIO_GLOBAL abaixo
  'exercicioAreaCorporal', // -> exercicio + areaCorporal
  'exercicioArquivo', // -> exercicio + tipoArquivo
] as const;

export type ModeloCatalogo = (typeof CATALOGO)[number];

/**
 * `Exercicio.idEmpresa` é opcional: NULL = exercício do catálogo global,
 * preenchido = exercício que uma academia criou para si. Sem este filtro, a
 * exportação levaria junto os exercícios personalizados de um cliente para
 * dentro do banco de outro.
 */
export const EXERCICIO_GLOBAL = { idEmpresa: null } as const;

/**
 * Colunas de auditoria não são exportadas: `dtCadastro`/`dtAlteracao` têm
 * default no schema e `idUsuario*` apontam para usuários que não existem no
 * banco de destino. Deixá-las de fora torna o JSON menor, o diff estável e a
 * carga possível.
 */
export const CAMPOS_AUDITORIA = [
  'dtCadastro',
  'dtAlteracao',
  'idUsuarioCadastro',
  'idUsuarioAlteracao',
] as const;

/** Onde os JSON exportados vivem, versionados junto com o schema. */
export const DIR_CATALOGO = 'prisma/catalogo';
