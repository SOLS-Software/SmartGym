import { headers } from 'next/headers';
import { marcaPorHostname } from '../../src/shared/marca/marcaPorHost';

/**
 * Página pública de exclusão de conta.
 *
 * Existe por duas razões que não se sobrepõem:
 *
 *  - a Google Play exige, de todo app que cria conta, um caminho de exclusão
 *    dentro do app E um endereço na web. O endereço serve para quem já
 *    desinstalou o aplicativo e, por isso mesmo, não alcança mais o caminho de
 *    dentro dele;
 *  - a LGPD (art. 18, VI) dá o direito ao titular, e o direito não pode
 *    depender de a pessoa ter o app instalado.
 *
 * NÃO É UM FORMULÁRIO, e isso é deliberado. Um campo de CPF aberto a visitante
 * anônimo seria, ao mesmo tempo, um ponto de coleta de dado pessoal sem base
 * legal clara e um oráculo de enumeração: quem digitasse CPFs descobriria quem
 * é aluno daquela academia. O pedido por canal identificado protege melhor o
 * titular do que um formulário que aceita qualquer um.
 *
 * O texto fala da ACADEMIA, não da SOLS: perante o aluno, quem é controladora
 * dos dados é a academia; a SOLS é operadora. Escrever o contrário aqui seria
 * declarar publicamente uma responsabilidade que não é nossa — e confundir para
 * quem o titular deve reclamar.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return { title: 'Excluir conta', robots: { index: false, follow: false } };
}

export default async function ExcluirContaPage() {
  const cabecalhos = await headers();
  const host =
    (cabecalhos.get('x-forwarded-host') ?? cabecalhos.get('host'))?.split(',')[0]?.trim() ?? null;
  const marca = await marcaPorHostname(host?.toLowerCase() ?? null);
  const academia = marca?.dsCliente?.trim() ?? 'sua academia';
  const cor = marca?.corPrimaria || '#032da2';

  return (
    <main
      style={{
        maxWidth: '44rem',
        margin: '0 auto',
        padding: '2.5rem 1.5rem 4rem',
        fontFamily: 'Inter, system-ui, sans-serif',
        lineHeight: 1.6,
        color: '#17211c',
      }}
    >
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>
        Excluir sua conta
      </h1>
      <p style={{ color: '#52605a', marginTop: 0 }}>
        Conta do aplicativo de <strong>{academia}</strong>.
      </p>

      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '2rem' }}>Pelo aplicativo</h2>
      <p>
        Se você ainda tem o aplicativo instalado, o caminho mais rápido é: entrar na sua conta,
        abrir <strong>Mais → Privacidade</strong> e usar <strong>Excluir minha conta</strong>. A
        exclusão acontece na hora.
      </p>

      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '2rem' }}>
        Se você não tem mais o aplicativo
      </h2>
      <p>
        Peça a exclusão diretamente a {academia}, pelo mesmo canal que você usa para falar com a
        recepção — telefone, e-mail ou pessoalmente. O pedido é atendido sem custo, e a academia
        pode pedir que você se identifique antes, para ter certeza de que a conta é sua.
      </p>

      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '2rem' }}>O que é apagado</h2>
      <p style={{ marginBottom: '0.5rem' }}>
        Nome, CPF, data de nascimento, telefone, e-mail, endereço, foto, biometria facial,
        avaliações físicas, treinos e arquivos anexados ao seu cadastro.
      </p>

      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '2rem' }}>O que é mantido</h2>
      <p>
        O histórico de pagamentos, <strong>sem ligação com você</strong>. A academia é obrigada a
        guardar registro fiscal e contábil por prazo definido em lei, e a LGPD preserva essa guarda
        (art. 16, I). O que fica não identifica mais a pessoa.
      </p>
      <p>
        A conta só pode ser excluída depois que a matrícula terminar e não houver pagamento em
        aberto — sem identificação não há como encerrar um contrato nem acertar uma pendência.
        Cancele a matrícula primeiro, e a exclusão fica liberada.
      </p>

      <p
        style={{
          marginTop: '2.5rem',
          paddingTop: '1.5rem',
          borderTop: `2px solid ${cor}`,
          fontSize: '0.9rem',
          color: '#52605a',
        }}
      >
        A exclusão é <strong>irreversível</strong>: não há como desfazer nem recuperar os dados
        depois. Se você voltar a treinar, será um cadastro novo.
      </p>
    </main>
  );
}
