import { headers } from 'next/headers';
import { marcaPorHostname } from '../../src/shared/marca/marcaPorHost';

/**
 * Política de privacidade — RASCUNHO, pendente de revisão jurídica.
 *
 * ATENÇÃO, ANTES DE DIVULGAR ESTE ENDEREÇO: o texto abaixo tem marcadores
 * «assim» em todo ponto que depende de um fato que ainda não existe — CNPJ da
 * SOLS, contato do encarregado, prazos de guarda decididos pelo controlador,
 * região do storage. Publicar uma política com lacuna é pior que não ter: ela
 * vira declaração pública errada, e uma política incorreta é ela própria um
 * achado numa fiscalização.
 *
 * O QUE ESTE TEXTO É: um levantamento fiel do que o sistema realmente coleta,
 * campo por campo, lido do schema e das rotas. É a parte que um advogado não
 * teria como escrever sozinho, e a que costuma sair genérica e errada quando se
 * copia modelo da internet.
 *
 * O QUE ELE NÃO É: aconselhamento jurídico. Quem assina a política é o
 * controlador, e três pontos aqui pedem análise de quem responde por ela: a
 * transferência internacional (o servidor está nos Estados Unidos, e a
 * Resolução CD/ANPD nº 19/2024 rege isso), o tratamento de BIOMETRIA (dado
 * sensível, art. 11), e os prazos de guarda.
 *
 * PAPÉIS, e isso não é detalhe de redação: perante o aluno, a CONTROLADORA é a
 * academia — é ela que decide coletar e para quê. A SOLS é OPERADORA, tratando
 * dados por conta dela. Inverter isso no texto atribuiria à SOLS uma
 * responsabilidade que não é dela e confundiria o titular sobre a quem reclamar.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return { title: 'Política de Privacidade' };
}

const ATUALIZADA_EM = '18 de setembro de 2026';

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: '2rem' }}>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.5rem' }}>{titulo}</h2>
      {children}
    </section>
  );
}

export default async function PrivacidadePage() {
  const cabecalhos = await headers();
  const host =
    (cabecalhos.get('x-forwarded-host') ?? cabecalhos.get('host'))?.split(',')[0]?.trim() ?? null;
  const marca = await marcaPorHostname(host?.toLowerCase() ?? null);
  const academia = marca?.dsCliente?.trim() ?? '«nome da academia»';
  const cor = marca?.corPrimaria || '#032da2';

  return (
    <main
      style={{
        maxWidth: '46rem',
        margin: '0 auto',
        padding: '2.5rem 1.5rem 4rem',
        fontFamily: 'Inter, system-ui, sans-serif',
        lineHeight: 1.65,
        color: '#17211c',
      }}
    >
      <h1 style={{ fontSize: '1.9rem', fontWeight: 800, marginBottom: '0.25rem' }}>
        Política de Privacidade
      </h1>
      <p style={{ color: '#52605a', marginTop: 0 }}>
        {academia} · atualizada em {ATUALIZADA_EM}
      </p>

      <p style={{ marginTop: '1.5rem' }}>
        Esta política explica quais dados pessoais são tratados no aplicativo e no sistema de
        gestão de {academia}, por que são tratados, com quem são compartilhados, por quanto tempo
        ficam guardados e o que você pode exigir a respeito deles. Ela segue a Lei Geral de Proteção
        de Dados Pessoais (Lei nº 13.709/2018).
      </p>

      <Secao titulo="1. Quem trata seus dados">
        <p>
          <strong>Controladora:</strong> {academia}, inscrita no CNPJ «CNPJ da academia», que decide
          quais dados coletar e para quê. É a ela que você pede esclarecimento e exerce seus
          direitos.
        </p>
        <p>
          <strong>Operadora:</strong> SOLS Softwares, CNPJ «CNPJ da SOLS», que fornece o sistema
          SOLSFIT e trata os dados <em>por conta e sob instrução</em> da academia. A SOLS não usa
          seus dados para finalidade própria, não os vende e não os cede a terceiros para
          publicidade.
        </p>
        <p>
          <strong>Encarregado (DPO):</strong> «nome», pelo e-mail «dpo@dominio». É o canal para
          dúvidas e reclamações sobre proteção de dados.
        </p>
      </Secao>

      <Secao titulo="2. Quais dados são tratados">
        <p>
          <strong>Cadastro:</strong> nome, CPF, data de nascimento, telefone, e-mail e endereço
          (CEP, logradouro, número, complemento, bairro).
        </p>
        <p>
          <strong>Acesso e frequência:</strong> registros de entrada na academia, pela catraca ou
          pela recepção, com data, hora e unidade.
        </p>
        <p>
          <strong>Saúde e desempenho:</strong> avaliações físicas (medidas corporais), treinos
          prescritos e execuções registradas. A LGPD classifica dado referente à saúde como{' '}
          <strong>sensível</strong>.
        </p>
        <p>
          <strong>Biometria facial</strong> — também dado sensível — quando você autoriza o acesso
          pelo rosto. O sistema guarda o vetor matemático calculado do rosto, e não a fotografia
          original. Autorizar é opcional: recusando, o acesso continua por outra forma.
        </p>
        <p>
          <strong>Financeiro:</strong> plano contratado, vigência, valores, vencimentos e
          pagamentos.
        </p>
        <p>
          <strong>Arquivos:</strong> foto de perfil e documentos que você ou a academia anexem ao
          cadastro.
        </p>
        <p>
          <strong>Uso do sistema:</strong> registro de acessos às telas que contêm dado pessoal —
          quem acessou, quando, por qual rota e de qual endereço IP. Essa trilha existe para provar
          quem olhou o quê, e é exigência da própria LGPD.
        </p>
        <p>
          <strong>Aparelho:</strong> identificador de notificação do seu celular, se você autorizar
          receber avisos.
        </p>
      </Secao>

      <Secao titulo="3. Para que servem, e com que base legal">
        <ul style={{ paddingLeft: '1.25rem' }}>
          <li>
            Executar o contrato do seu plano: cadastro, acesso, cobrança e prestação do serviço
            (art. 7º, V).
          </li>
          <li>
            Cumprir obrigação legal e regulatória, especialmente fiscal e contábil (art. 7º, II).
          </li>
          <li>
            Biometria facial e comunicações promocionais: <strong>consentimento</strong> específico
            e destacado (art. 7º, I e art. 11, I), que você concede e revoga quando quiser, pelo
            aplicativo, em Mais → Privacidade.
          </li>
          <li>
            Segurança da informação e apuração de incidentes, pela trilha de acessos (art. 7º, IX e
            art. 46).
          </li>
        </ul>
      </Secao>

      <Secao titulo="4. Com quem os dados são compartilhados">
        <p>
          Apenas com quem é necessário para o serviço funcionar, e sempre sob obrigação contratual
          de proteção:
        </p>
        <ul style={{ paddingLeft: '1.25rem' }}>
          <li>provedor de infraestrutura e hospedagem do sistema;</li>
          <li>provedor de armazenamento de arquivos (fotos e documentos);</li>
          <li>meio de pagamento, quando a cobrança é feita pelo aplicativo;</li>
          <li>serviço de envio de notificações e de e-mail;</li>
          <li>autoridades públicas, quando houver determinação legal ou judicial.</li>
        </ul>
        <p>
          O reconhecimento facial roda em servidor da própria operação, e não em serviço de
          terceiros.
        </p>
      </Secao>

      <Secao titulo="5. Transferência internacional">
        <p>
          Parte da infraestrutura está fora do Brasil, em «país/região». Isso caracteriza
          transferência internacional de dados, permitida pela LGPD (art. 33) e disciplinada pela
          Resolução CD/ANPD nº 19/2024, mediante «mecanismo adotado — cláusulas-padrão contratuais
          ou outro».
        </p>
      </Secao>

      <Secao titulo="6. Por quanto tempo ficam guardados">
        <p>
          Enquanto durar sua relação com a academia e, depois disso, pelos prazos exigidos por lei —
          especialmente os fiscais e contábeis, de «prazo» — ou até que você peça a exclusão, o que
          ocorrer primeiro.
        </p>
        <p>
          Encerrado o prazo, o cadastro é <strong>anonimizado</strong>: identidade, biometria,
          avaliações e arquivos são apagados; o histórico financeiro permanece sem ligação com
          pessoa identificável. A trilha de acessos é eliminada após «prazo».
        </p>
      </Secao>

      <Secao titulo="7. Seus direitos, e como exercê-los">
        <p>O art. 18 da LGPD lhe garante, entre outros, o direito de:</p>
        <ul style={{ paddingLeft: '1.25rem' }}>
          <li>confirmar que existe tratamento e acessar seus dados;</li>
          <li>corrigir dado incompleto, inexato ou desatualizado;</li>
          <li>pedir anonimização, bloqueio ou eliminação de dado desnecessário ou excessivo;</li>
          <li>revogar consentimento, a qualquer tempo;</li>
          <li>saber com quem seus dados foram compartilhados;</li>
          <li>pedir a portabilidade a outro fornecedor;</li>
          <li>opor-se a um tratamento feito sem consentimento.</li>
        </ul>
        <p>
          Pelo aplicativo, em <strong>Mais → Privacidade</strong>, você já consegue ver e trocar
          seus dados, ligar e desligar cada consentimento e{' '}
          <strong>excluir sua conta</strong>. Para o que não estiver ali, fale com a recepção de{' '}
          {academia} ou escreva para o encarregado.
        </p>
        <p>
          Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </Secao>

      <Secao titulo="8. Exclusão da conta">
        <p>
          A exclusão apaga nome, CPF, contato, endereço, foto, biometria, avaliações físicas,
          treinos e arquivos, e é <strong>irreversível</strong>. O histórico de pagamentos
          permanece, sem ligação com você, por obrigação legal de guarda fiscal (art. 16, I).
        </p>
        <p>
          A conta só pode ser excluída após o fim da matrícula e sem pagamento em aberto: sem
          identificação não há como encerrar um contrato nem acertar uma pendência. Detalhes em{' '}
          <a href="/excluir-conta" style={{ color: cor }}>
            /excluir-conta
          </a>
          .
        </p>
      </Secao>

      <Secao titulo="9. Segurança">
        <p>
          O CPF é guardado cifrado. As senhas nunca são guardadas em texto: o sistema guarda
          apenas um resumo criptográfico. O acesso da equipe é controlado por perfil, e todo acesso
          a dado pessoal fica registrado. O tráfego entre o aplicativo e o servidor é criptografado.
        </p>
        <p>
          Nenhuma medida elimina o risco por completo. Havendo incidente com risco relevante a
          você, a academia comunicará você e a ANPD, conforme o art. 48.
        </p>
      </Secao>

      <Secao titulo="10. Crianças e adolescentes">
        <p>
          O cadastro de menor de 16 anos depende de consentimento específico de ao menos um dos pais
          ou do responsável legal (art. 14, § 1º), colhido pela academia no ato da matrícula.
        </p>
      </Secao>

      <Secao titulo="11. Mudanças nesta política">
        <p>
          Alterações relevantes serão comunicadas pelo aplicativo ou por e-mail antes de passarem a
          valer. A data no topo indica a última atualização.
        </p>
      </Secao>

      <p
        style={{
          marginTop: '2.5rem',
          paddingTop: '1.5rem',
          borderTop: `2px solid ${cor}`,
          fontSize: '0.9rem',
          color: '#52605a',
        }}
      >
        Dúvidas sobre esta política: fale com o encarregado pelo tratamento de dados, no e-mail
        «dpo@dominio».
      </p>
    </main>
  );
}
