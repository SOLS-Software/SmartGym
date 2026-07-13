// Item do catálogo de planos (GET /plans?includeDetails=true).
export type PlanCatalogItem = {
  id: number;
  dsPlano: string;
  boInativo: number;
  frequencia?: { dsFrequencia?: string } | null;
  planoAtividades?: Array<{ id: number; atividade?: { dsAtividade?: string } | null }>;
  planoValores?: Array<{ id: number; vlVenda?: number | string | null; empresa?: { dsEmpresa?: string } | null }>;
  planoEmpresas?: Array<{ id: number; empresa?: { dsEmpresa?: string } | null }>;
};
