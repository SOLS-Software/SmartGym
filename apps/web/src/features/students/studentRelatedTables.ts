import type { CompanyChildField, StudentRelatedTable } from '../../shared/registration/registrationTypes';

type StudentRelatedConfig = StudentRelatedTable & {
  fields: CompanyChildField[];
};

export const studentRelatedTables: StudentRelatedConfig[] = [
  {
    key: 'files',
    endpoint: 'files',
    label: 'Arquivos',
    labelSingular: 'Arquivo',
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
    labelSingular: 'Plano',
    title: 'Planos do aluno',
    columns: [
      { key: 'idPlano', label: 'Plano', lookupLabelKey: 'dsPlano' },
      { key: 'nrDiaPagamento', label: 'Dia pgto' },
      { key: 'dtAdmissao', label: 'Admissão', type: 'date' },
      { key: 'dtVencimento', label: 'Vigência', type: 'date' },
      { key: 'dtEncerramento', label: 'Encerramento', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'idPlano', label: 'Plano', type: 'number', lookupEndpoint: 'plans', lookupLabelKey: 'dsPlano', required: true },
      { key: 'idPromocaoPlano', label: 'Promocao do plano', type: 'number', lookupEndpoint: 'promotion-plans', lookupLabelKey: 'promocao.dsPromocao' },
      { key: 'nrDiaPagamento', label: 'Dia pagamento', type: 'number' },
      { key: 'qtParcelas', label: 'Parcelas', type: 'number' },
      { key: 'dtAdmissao', label: 'Admissao', type: 'date' },
    ],
  },
  {
    key: 'payments',
    endpoint: 'payments',
    label: 'Pagamentos',
    labelSingular: 'Pagamento',
    title: 'Pagamentos do aluno',
    columns: [
      { key: 'idAlunoPlano', label: 'Plano do aluno', lookupLabelKey: 'plano.dsPlano' },
      { key: 'vlPrevisto', label: 'Previsto', type: 'money' },
      { key: 'vlPago', label: 'Pago', type: 'money' },
      { key: 'dtVencimento', label: 'Vencimento', type: 'date' },
      { key: 'dtPagamento', label: 'Pago em', type: 'date' },
      { key: 'idStatusPagamento', label: 'Status', type: 'payment-status', lookupLabelKey: 'dsStatusPagamento' },
    ],
    fields: [
      { key: 'idAlunoPlano', label: 'Plano do aluno', type: 'number', lookupEndpoint: 'students/{studentId}/related/plans', lookupLabelKey: 'plano.dsPlano', required: true },
      { key: 'idProdutoMovimentacao', label: 'Movimentação produto', type: 'number' },
      { key: 'vlPrevisto', label: 'Valor previsto', type: 'number' },
      { key: 'vlPago', label: 'Valor pago', type: 'number' },
      { key: 'idStatusPagamento', label: 'Status pagamento', type: 'number', lookupEndpoint: 'payment-statuses', lookupLabelKey: 'dsStatusPagamento' },
      { key: 'idFormaPagamento', label: 'Forma pagamento', type: 'number', lookupEndpoint: 'payment-methods', lookupLabelKey: 'dsFormaPagamento' },
      { key: 'dtVencimento', label: 'Data vencimento', type: 'date' },
      { key: 'dtCompetencia', label: 'Competência', type: 'date' },
      { key: 'dtPagamento', label: 'Data pagamento', type: 'date' },
    ],
  },
  {
    key: 'evolutions',
    endpoint: 'evolutions',
    label: 'Avaliações',
    labelSingular: 'Avaliação',
    title: 'Avaliações físicas do aluno',
    columns: [
      { key: 'dtAvaliacao', label: 'Data', type: 'date' },
      { key: 'vlPeso', label: 'Peso (kg)' },
      { key: 'vlAltura', label: 'Altura (m)' },
      { key: 'vlPercentualGordura', label: '% gordura' },
      { key: 'vlCircCintura', label: 'Cintura (cm)' },
      { key: 'idFuncionario', label: 'Profissional', lookupLabelKey: 'nmFuncionario' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'dtAvaliacao', label: 'Data da avaliação', type: 'date', required: true },
      { key: 'idFuncionario', label: 'Profissional', type: 'number', lookupEndpoint: 'employees', lookupLabelKey: 'nmFuncionario' },
      { key: 'vlPeso', label: 'Peso (kg)', type: 'number' },
      { key: 'vlAltura', label: 'Altura (m)', type: 'number' },
      { key: 'vlPercentualGordura', label: '% de gordura', type: 'number' },
      { key: 'vlMassaMagra', label: 'Massa magra (kg)', type: 'number' },
      { key: 'vlCircPeitoral', label: 'Peitoral (cm)', type: 'number' },
      { key: 'vlCircCintura', label: 'Cintura (cm)', type: 'number' },
      { key: 'vlCircQuadril', label: 'Quadril (cm)', type: 'number' },
      { key: 'vlCircBraco', label: 'Braço (cm)', type: 'number' },
      { key: 'vlCircCoxa', label: 'Coxa (cm)', type: 'number' },
      // A foto reaproveita a aba Arquivos: sobe lá (com validação de MIME e
      // URL assinada já prontas) e é escolhida aqui pelo nome.
      { key: 'idAlunoArquivo', label: 'Foto da avaliação', type: 'number', lookupEndpoint: 'students/{studentId}/files', lookupLabelKey: 'dsArquivo', size: 'lg' },
      { key: 'dsObservacao', label: 'Observação do profissional', type: 'text', size: 'full' },
    ],
  },
  {
    key: 'checkIns',
    endpoint: 'check-ins',
    label: 'Check-ins',
    labelSingular: 'Check-in',
    title: 'Check-ins do aluno',
    columns: [
      { key: 'idAlunoPlano', label: 'Plano do aluno', lookupLabelKey: 'plano.dsPlano' },
      { key: 'idTipoCheckIn', label: 'Tipo', lookupLabelKey: 'dsTipoCheckIn' },
      { key: 'idPontuacao', label: 'Pontos', lookupLabelKey: 'dsPontuacao' },
      { key: 'dtCadastro', label: 'Cadastro', type: 'datetime' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idAlunoPlano', label: 'Plano do aluno', type: 'number', lookupEndpoint: 'students/{studentId}/related/plans', lookupLabelKey: 'plano.dsPlano', required: true },
      { key: 'idTipoCheckIn', label: 'Tipo de check-in', type: 'number', lookupEndpoint: 'check-in-types', lookupLabelKey: 'dsTipoCheckIn' },
      { key: 'idAlunoTreinosSequencia', label: 'Sequencia treino', type: 'number', lookupEndpoint: 'student-training-sequences', lookupLabelKey: 'nrOrdem' },
      { key: 'idPontuacao', label: 'Pontos', type: 'number', lookupEndpoint: 'points', lookupLabelKey: 'dsPontuacao' },
    ],
  },
];
