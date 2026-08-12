# Integração com catraca Control iD

Estado da integração do SmartGym com o equipamento Control iD instalado.

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
| Servidor (API SmartGym) | `192.168.15.12:3333` |
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

## O que NÃO funciona: modo online

**Objetivo:** a catraca perguntar ao SmartGym a cada identificação
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
 "values": [{"name": "SmartGym", "ip": "http://192.168.15.12:3333/controlid", "public_key": ""}]}
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

- [ ] Catraca sem `caToken` — as rotas de device são públicas por necessidade;
      sem token, qualquer máquina na rede injeta evento (e, no modo online,
      destrava o giro).
- [ ] Alerta de catraca offline usando `Catraca.dtUltimoPush`. Hoje a integração
      pode parar e ninguém percebe — aconteceu duas vezes durante a implantação.
- [ ] Horário "sempre liberado" configurado no equipamento é a regra que vale
      quando a API não responde. Com ele, queda de rede = catraca liberando todos.
- [ ] Índice único em `(idCatraca, idEventoDispositivo)` para impedir evento
      duplicado.
- [ ] Sem tela no web para vincular aluno ↔ usuário da catraca (hoje só no banco).
- [ ] `new_card.fcgi` responde negado: não existe vínculo cartão → aluno.
- [ ] Catraca #1 (`0G0200/005B6D`) no banco é resíduo de um teste manual; a real
      é a #2.
- [ ] Variáveis de bootstrap (`CONTROLID_BOOTSTRAP_*`) e `CONTROLID_DEBUG_BODY`
      devem sair do `.env` depois da implantação — a segunda loga PII.

## Diagnóstico rápido

```bash
pnpm --filter @smartgym/db exec tsx --env-file=.env scripts/catraca-status.ts
```

Mostra catracas cadastradas, há quanto tempo cada uma falou com a API e os
últimos eventos recebidos com aluno identificado.
