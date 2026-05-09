import type { CompanyChildField, StudentRelatedTable } from '../../shared/registration/registrationTypes';

type StudentRelatedConfig = StudentRelatedTable & {
  fields: CompanyChildField[];
};

export const studentRelatedTables: StudentRelatedConfig[] = [
  {
    key: 'files',
    endpoint: 'files',
    label: 'Arquivos',
    title: 'Arquivos do aluno',
    columns: [
      { key: 'dsArquivo', label: 'Arquivo' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [],
  },
  {
    key: 'plans',
    endpoint: 'plans',
    label: 'Planos',
    title: 'Planos do aluno',
    columns: [
      { key: 'idPlano', label: 'Plano', lookupLabelKey: 'dsPlano' },
      { key: 'nrDiaPagamento', label: 'Dia pgto' },
      { key: 'dtAdmissao', label: 'AdmissÃ£o', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'idPlano', label: 'Plano', type: 'number', lookupEndpoint: 'plans', lookupLabelKey: 'dsPlano', required: true },
      { key: 'idPromocaoPlano', label: 'Promocao do plano', type: 'number', lookupEndpoint: 'promotion-plans', lookupLabelKey: 'id' },
      { key: 'nrDiaPagamento', label: 'Dia pagamento', type: 'number' },
      { key: 'dtAdmissao', label: 'Admissao', type: 'date' },
    ],
  },
  {
    key: 'promotions',
    endpoint: 'promotions',
    label: 'Promoções',
    title: 'Promoções da matrícula',
    columns: [
      { key: 'dsPromocao', label: 'Promoção' },
      { key: 'idEmpresa', label: 'Empresa', lookupLabelKey: 'dsEmpresa' },
      { key: 'pcDesconto', label: '% desconto' },
      { key: 'vlDesconto', label: 'Valor', type: 'money' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'dsPromocao', label: 'Promoção', type: 'text', required: true },
      { key: 'qtPeriodo', label: 'Período', type: 'number' },
      { key: 'idUnidadeTempo', label: 'Unidade de tempo', type: 'number', lookupEndpoint: 'time-units', lookupLabelKey: 'dsUnidadeTempo' },
      { key: 'vlDesconto', label: 'Valor desconto', type: 'number' },
      { key: 'pcDesconto', label: 'Percentual desconto', type: 'number' },
      { key: 'dtInicio', label: 'Início', type: 'date' },
      { key: 'dtEncerramento', label: 'Encerramento', type: 'date' },
    ],
  },
  {
    key: 'payments',
    endpoint: 'payments',
    label: 'Pagamentos',
    title: 'Pagamentos do aluno',
    columns: [
      { key: 'idAlunoPlano', label: 'Plano do aluno', lookupLabelKey: 'plano.dsPlano' },
      { key: 'vlPagamento', label: 'Valor', type: 'money' },
      { key: 'dtPagamento', label: 'Pagamento', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idAlunoPlano', label: 'Plano do aluno', type: 'number', lookupEndpoint: 'students/{studentId}/related/plans', lookupLabelKey: 'plano.dsPlano', required: true },
      { key: 'idProdutoMovimentacao', label: 'MovimentaÃ§Ã£o produto', type: 'number' },
      { key: 'vlPagamento', label: 'Valor', type: 'number' },
      { key: 'idStatusPagamento', label: 'Status pagamento', type: 'number', lookupEndpoint: 'payment-statuses', lookupLabelKey: 'dsStatusPagamento' },
      { key: 'idFormaPagamento', label: 'Forma pagamento', type: 'number', lookupEndpoint: 'payment-methods', lookupLabelKey: 'dsFormaPagamento' },
      { key: 'dtPagamento', label: 'Data pagamento', type: 'date' },
    ],
  },
  {
    key: 'checkIns',
    endpoint: 'check-ins',
    label: 'Check-ins',
    title: 'Check-ins do aluno',
    columns: [
      { key: 'idAlunoPlano', label: 'Plano do aluno', lookupLabelKey: 'plano.dsPlano' },
      { key: 'idPontos', label: 'Pontos', lookupLabelKey: 'dsPontos' },
      { key: 'dtCadastro', label: 'Cadastro', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idAlunoPlano', label: 'Plano do aluno', type: 'number', lookupEndpoint: 'students/{studentId}/related/plans', lookupLabelKey: 'plano.dsPlano', required: true },
      { key: 'idAlunoTreinosSequencia', label: 'Sequencia treino', type: 'number', lookupEndpoint: 'student-training-sequences', lookupLabelKey: 'nrOrdem' },
      { key: 'idPontos', label: 'Pontos', type: 'number', lookupEndpoint: 'points', lookupLabelKey: 'dsPontos' },
    ],
  },
];
