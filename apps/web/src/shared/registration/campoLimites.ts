import { FAIXAS, LIMITES } from '@smartgym/shared';
import type { CompanyChildField } from './registrationTypes';

// Restricoes dos campos das tabelas filhas, derivadas da coluna.
//
// As telas de cadastro filho (empresa, aluno, plano, promocao, treino, agenda)
// renderizam os campos a partir de uma lista declarativa e cada uma montava o
// input do mesmo jeito:
//
//   <input required={field.required} type={field.type} />
//
// Sem `maxLength`, sem `min`/`max` e — o pior — sem `step`. Um
// `<input type="number">` sem `step` usa `step=1`, entao o BROWSER recusava
// 72,4 no peso e 150,50 no valor da parcela antes mesmo do onSubmit: a
// avaliacao fisica inteira e as telas de dinheiro nao aceitavam decimal.
//
// Aqui as restricoes saem de uma fonte so (@smartgym/shared), a mesma que o
// normalizador da API le. Cada tela passa a espalhar `limitesDoCampo(field)` no
// input e para de decidir limite por conta propria.

/** Nome da coluna -> tamanho maximo em caracteres, para os campos de texto. */
const MAX_TEXTO: Record<string, number> = {
  dsArquivo: 255,
  anCaminho: 255,
  dsTema: LIMITES.tema.dsTema,
  dsPromocao: LIMITES.promocao.dsPromocao,
  dsObservacao: LIMITES.avaliacao.dsObservacao,
  dsHistorico: 255,
  dsMotivo: LIMITES.trancamento.dsMotivo,
  dsMotivoCancelamento: 255,
};

export type LimitesDeCampo = {
  maxLength?: number;
  min?: number;
  max?: number;
  /** `'any'` desliga a checagem de passo sem afastar min/max. */
  step?: number | 'any';
};

/**
 * Atributos de validacao para um campo declarativo, prontos para espalhar no
 * input. Campo de tipo sem limite conhecido (date, por exemplo) volta objeto
 * vazio — o input fica como estava, entao adotar isto nao muda tela nenhuma
 * por acidente.
 */
export function limitesDoCampo(field: Pick<CompanyChildField, 'key' | 'type'>): LimitesDeCampo {
  if (field.type === 'number') {
    const faixa = FAIXAS[field.key];
    // Numero ainda nao mapeado em FAIXAS mantem o piso 0 que as telas ja
    // aplicavam, com step="any" para nao recusar decimal por omissao.
    if (!faixa) return { min: 0, step: 'any' };
    return { min: faixa.min, max: faixa.max, step: faixa.passo };
  }

  if (field.type === 'text') {
    // 255 e o VarChar mais comum do schema e ja era o default que a tela de
    // dominios aplicava. Quem foge disso (dsObservacao, VarChar(1000)) esta
    // mapeado acima.
    return { maxLength: MAX_TEXTO[field.key] ?? 255 };
  }

  return {};
}
