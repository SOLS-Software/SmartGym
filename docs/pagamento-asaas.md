# Baixa automática via Asaas

As duas metades estão construídas: **emitir** a cobrança no provedor e
**receber** o aviso de que foi paga. O que falta é uma conta — não código.

## O que muda quando a conta existir

Hoje o Pix copia e cola sai da chave da academia direto para o banco: ninguém no
meio, logo ninguém para avisar quando o dinheiro cai, e a baixa é feita no Caixa.

Com uma conta de gateway cadastrada como padrão, o **mesmo botão** do aluno passa
a emitir a cobrança no Asaas, e o webhook dá a baixa sozinho. Nada mais muda de
lugar — nem para o aluno, nem para a recepção.

Enquanto a conta não existir, nada quebra: o caminho do Pix próprio continua
sendo o usado.

## O que você faz (a credencial nunca passa por mim)

1. Crie a conta sandbox em `sandbox.asaas.com` e gere a chave de API.
2. No SmartGym, **Empresa → Contas de Recebimento → Nova conta**: provedor
   `Asaas`, ambiente `Sandbox`, e cole a chave no campo de credencial. Ela é
   gravada cifrada com subchave própria e **nunca volta inteira** em nenhuma
   leitura — a tela mostra só os últimos dígitos.
3. A conta salva exibe o **endereço do webhook**. Copie.
4. No painel do Asaas, em *Integrações → Webhooks*, cadastre esse endereço e
   cole **o mesmo token** (a última parte da URL) no campo de token de
   autenticação. É ele que o Asaas manda no header `asaas-access-token`.

Para o endereço aparecer completo em vez de só o caminho, defina no ambiente da
API:

```bash
API_PUBLIC_URL=https://smartgym-jj6m.onrender.com
```

Sem essa variável o sistema mostra apenas o caminho e avisa o que prefixar —
inventar um host produziria uma URL errada que você colaria no painel e passaria
semanas sem receber evento nenhum.

## Como a rota se defende

Ela é pública e marca dinheiro como recebido. Três camadas:

**Token na URL.** Cada conta tem um endereço sorteado (32 bytes). Ele identifica
a academia sem depender do corpo, e já filtra: token desconhecido responde 404
genérico — dizer "conta existe, token errado" ajudaria quem está adivinhando.

**Token no header**, comparado em tempo constante. Comparação com `===` retorna
mais rápido quanto antes os textos divergem, e isso permite descobrir o segredo
caractere por caractere.

**Confirmação de volta no provedor.** Esta é a que resolve. O corpo do POST diz
apenas *qual cobrança mudou*; o status e o valor vêm de um `GET /payments/{id}`
autenticado com a credencial da conta. Forjar o POST deixa de bastar — seria
preciso fazer o Asaas mentir.

Exercitei isso com um evento perfeitamente forjado apontando para uma cobrança
real: **nenhuma baixa aconteceu**, porque a confirmação não passou.

## Decisões que valem conhecer

**Sempre 200 quando o evento foi gravado**, mesmo sem virar baixa. O provedor
reenvia o que não foi confirmado; responder erro sobre um evento que já está no
nosso banco produz tempestade de retry sem resolver nada. O que não deu certo
fica no log com o motivo.

**Falha de rede não é recusa.** Se a confirmação no Asaas não completar, o evento
fica em `recebido` e o provedor reenvia. Marcar como recusado esconderia um
pagamento real.

**Pagamento a menor não fecha a parcela.** Quanto se aceita de diferença é regra
de negócio da academia; o evento é recusado com o valor no log e uma pessoa
decide no Caixa.

**Estorno e chargeback já são tratados.** Uma integração que só sabe confirmar
deixa como paga uma parcela estornada, e o erro só aparece na conciliação — quando
o aluno já treinou o mês de graça.

**Reenvio do mesmo evento não reprocessa** (unique por conta + id do evento), e a
cobrança tem índice único por `(conta, transação)`.

## Onde olhar quando "não deu baixa"

**Empresa → Contas de Recebimento**, seção *Últimos eventos do provedor*. Cada
linha diz o tipo, o desfecho e o porquê. Se não há linha nenhuma, o evento não
chegou — problema de URL ou de token no painel do Asaas, não do sistema.

```sql
SELECT "cnTipoEvento", "cnStatus", "dsResultado", "dtCadastro"
FROM "tb_WebhookEventos" ORDER BY id DESC LIMIT 20;
```

## A emissão

Construída. Quando o aluno pede o código de pagamento de uma parcela:

1. Acha ou cria o **cliente** dele no Asaas (busca por CPF antes de criar — a
   conta pode já ter o aluno, e recadastrar produziria dois clientes com o mesmo
   CPF e a cobrança dividida entre eles). O de-para fica em `tb_AlunoIntegracoes`.
2. Cria a **cobrança**, mandando o id do nosso `Pagamento` como
   `externalReference` e guardando o id do Asaas em `caTransacaoExterna`. São as
   duas pontas que o webhook usa para casar o evento.
3. Busca o **código Pix** gerado por eles e devolve ao aluno.

**Sob demanda, não ao gerar as parcelas.** Um plano anual criaria doze cobranças
no provedor de uma vez, a maioria para meses que talvez nem sejam vividos — o
aluno troca de plano, cancela. Emitir quando ele pede alinha o custo e o cadastro
lá com a realidade.

**Idempotente.** Se a parcela já tem cobrança, consultamos em vez de criar. O id
do provedor é gravado *antes* de buscar o código: se a busca falhar, a cobrança
já existe lá e precisa estar amarrada aqui — senão a próxima tentativa criaria
outra, e o aluno teria duas do mesmo mês.

A rota é `POST /students/:id/related/payments/:paymentId/charge`. É POST porque,
em conta de gateway, gerar o código **cria** algo no provedor. A conta Pix própria
não grava nada, mas o verbo segue o caso mais forte: um GET que às vezes escreve
é a pior das duas coisas.

### O que o aluno vê

O mesmo botão "Pagar com Pix". A diferença aparece na instrução: com gateway, ela
diz que a confirmação é automática e que **não precisa avisar ninguém**. Sem, ela
diz que a academia confirma em seguida. É o que muda o que ele deve esperar.

### O que sai daqui

Nome, CPF e contato do aluno vão para o Asaas. É inevitável — cobrança no Brasil
exige identificar o pagador — mas é transferência de dado pessoal, e vale você
saber. Mandamos o mínimo: nada de endereço, nascimento ou qualquer outro campo
que eles aceitariam mas não precisam para cobrar. E `notificationDisabled: true`,
porque quem avisa o aluno somos nós; deixar os dois mandando cobrança dobraria
a mensagem.

## O que ainda não foi exercitado

A **autenticação e o tratamento de erro** já foram: com uma chave inválida, o
Asaas real respondeu e a mensagem dele chegou íntegra até a tela.

O **caminho de sucesso** não — criar cliente, criar cobrança e buscar o código
exigem uma chave válida. A forma de cada pedido está testada (valor arredondado
a centavos, data no dia local, campo opcional vazio omitido em vez de mandado
como string vazia), mas a resposta real do Asaas só se conhece com a conta.
