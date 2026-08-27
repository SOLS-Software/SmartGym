# Push no celular — o que falta para funcionar

O código está pronto dos dois lados. O que falta é **conta e build**, não programação.

Este documento existe porque a parte que sobrou não é código: é uma sequência de
comandos que só quem tem a conta consegue rodar, e uma ordem entre eles que, se
invertida, produz um app instalado que não registra ninguém.

## Em uma frase

Push só existe em **build nativo**. O Expo Go não recebe mais notificação remota
no Android desde o SDK 53 — testar por lá dá "não funciona" sem nenhum erro.

## A ordem importa

O app registra o aparelho chamando `POST /auth/push-token` **na API para a qual
o build aponta** (`EXPO_PUBLIC_API_URL` em `eas.json`). Os perfis `preview` e
`production` apontam para `https://smartgym-jj6m.onrender.com`.

Se o build for feito antes de a API subir com estas mudanças, o app instala,
pede permissão, obtém o token — e leva 401 ao registrar. Não quebra nada e não
mostra erro (push é entrega secundária de propósito), mas nenhum aparelho fica
registrado, e o sintoma é "o push não chega", que manda procurar no lugar errado.

**Então:**

1. Commitar e **subir a API** com o módulo de push (`/auth/push-token`,
   `shared/push.ts`, coluna `dtEnvioPush`, tabela `tb_UsuarioDispositivos`).
   A migration `20260825200000_leads_timeclock_and_push` já está aplicada no
   banco — é o mesmo banco que a produção usa.
2. Só então gerar o build.

Para conferir se a API já está com as mudanças, sem precisar de token:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d "{}" https://smartgym-jj6m.onrender.com/public/leads
```

`400` = a API já tem as rotas novas (rota pública, corpo inválido).
`401` = ainda é a versão antiga (o hook de auth barrou antes de rotear).

## Os comandos

Rodar em `apps/mobile`. Precisa de uma conta Expo (gratuita para Android).

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest init
```

`init` cria o projeto no Expo e **escreve `extra.eas.projectId` no `app.json`** —
é a única peça que falta hoje. Sem esse id o serviço do Expo não sabe para qual
projeto emitir o token, `getExpoPushTokenAsync` falha e o registro não acontece
(silenciosamente, por design: ver `lib/push/registrarPush.ts`).

Depois disso, o APK de teste:

```bash
npx eas-cli@latest build --profile preview --platform android
```

O EAS pede as credenciais do Firebase (FCM V1) na primeira vez e as guarda. É a
parte que exige um projeto no Firebase console com o pacote `com.smartgym` —
Android é gratuito; iOS exige conta paga da Apple.

## Como saber se funcionou

Com o APK instalado e um aluno logado, o aparelho tem que aparecer na tabela:

```sql
SELECT u."dsLogin", d."dsPlataforma", d."dtUltimoUso"
FROM "tb_UsuarioDispositivos" d
JOIN "tb_Usuarios" u ON u.id = d."idUsuario"
WHERE d."boInativo" = false;
```

Vazio = o registro não aconteceu. Olhar, nesta ordem: `projectId` no `app.json`,
permissão de notificação concedida no aparelho, e qual API o build está usando.

Para disparar, **sempre em ensaio primeiro**:

```bash
curl -X POST -H "Authorization: Bearer <token>" "https://smartgym-jj6m.onrender.com/notifications/dispatch?dryRun=true"
```

O ensaio percorre tudo e relata o que sairia (`push.enviaria`, `push.semAparelho`)
sem enviar nada. Só depois disso vale rodar sem `dryRun`, que envia e-mail e push
de verdade para alunos reais.

## Detalhes que costumam morder

**O canal do Android.** `apps/api/src/shared/push.ts` manda `channelId: 'avisos'`
e `apps/mobile/lib/push/registrarPush.ts` cria o canal com esse mesmo nome
(`CANAL_AVISOS`). No Android quem define importância, som e se o aviso acende a
tela é o **canal**, não a mensagem. Se os dois nomes divergirem, a notificação
continua chegando — no canal padrão, sem prioridade. Nada acusa o erro; por isso
o nome está travado por teste no lado do servidor.

**O ícone da notificação.** Não há nenhum configurado. O Android vai usar a
silhueta do ícone do app, que também não está definido. Para acertar, colocar um
PNG **branco sobre transparente** (96×96 basta) e apontar no `app.json`:

```json
["expo-notifications", { "icon": "./assets/notification-icon.png", "color": "#1f7a53" }]
```

A cor já está configurada. O ícone ficou de fora de propósito: apontar para um
arquivo que não existe **quebra o build**, e escolher a arte é decisão de marca.

**Push não substitui e-mail.** As duas entregas são independentes, cada uma com
sua coluna de data em `tb_Notificacoes` (`dtEnvioEmail`, `dtEnvioPush`). Quem não
instalou o app recebe e-mail; quem instalou recebe os dois. Aparelho que o Expo
recusa como morto (`DeviceNotRegistered`) é inativado na hora, senão a base
acumula endereço para onde nunca mais chega nada.
