// Normalizacao dos eventos enviados pela Control iD via Push.
//
// O firmware 5.x das catracas Control iD (iDFace, iDBlock, iDFlex) envia POSTs
// periodicos para a URL configurada na tela Configuracoes > Push.
//
// O formato varia ligeiramente entre versoes, mas em geral o body e um JSON
// com uma chave contendo um array de eventos. Aceitamos varias variacoes para
// ser resiliente: `events`, `values`, `access_logs`, `objects` ou o proprio
// body como array.

export type ControlidRawEvent = Record<string, unknown>;

export type ControlidNormalizedEvent = {
  idEventoDispositivo: bigint | null;
  nrUsuarioCatraca: string | null;
  nrTipoEvento: number | null;
  dsTipoEvento: string;
  boAcessoLiberado: boolean;
  dsIdentificacao: string;
  dsCartao: string;
  dsPortal: string;
  dsDirecao: string;
  dtEvento: Date;
  raw: ControlidRawEvent;
};

export type ControlidDeviceInfo = {
  caSerial: string;
  anMac: string;
  dsModelo: string;
};

export type ControlidPushPayload = {
  device: ControlidDeviceInfo;
  events: ControlidNormalizedEvent[];
};

// Codigos do campo `event` do objeto access_logs.
//
// So mapeamos os codigos que a Control iD DOCUMENTA (ver "Eventos de
// Identificacao Online": 3 = nao identificado, 6 = acesso negado, 7 = acesso
// concedido). A tabela anterior aqui era inventada — dizia que 1..6 eram tipos
// de identificacao ("biometria", "cartao"...) e tratava TODOS como acesso
// liberado. Consequencia pratica: um acesso NEGADO (6) e uma tentativa NAO
// IDENTIFICADA (3) entravam no banco com boAcessoLiberado = true, ou seja, o
// relatorio de acessos da academia registrava entrada de quem a catraca barrou.
// Codigo desconhecido cai no rotulo generico `evento_N` e conta como negado.
// Doc: https://www.controlid.com.br/docs/access-api-pt/modos-de-operacao/eventos-de-identificacao-online/
const KNOWN_EVENT_TYPES: Record<number, string> = {
  3: 'nao_identificado',
  6: 'acesso_negado',
  7: 'acesso_liberado',
};

const GRANTED_ACCESS_TYPES = new Set<number>([7]);

function pickArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  return null;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asBigInt(value: unknown): bigint | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
  } catch {
    return null;
  }
  return null;
}

// Fuso horario configurado NO EQUIPAMENTO, em minutos de diferenca para UTC
// (Brasilia = -180). Medido em campo: a catraca carimba o log com a hora LOCAL
// dela e manda esse valor como se fosse epoch UTC. Um acesso as 11:07 de
// Brasilia chegava como 11:07 UTC, ou seja, 3h no passado — o relatorio de
// frequencia da academia inteiro sairia deslocado. Deixe 0 se o equipamento
// estiver configurado para enviar UTC de verdade.
const DEVICE_UTC_OFFSET_MINUTES = Number(process.env.CONTROLID_DEVICE_UTC_OFFSET_MINUTES ?? 0);

function offsetDoEquipamento(): number {
  return Number.isFinite(DEVICE_UTC_OFFSET_MINUTES) ? DEVICE_UTC_OFFSET_MINUTES : 0;
}

// Converte um instante real para o "epoch ingenuo" que o equipamento usa: ele
// grava e devolve a hora LOCAL dele como se fosse UTC. Necessario ao ESCREVER
// campos de tempo na catraca (ex.: `users.end_time`) — mandar epoch UTC de
// verdade deslocaria a validade do aluno em 3 horas.
export function paraHoraDoEquipamento(data: Date): number {
  return Math.floor((data.getTime() + offsetDoEquipamento() * 60_000) / 1000);
}

function parseTime(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Control iD envia timestamp em segundos. Se vier em milissegundos
    // (numero muito grande) tratamos tambem.
    const ms = value > 1e12 ? value : value * 1000;
    // Hora local do equipamento -> UTC real. Com offset -180, 11:07 "UTC"
    // reportado vira 14:07 UTC, que e 11:07 em Brasilia.
    const offset = Number.isFinite(DEVICE_UTC_OFFSET_MINUTES) ? DEVICE_UTC_OFFSET_MINUTES : 0;
    return new Date(ms - offset * 60_000);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function extractDeviceInfo(body: Record<string, unknown>): ControlidDeviceInfo {
  const device = (body.device ?? body.equipment ?? {}) as Record<string, unknown>;
  return {
    caSerial: asString(device.serial ?? device.serial_number ?? body.serial ?? body.serial_number),
    anMac: asString(device.mac ?? device.mac_address ?? body.mac ?? body.mac_address),
    dsModelo: asString(device.model ?? device.name ?? body.model ?? body.name),
  };
}

// O POST /result do modo push embrulha a resposta do equipamento em
// `{ uuid, endpoint, response }`, onde `response` e o corpo devolvido pela API
// LOCAL da catraca (ex.: `{"access_logs": [...]}`). Alguns firmwares mandam esse
// `response` como STRING com o JSON dentro. Sem desembrulhar isso, os eventos
// ficavam invisiveis para o extrator e todo push chegava com 0 eventos.
function unwrapResponseEnvelope(body: Record<string, unknown>): Record<string, unknown> | null {
  const response = body.response ?? body.result;
  if (!response) return null;
  if (typeof response === 'string') {
    try {
      const parsed: unknown = JSON.parse(response);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof response === 'object' && !Array.isArray(response)) {
    return response as Record<string, unknown>;
  }
  return null;
}

export function extractRawEvents(body: Record<string, unknown>): ControlidRawEvent[] {
  // Body inteiro pode ser um array (checado antes das chaves porque Array
  // tambem e `object` e nao tem nenhuma das chaves abaixo).
  if (Array.isArray(body)) {
    return body as ControlidRawEvent[];
  }

  // Envelope do /result: os eventos estao um nivel abaixo, dentro de `response`.
  const envelope = unwrapResponseEnvelope(body);
  if (envelope) {
    const nested = extractRawEvents(envelope);
    if (nested.length > 0) return nested;
  }

  // Caminhos possiveis em diferentes firmwares.
  const candidates = [
    body.events,
    body.values,
    body.access_logs,
    body.accessLogs,
    body.objects,
    body.data,
  ];

  for (const candidate of candidates) {
    const arr = pickArray(candidate);
    if (arr) return arr as ControlidRawEvent[];
  }

  // Caso `values` venha aninhado dentro de `object: { values: [...] }`.
  const object = body.object;
  if (object && typeof object === 'object') {
    const arr = pickArray((object as Record<string, unknown>).values);
    if (arr) return arr as ControlidRawEvent[];
  }

  return [];
}

export function normalizeEvent(raw: ControlidRawEvent): ControlidNormalizedEvent {
  const eventCode = asNumber(raw.event ?? raw.event_type ?? raw.type ?? raw.eventCode);
  const knownLabel =
    eventCode !== null && KNOWN_EVENT_TYPES[eventCode] ? KNOWN_EVENT_TYPES[eventCode] : '';

  const grantedFromFlag =
    raw.granted === true ||
    raw.granted_access === true ||
    raw.access === 'granted' ||
    asNumber(raw.granted) === 1 ||
    asNumber(raw.access) === 1;

  const deniedFromFlag =
    raw.granted === false ||
    raw.granted_access === false ||
    raw.access === 'denied' ||
    asNumber(raw.granted) === 0;

  let boAcessoLiberado = false;
  if (grantedFromFlag) boAcessoLiberado = true;
  else if (deniedFromFlag) boAcessoLiberado = false;
  else if (eventCode !== null && GRANTED_ACCESS_TYPES.has(eventCode)) boAcessoLiberado = true;

  return {
    idEventoDispositivo: asBigInt(raw.id ?? raw.event_id ?? raw.log_id),
    nrUsuarioCatraca: asString(raw.user_id ?? raw.userId ?? raw.user) || null,
    nrTipoEvento: eventCode,
    dsTipoEvento: knownLabel || (eventCode !== null ? `evento_${eventCode}` : ''),
    boAcessoLiberado,
    dsIdentificacao: asString(raw.identifier_id ?? raw.identifierId ?? raw.identifier),
    dsCartao: asString(raw.card_value ?? raw.cardValue ?? raw.card),
    dsPortal: asString(raw.portal_id ?? raw.portalId ?? raw.portal),
    dsDirecao: asString(raw.direction ?? raw.way),
    dtEvento: parseTime(raw.time ?? raw.timestamp ?? raw.date ?? raw.event_time),
    raw,
  };
}

export function parseControlidPush(body: unknown): ControlidPushPayload {
  const payload = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const device = extractDeviceInfo(payload);
  const rawEvents = extractRawEvents(payload);
  const events = rawEvents.map(normalizeEvent);
  return { device, events };
}

// Logger estrutural minimo: os guards abaixo servem os dois fluxos de device
// (push/result e identificacao online) sem acoplar ao tipo do Fastify so para
// registrar um warn.
export type DeviceLogger = { warn: (obj: Record<string, unknown>, msg: string) => void };

// Uma catraca so entra na TRILHA DE ACESSO depois de ATIVADA: vinculada a uma
// unidade (idEmpresa) e nao inativa. Um equipamento apenas auto-registrado
// (idEmpresa null, aguardando reivindicacao no painel) ou desativado nao esta em
// operacao — os "eventos" que ele reporta nao contam. Fecha o abuso de
// auto-registrar uma catraca fantasma por rota publica e despejar eventos
// forjados de "acesso liberado" na trilha, contaminando frequencia e evasao.
export function catracaEmOperacao(
  catraca: { idEmpresa: number | null; boInativo: boolean } | null,
): catraca is { idEmpresa: number; boInativo: boolean } {
  return catraca != null && catraca.idEmpresa != null && !catraca.boInativo;
}

// Postura de identidade da catraca no push/identificacao. As rotas de device
// sao publicas (o firmware nao manda JWT); a prova de que a requisicao veio
// MESMO daquela catraca e o caToken (quando o firmware consegue enviar) ou o
// anIpPermitido (quando o IP e fixo). Uma catraca ATIVADA sem NENHUM dos dois
// aceita evento/identificacao sem prova — e e assim que se forja evento (ou
// check-in, no modo online) "em nome dela". Nao bloqueamos aqui (derrubaria a
// operacao de quem ainda nao provisionou token/IP), mas registramos o alerta: e
// o gancho para o provisionamento fechar a lacuna. Basta configurar caToken OU
// anIpPermitido na tela da catraca para a prova passar a ser exigida (ver
// ipDoDeviceAutorizado e a checagem de token nos handlers).
export function alertarSePosturaFraca(
  catraca: { id: number; caToken?: string | null; anIpPermitido?: string | null },
  clientIp: string,
  log: DeviceLogger,
) {
  const temToken = (catraca.caToken ?? '').trim() !== '';
  const temIp = (catraca.anIpPermitido ?? '').trim() !== '';
  if (!temToken && !temIp) {
    log.warn(
      { idCatraca: catraca.id, ip: clientIp },
      'Catraca ativada sem caToken nem anIpPermitido: requisicao aceita SEM prova de identidade. Configure um dos dois na tela da catraca para fechar a forja de eventos.',
    );
  }
}
