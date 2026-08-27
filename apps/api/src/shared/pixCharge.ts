// Gerar o codigo de pagamento de UMA parcela.
//
// Um caminho para o aluno, dois desfechos conforme a conta da academia:
//
//  - CONTA PIX PROPRIA: montamos o codigo aqui mesmo (shared/pix.ts), a partir
//    da chave da academia. Ninguem no meio, e por isso ninguem avisa quando o
//    dinheiro cai — a baixa e no Caixa.
//
//  - CONTA DE GATEWAY: a cobranca e criada no provedor e o codigo vem dele. E
//    isso que faz o webhook existir depois: o provedor so avisa sobre cobranca
//    que ele mesmo criou.
//
// EMISSAO SOB DEMANDA, e nao ao gerar as parcelas: um plano anual criaria doze
// cobrancas no provedor de uma vez, a maioria para meses que talvez nem sejam
// vividos (o aluno troca de plano, cancela). Emitir quando o aluno pede alinha
// o custo e o cadastro la com a realidade.
//
// IDEMPOTENTE: se a parcela ja tem cobranca no provedor, consultamos em vez de
// criar. Sem isto, dois toques no botao virariam duas cobrancas para o mesmo
// mes, e o aluno pagaria a que visse primeiro.
import type { Prisma } from '@smartgym/db';
import { buildPixPayload, isValidPixPayload, normalizePixKey, type PixKeyType } from './pix.js';
import { decryptSecret } from './secrets.js';
import { decryptCpfValue } from './pii.js';
import {
  createAsaasPayment,
  ensureAsaasCustomer,
  fetchAsaasPixCode,
  type AsaasEnvironment,
} from './asaas.js';

export type ChargeResult = {
  /** Codigo Pix copia e cola. */
  codigo: string | null;
  /** Pagina de pagamento do provedor, quando existe. */
  urlPagamento: string | null;
  valor: number;
  dtVencimento: Date | null;
  beneficiario: string;
  origem: 'pix_proprio' | 'provedor';
  instrucao: string;
};

type Conta = {
  id: number;
  cnProvedor: string;
  cnAmbiente: string;
  caChavePix: string | null;
  cnTipoChavePix: string | null;
  nmBeneficiario: string | null;
  dsCidade: string | null;
  caCredencial: string | null;
};

type Pagamento = {
  id: number;
  vlPrevisto: unknown;
  dtVencimento: Date | null;
  caTransacaoExterna: string | null;
};

type Aluno = {
  id: number;
  nmAluno: string;
  caCPF: string;
  anEmail: string;
  nrDDD: number;
  nrContato: string | null;
};

const AMBIENTE = (conta: Conta): AsaasEnvironment =>
  conta.cnAmbiente === 'sandbox' ? 'sandbox' : 'producao';

/** Codigo Pix montado por nos, a partir da chave da academia. */
function gerarPixProprio(conta: Conta, pagamento: Pagamento, valor: number): ChargeResult {
  if (!conta.caChavePix) throw new Error('A conta nao tem chave Pix cadastrada.');
  if (!conta.nmBeneficiario || !conta.dsCidade) {
    // O padrao do Banco Central exige os dois. Sem eles o app do banco recusa
    // sem dizer por que — a mensagem explicita aqui evita uma cacada.
    throw new Error('A conta Pix precisa de nome do beneficiario e cidade.');
  }

  const codigo = buildPixPayload({
    chave: normalizePixKey(
      decryptSecret(conta.caChavePix),
      (conta.cnTipoChavePix ?? 'aleatoria') as PixKeyType,
    ),
    nomeBeneficiario: conta.nmBeneficiario,
    cidade: conta.dsCidade,
    valor,
    txid: `SG${pagamento.id}`,
  });

  // Auto-conferencia antes de entregar: o aluno nao pode ser quem descobre um
  // codigo quebrado, no app do banco.
  if (!isValidPixPayload(codigo)) {
    throw new Error('Codigo Pix gerado nao passou na propria validacao.');
  }

  return {
    codigo,
    urlPagamento: null,
    valor,
    dtVencimento: pagamento.dtVencimento,
    beneficiario: conta.nmBeneficiario,
    origem: 'pix_proprio',
    instrucao:
      'Pague pelo app do seu banco usando Pix copia e cola. A academia confirma o pagamento em seguida.',
  };
}

/**
 * Cobranca no provedor: acha ou cria o cliente, emite (uma vez so) e devolve o
 * codigo que ELE gerou.
 *
 * Recebe o `db` para poder gravar o id da cobranca e o de-para do cliente. As
 * chamadas de rede ficam FORA de transacao de propósito: segurar uma transacao
 * aberta durante um round-trip HTTP prende conexao do pool pelo tempo do
 * terceiro, e um provedor lento viraria banco travado.
 */
async function gerarViaProvedor(
  db: Prisma.TransactionClient,
  conta: Conta,
  pagamento: Pagamento,
  aluno: Aluno,
  valor: number,
): Promise<ChargeResult> {
  if (!conta.caCredencial) {
    throw new Error('A conta do provedor esta sem credencial cadastrada.');
  }
  const credencial = decryptSecret(conta.caCredencial);
  const ambiente = AMBIENTE(conta);

  let idCobranca = pagamento.caTransacaoExterna;

  if (!idCobranca) {
    // De-para do aluno com o provedor. Guardado para nao recadastrar a cada
    // parcela — e recadastrar produziria clientes duplicados no painel deles.
    const vinculo = await db.alunoIntegracao.findUnique({
      where: {
        idAluno_idContaRecebimento: { idAluno: aluno.id, idContaRecebimento: conta.id },
      },
      select: { caClienteExterno: true },
    });

    let idCliente = vinculo?.caClienteExterno ?? null;
    if (!idCliente) {
      idCliente = await ensureAsaasCustomer(credencial, ambiente, {
        nome: aluno.nmAluno,
        // O CPF esta cifrado no nosso banco; aqui ele sai para o provedor,
        // porque cobranca no Brasil exige identificar quem paga.
        cpf: decryptCpfValue(aluno.caCPF),
        email: aluno.anEmail,
        telefone: aluno.nrContato ? `${aluno.nrDDD}${aluno.nrContato}` : null,
        referencia: String(aluno.id),
      });
      await db.alunoIntegracao.upsert({
        where: {
          idAluno_idContaRecebimento: { idAluno: aluno.id, idContaRecebimento: conta.id },
        },
        create: {
          idAluno: aluno.id,
          idContaRecebimento: conta.id,
          caClienteExterno: idCliente,
        },
        update: { caClienteExterno: idCliente },
      });
    }

    const cobranca = await createAsaasPayment(credencial, ambiente, {
      idClienteExterno: idCliente,
      valor,
      vencimento: pagamento.dtVencimento ?? new Date(),
      referencia: String(pagamento.id),
      descricao: `Mensalidade #${pagamento.id}`,
    });

    // Gravar ANTES de buscar o codigo: se a busca falhar, a cobranca ja existe
    // no provedor e precisa estar amarrada aqui — senao a proxima tentativa
    // criaria outra, e o aluno teria duas cobrancas do mesmo mes.
    await db.pagamento.update({
      where: { id: pagamento.id },
      data: { caTransacaoExterna: cobranca.id, idContaRecebimento: conta.id },
    });

    idCobranca = cobranca.id;
  }

  const codigo = await fetchAsaasPixCode(credencial, ambiente, idCobranca);

  return {
    codigo,
    urlPagamento: null,
    valor,
    dtVencimento: pagamento.dtVencimento,
    beneficiario: conta.nmBeneficiario ?? 'a academia',
    origem: 'provedor',
    instrucao:
      'Pague pelo app do seu banco usando Pix copia e cola. A confirmacao e automatica.',
  };
}

/**
 * Ponto unico de entrada. Escolhe o caminho pelo provedor da conta.
 */
export async function buildChargeForPayment(
  db: Prisma.TransactionClient,
  conta: Conta,
  pagamento: Pagamento,
  aluno: Aluno,
): Promise<ChargeResult> {
  const valor = Number(pagamento.vlPrevisto ?? 0);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error('Cobranca sem valor definido.');
  }

  if (conta.cnProvedor === 'pix_manual') {
    return gerarPixProprio(conta, pagamento, valor);
  }
  return gerarViaProvedor(db, conta, pagamento, aluno, valor);
}
