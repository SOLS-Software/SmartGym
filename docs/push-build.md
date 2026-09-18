# Build do app — o que falta para o APK do piloto

O código está pronto dos dois lados. O que falta é **conta e credencial**, não
programação.

Este documento existe porque a parte que sobrou não é código: é uma sequência de
comandos que só quem tem a conta consegue rodar, e uma ordem entre eles que, se
invertida, produz um app instalado que não registra ninguém.

## O que já está resolvido no repositório

Nada aqui precisa de conta — já está commitado e serve para qualquer build:

- **Identidade.** `app.json` usa `br.com.solssoftwares.solsfit` como pacote
  Android e bundle iOS, e `solsfit` como scheme dos deep links. Era
  `com.smartgym` — ver "o pacote é para sempre", abaixo.
- **Ícone, splash e ícone de notificação.** Em `apps/mobile/assets/`, apontados
  pelo `app.json`. São **placeholders**: monograma branco sobre o verde da marca
  (`#1f7a53`). Trocar por arte de verdade = substituir os PNGs nos mesmos
  caminhos, sem tocar em configuração.
- **`expo-updates` instalado** e um `channel` por perfil no `eas.json`. Falta só
  a URL, que sai do `eas init` — ver "correção sem reinstalar", abaixo.
- **A API que o build usa.** Os perfis `preview` e `production` apontam para
  `https://api.solssoftwares.com.br`.

## Em uma frase

Push só existe em **build nativo**. O Expo Go não recebe mais notificação remota
no Android desde o SDK 53 — testar por lá dá "não funciona" sem nenhum erro.

## A ordem importa

O app registra o aparelho chamando `POST /auth/push-token` **na API para a qual
o build aponta** (`EXPO_PUBLIC_API_URL` em `eas.json`).

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
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d "{}" https://api.solssoftwares.com.br/public/leads
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

`app.json` é versionado: **commitar o arquivo depois do `init`**, senão o próximo
clone volta a não ter o id.

Em seguida, ligar as atualizações pelo ar (grava `updates.url` no `app.json`):

```bash
npx eas-cli@latest update:configure
```

Depois disso, o APK de teste:

```bash
npx eas-cli@latest build --profile preview --platform android
```

O EAS pede as credenciais do Firebase (FCM V1) na primeira vez e as guarda. É a
parte que exige um projeto no Firebase console com o pacote
`br.com.solssoftwares.solsfit` — Android é gratuito; iOS exige conta paga da
Apple.

**Criar o projeto no Firebase só depois da troca de pacote**, que já está feita.
O `google-services.json` é emitido para um pacote específico; gerar antes
significa gerar de novo.

## Correção sem reinstalar (OTA)

`expo-updates` está instalado para que o **primeiro** APK do piloto já saiba
buscar atualização. Isso não dá para adicionar depois: app que saiu sem o módulo
só se corrige com outro APK instalado à mão em cada aparelho.

Com ele, correção de JS/TS vai pelo ar:

```bash
npx eas-cli@latest update --channel preview --message "o que mudou"
```

O `channel` de cada perfil está no `eas.json`, e é ele que liga o build à esteira
de atualização: build `preview` recebe update do canal `preview`.

**O que NÃO vai pelo ar:** mudança nativa — dependência nova com código nativo,
permissão, ícone, nome, plugin do `app.json`. Essas exigem build novo.

`runtimeVersion` está em `{"policy": "appVersion"}`: a compatibilidade é amarrada
ao `version` do `app.json` (`0.1.0`). Subir esse número é o que impede um update
novo de cair num binário velho — e, junto, faz os aparelhos que ficaram no
número anterior pararem de receber update. É o freio correto quando entra código
nativo; é armadilha se alguém bumpar sem querer.

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
curl -X POST -H "Authorization: Bearer <token>" "https://api.solssoftwares.com.br/notifications/dispatch?dryRun=true"
```

O ensaio percorre tudo e relata o que sairia (`push.enviaria`, `push.semAparelho`)
sem enviar nada. Só depois disso vale rodar sem `dryRun`, que envia e-mail e push
de verdade para alunos reais.

## Detalhes que costumam morder

**O pacote é para sempre.** `br.com.solssoftwares.solsfit` não pode mudar depois
da primeira publicação na Play Store — o Google trata pacote diferente como app
diferente, e quem já instalou não recebe a troca como atualização. A hora de
repensar esse nome é antes do primeiro `build --profile production`, não depois.

**O canal do Android.** `apps/api/src/shared/push.ts` manda `channelId: 'avisos'`
e `apps/mobile/lib/push/registrarPush.ts` cria o canal com esse mesmo nome
(`CANAL_AVISOS`). No Android quem define importância, som e se o aviso acende a
tela é o **canal**, não a mensagem. Se os dois nomes divergirem, a notificação
continua chegando — no canal padrão, sem prioridade. Nada acusa o erro; por isso
o nome está travado por teste no lado do servidor.

**O ícone da notificação.** O Android **descarta a cor** e usa só o canal alfa:
qualquer desenho colorido vira um borrão branco. Por isso
`assets/notification-icon.png` é branco sobre transparente. Ao trocar pela arte
definitiva, manter essa regra — é o erro mais comum aqui, e só aparece no
aparelho.

**A permissão de câmera.** `app/admin.tsx` (4169 linhas) é rota órfã: nada navega
para ela, só deep link alcança. É ela que exige `expo-camera` e, com isso, a
permissão `CAMERA` que a Play Store faz justificar na submissão. Se o app do
aluno for publicado sem a tela de gestão, tirar a rota tira a permissão junto.

**Push não substitui e-mail.** As duas entregas são independentes, cada uma com
sua coluna de data em `tb_Notificacoes` (`dtEnvioEmail`, `dtEnvioPush`). Quem não
instalou o app recebe e-mail; quem instalou recebe os dois. Aparelho que o Expo
recusa como morto (`DeviceNotRegistered`) é inativado na hora, senão a base
acumula endereço para onde nunca mais chega nada.
