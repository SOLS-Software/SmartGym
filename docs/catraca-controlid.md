# Integração com catraca Control iD

Estado da integração do SOLSFIT com o equipamento Control iD instalado.

## Equipamento

| Campo | Valor |
|---|---|
| Serial (`name` no objeto `devices`) | `0G0200/005B6D` |
| **Firmware** | **5.13.2** |
| Security Box | 2.1.2 |
| `device_id` reportado no push | `3206485144263533` |
| MAC | `FC:52:CE:87:B7:A1` |
| IP na rede local | `192.168.15.40` (DHCP) |
| Hostname | `CID-0G0200-005B6D` |
| Motor biométrico | Innovatrics (até 6000 registros) |
| Licença (`system_information`) | `users: 200000`, **`device: 0`, `type: 0`** |
| Servidor (API SOLSFIT) | `192.168.15.12:3333` |
| Período de push configurado | 5s |

## O que funciona (validado com o equipamento real)

O **modo push** está operacional ponta a ponta:

1. A catraca faz `GET /controlid/push?deviceId=X&uuid=Y` pedindo comandos.
2. A API responde com um comando `load_objects` de `access_logs` novos
   (`id > último gravado`), no máximo a cada `CONTROLID_COMMAND_INTERVAL_MS`.
3. A catraca executa e devolve em `POST /controlid/result?deviceId=X&endpoint=Z`.
4. A API persiste em `tb_CatracaEventos`, resolvendo o aluno pelo
   `Aluno.nrUsuarioCatraca` (escopado pelo cliente dono da catraca).

Também validados: conversão de fuso do horário do equipamento
(`CONTROLID_DEVICE_UTC_OFFSET_MINUTES`), decisão por plano/pagamento via
`getStudentAccessStatus` e criação de `AlunoCheckIn`.

## Bloqueio por plano e pagamento: sincronização de validade

**Este é o mecanismo em produção.** Como o modo online não engata neste firmware
(seção seguinte), o bloqueio não depende de a catraca perguntar: o SOLSFIT
mantém, dentro do equipamento, a janela de validade de cada aluno
(`users.begin_time` / `users.end_time`), que a catraca respeita sozinha.

A cada `CONTROLID_SYNC_INTERVALO_MS` (padrão 5 min) a API pede a lista de
usuários do equipamento, compara com `getStudentAccessStatus` de cada aluno
vinculado e envia `modify_objects` **apenas para quem divergiu**:

- Em dia → `end_time` renovado para agora + `CONTROLID_SYNC_JANELA_MINUTOS`
  (padrão 48h).
- Inadimplente / plano encerrado → `end_time` no passado, bloqueio imediato.

A biometria nunca é tocada: o usuário não é apagado, então o aluno volta a
entrar com a mesma digital assim que quitar, sem recadastro.

Validado em campo (eventos 71 a 73 em `tb_CatracaEventos`): inadimplente barrado
com `event: 6`, pagamento quitado no sistema, e o mesmo dedo liberado com
`event: 7` no ciclo seguinte.

Duas propriedades que o modo online não teria:

- **Falha fechado.** Se a API parar, as validades expiram e o acesso fecha
  sozinho. No modo online, com a regra local "Sempre Liberado" que este
  equipamento tem, API fora do ar liberaria todo mundo.
- **Funciona com a rede caída** — a catraca decide localmente, com dado correto.

O custo é a latência: entre quitar o pagamento e a catraca saber, passa um ciclo.

## Endereço por academia (multi-tenant)

As rotas de device são públicas e descobrem a catraca pelo `caSerial`, que mora
em `tb_Catracas` — tabela de aplicação. Com banco por cliente isso vira
ovo-e-galinha: para procurar o serial seria preciso já saber de quem ele é.

A saída veio de uma propriedade do próprio firmware: **o endereço do servidor é
configurável e o equipamento anexa o próprio endpoint ao caminho digitado.** É
por isso que existem rotas para `/controlid`, `/controlid/push` e
`/controlid/push/push` — são três bases diferentes já vistas em campo. Ou seja,
**o caminho é nosso**, e pode carregar a identificação da academia.

Cada cliente tem uma chave sorteada em `tb_Clientes.caChaveDispositivo` (64 hex).
O endereço a digitar no equipamento é:

```
https://<api>/d/<caChaveDispositivo>
```

Sem barra no fim e sem `/push` — o firmware anexa. O painel monta o endereço
pronto em `GET /controlid/endereco`, pelo mesmo motivo que o webhook de
pagamento faz isso: é um valor que alguém copia para outro painel, e digitar
errado significa semanas sem evento chegando.

**Ganho de segurança colateral.** Neste firmware o `caToken` é inviável (a tela
de push não tem campo de token), então a única autenticação de equipamento era
`Catraca.anIpPermitido` — frágil com o aparelho em DHCP, como esta doc já
registra. A chave no caminho devolve parte dessa autenticação e não depende de IP.

**Compatibilidade.** Os caminhos antigos (`/controlid/*`) continuam valendo e
caem no pool compartilhado: nada quebra para o parque instalado. Reapontar só é
**obrigatório antes de siloar** um cliente — se o equipamento seguir no caminho
antigo, ele não acha a catraca no banco novo e tenta auto-registrar uma
duplicata. O passo está no runbook de `docs/multi-tenancy-dados.md`.

## Cadastro de uma catraca nova (pelo painel)

O caminho inteiro cabe na aba **Catracas**, sem chamada manual na API:

1. **Endereço do equipamento** — o bloco no topo da aba mostra o endereço pronto
   (`GET /controlid/endereco`) com botão de copiar. É o que se digita na tela de
   push do equipamento, sem barra no fim e sem `/push`.
2. **Aguardando ativação** — no primeiro push a catraca se auto-registra
   inativa e sem empresa (`idEmpresa = null`), e aparece nessa seção com série,
   IP e último contato. Dá-se um nome, escolhe-se a unidade e clica em *Ativar*:
   é o `PUT /controlid/catracas/:id`, o único caminho que tira o equipamento do
   limbo — o `PATCH .../status` recusa catraca sem empresa de propósito, para
   que um tenant não consiga ligar/desligar equipamento que ainda não é dele.
3. **Equipamentos** — daí em diante a catraca sai da fila de pendentes e entra
   na lista da unidade, com *Editar* (nome, série, fabricante, modelo, IP
   permitido, MAC) e *Ativar/Inativar*.

O botão **Cadastrar catraca** existe para o caso inverso: registrar o
equipamento antes de ele falar, ou consertar um registro. A unidade é
obrigatória no painel — cadastrar sem empresa criaria, de novo, uma catraca de
ninguém.

Dois campos não têm caixa na tela e andam junto no salvamento mesmo assim:
`anIp`, que quem escreve é o próprio equipamento a cada push, e `caToken`,
inviável neste firmware. O `PUT` manda o registro inteiro — deixar de enviá-los
apagaria o valor guardado.

## Cadastro de digital pelo painel (a validar em campo)

O canal de push **não é** um canal de "coletar log": é um RPC genérico para
dentro do equipamento. O servidor enfileira `{endpoint, body}`, a catraca
executa contra a própria API local e devolve o resultado em
`/controlid/result`. O bootstrap do modo online já usava isso para *criar
objetos* na catraca (`create_objects` em `devices`) — o mesmo mecanismo cria o
usuário e dispara o enrolamento da biometria.

Consequência: **cadastrar digital não exige app desktop nem estar na rede da
catraca.** O comando sai do painel web, de onde quer que ele esteja rodando. A
única presença física necessária é a do dedo no leitor.

Implementação em `apps/api/src/modules/controlid/cadastro.ts`, tela em
`apps/web/src/features/catracas/CatracaMonitor.tsx` ("Cadastrar digital").

### Fluxo de uma sessão

| Etapa | Comando enviado | O que confirma |
|---|---|---|
| `criando_usuario` | `create_objects` em `users` | `ids` → grava `Aluno.nrUsuarioCatraca` |
| `lendo_digitais` | `load_objects` em `templates` | linha de base (só para aluno que já tem número) |
| `aguardando_dedo` | `remote_enroll` | equipamento entra em modo de captura |
| `concluido` | `load_objects` em `templates` a cada ~3s | contagem **subiu** → digital gravada |

Duas decisões que valem registrar:

- **O usuário nasce bloqueado** (`end_time` no passado) e quem o libera é a
  reconciliação, se o aluno estiver em dia. O caminho oposto daria passagem
  livre a um inadimplente até o ciclo seguinte — e o cadastro de digital é
  exatamente o momento em que a pessoa está na recepção querendo entrar.
- **A confirmação compara contagens**, não presença. Para um aluno que já tem
  digital, "existe um template" daria sucesso imediato mesmo com o leitor
  desligado; só um template A MAIS prova que a digital nova entrou.

O vínculo aluno↔número passa a nascer pronto, em vez de depender de garimpar o
número na lista de não vinculados depois da primeira passada. A tela de vínculo
continua existindo para digitais cadastradas direto no equipamento.

### O que ainda não foi provado neste firmware

`create_objects` está validado (o bootstrap o usa). **`remote_enroll` e
`load_objects` em `templates` nunca foram exercitados aqui.** Como o modo online
também era "suportado" pela documentação e nunca engatou, cada passo trata erro
do equipamento como resposta legítima e leva a mensagem do firmware inteira para
a tela — é ela que vai dizer se o endpoint existe.

**Roteiro do teste em campo:**

1. Painel → Catracas → Cadastrar digital. Escolha um aluno de teste e a catraca.
2. Acompanhe o log da API (`Cadastro de digital: sessao avancou`) e a tela.
3. Encoste o dedo no leitor quando a tela pedir.

Os três desfechos possíveis:

- **Concluído** — funciona ponta a ponta; não há app desktop a construir.
- **Erro no `remote_enroll`** (ex.: `Node or attribute not found`) — o endpoint
  não existe neste firmware. Aí sim o desktop entra em discussão.
- **Fica em "aguardando" e expira** — o comando foi aceito mas a captura não
  aconteceu, ou a consulta de `templates` não existe (a tela avisa quando é o
  segundo caso). Tente `CONTROLID_ENROLL_SYNC=true`: nesse modo o equipamento
  segura a resposta até o dedo encostar e a própria resposta é o resultado,
  dispensando a consulta de templates.

### Variáveis de ambiente

```
CONTROLID_CADASTRO_TIMEOUT_MS     = 120000  tempo máximo da sessão
CONTROLID_CADASTRO_VERIFICACAO_MS = 3000    intervalo entre confirmações
CONTROLID_ENROLL_SYNC             = false   true = remote_enroll bloqueante
```

## O que NÃO funciona: modo online

**Objetivo:** a catraca perguntar ao SOLSFIT a cada identificação
(`POST /new_user_identified.fcgi`) e receber `event: 7` (libera) ou `6` (nega)
conforme plano e pagamento do aluno — hoje ela decide sozinha pela regra local
e um aluno inadimplente entra normalmente.

**Sintoma:** o equipamento nunca chama o servidor. Nenhuma requisição `.fcgi`
chega à API (nem em `/controlid/new_user_identified.fcgi`, nem na raiz
`/new_user_identified.fcgi`, ambos registrados e públicos). A identificação é
resolvida localmente e só aparece depois, como log coletado pelo push.

### Configuração aplicada e lida de volta do equipamento

```
general.online                     = "1"
general.local_identification       = "1"
online_client.server_id            = "3206485144263534"
online_client.request_timeout      = "5000"
online_client.max_request_attempts = "3"
online_client.extract_template     = "0"   (era "1"; ajustado para o valor da doc)
```

O `server_id` referencia um objeto `devices` criado no próprio equipamento:

```json
{"object": "devices",
 "values": [{"name": "SOLSFIT", "ip": "http://192.168.15.12:3333/controlid", "public_key": ""}]}
```

### Tentativas já feitas

- Ativação via `set_configuration` pelo canal de push (aceita sem erro).
- Criação e referência do servidor em `devices` + `online_client.server_id`.
- Reinício do equipamento pela tomada — configuração sobreviveu, comportamento não mudou.
- `extract_template` de `"1"` para `"0"`, conforme a doc do modo online — aceito
  sem erro, sem mudança de comportamento.

Depois de cada tentativa, identificações reais na catraca (eventos 61 a 69 em
`tb_CatracaEventos`) continuaram sendo resolvidas localmente: `event: 7` para o
usuário cadastrado e `event: 3` para o não cadastrado, entregues só depois pelo
push. Nenhuma requisição chegou aos endpoints online em nenhum momento.

**Observação:** `system_information` reporta `license.device = 0` e
`license.type = 0`. Não sabemos se o modo online depende de licenciamento neste
firmware — vale perguntar ao suporte.

### Divergências entre a documentação pública e este firmware

1. **`general.ihm_enterprise_mode` não existe.** A doc de modo online inclui esse
   parâmetro; o equipamento responde:
   `Node or attribute not found. Node path: config->general->param[name=ihm_enterprise_mode]`.
   Como `set_configuration` é atômico, isso derruba o pacote inteiro.

2. **`online_client` tem apenas 4 parâmetros.** Confirmado por sondagem individual.
   Existem: `server_id`, `request_timeout`, `max_request_attempts`, `extract_template`.
   Não existem: `hostname`, `host`, `ip`, `port`, `path`, `url`, `server`,
   `server_port`, `server_type`, `enabled`, `online`, `timeout`, `device_id`.

3. **`get_configuration` com lista vazia** (`{"online_client": []}`) devolve `{}`
   em vez de enumerar a seção — não há como listar os parâmetros disponíveis.

### Pergunta para o suporte Control iD

Equipamento `0G0200/005B6D`, firmware **5.13.2**. Com `general.online = 1`,
`general.local_identification = 1` e `online_client.server_id` apontando para um
objeto `devices` válido, **o que mais é necessário para o equipamento passar a
consultar o servidor a cada identificação?** Especificamente:

- O campo `ip` do objeto `devices` deve conter a URL completa
  (`http://host:porta/caminho`) ou apenas o host? O único outro registro na
  tabela é a própria catraca, com `ip` = IP puro.
- O modo online exige algum passo além do `set_configuration` — licença
  (`license.device` e `license.type` estão em `0`), `public_key` preenchida, ou
  reinício por comando específico em vez de desligar da tomada?
- Qual o nome/caminho exato dos endpoints que o firmware 5.13.2 chama no modo
  Pro, e em que porta?
- `general.ihm_enterprise_mode` não existe neste firmware. Ele foi substituído
  por outro parâmetro ou removido?

## Pendências da integração (independentes do suporte)

- [x] ~~Índice único em `(idCatraca, idEventoDispositivo)`~~ — feito. A migration
      removeu 114 duplicatas existentes (189 linhas para ~73 acessos reais) e
      agora o banco recusa repetição; `createMany` usa `skipDuplicates`.
- [x] ~~Autenticação do equipamento~~ — **o `caToken` é inviável neste
      firmware**: a tela de push tem apenas endereço do servidor e período, sem
      campo de token. Em vez disso, `Catraca.anIpPermitido` restringe as rotas de
      device ao IP do equipamento. **Ativado** neste equipamento
      (`192.168.15.40`), validado em campo: requisições aceitas, zero recusas.
      **ATENÇÃO: o equipamento está com DHCP.** Se o IP mudar, ele para de ser
      aceito (falha fechado) e os alunos vão sendo barrados conforme as validades
      expiram. Faça reserva de DHCP no roteador para `192.168.15.40`. Para
      desativar a restrição enquanto isso, basta esvaziar `anIpPermitido`.
- [x] ~~Alerta de catraca offline~~ — feito. `GET /controlid/alertas` devolve as
      catracas ativas sem contato (janela em `CONTROLID_ONLINE_TIMEOUT_MS`), e o
      painel de funcionários e gestores exibe o aviso, verificando a cada 60s.
      Catraca inativa não alerta (está desligada de propósito), então a catraca
      real precisa estar com `boInativo = false` — foi ativada.
- [x] ~~Usuários da catraca sem vínculo~~ — passam a ser **bloqueados** pela
      reconciliação. Consequência operacional: quem for cadastrado direto no
      equipamento (funcionário, personal) é barrado no ciclo seguinte até ser
      vinculado a um aluno pela tela de catracas. `CONTROLID_BLOQUEAR_NAO_VINCULADOS="false"`
      volta ao comportamento anterior.
      *Nota: no equipamento atual o único não vinculado (`1000009`) já estava com
      validade vencida desde 2024, então o caminho de bloqueio não chegou a
      escrever comando — ele usa exatamente o mesmo `modify_objects` já validado
      no bloqueio por inadimplência.*
- [ ] Horário "sempre liberado" configurado no equipamento é a regra que vale
      quando a API não responde. Com a sincronização de validade isso deixa de
      ser buraco (a validade vence sozinha), mas vale revisar.
- [ ] Sem tela no web para vincular aluno ↔ usuário da catraca (hoje só no banco).
- [ ] `new_card.fcgi` responde negado: não existe vínculo cartão → aluno.
- [ ] Catraca #1 (`0G0200/005B6D`) no banco é resíduo de um teste manual; a real
      é a #2.
- [ ] Variáveis de bootstrap (`CONTROLID_BOOTSTRAP_*`) e `CONTROLID_DEBUG_BODY`
      devem sair do `.env` depois da implantação — a segunda loga PII.

## Diagnóstico rápido

```bash
pnpm --filter @solsfit/db exec tsx --env-file=.env scripts/catraca-status.ts
```

Mostra catracas cadastradas, há quanto tempo cada uma falou com a API e os
últimos eventos recebidos com aluno identificado.
