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

// Codigos de evento conhecidos do firmware Control iD 5.x.
// Quando o codigo nao for reconhecido apenas devolvemos o numero cru no `dsTipoEvento`.
const KNOWN_EVENT_TYPES: Record<number, string> = {
  1: 'identificacao_biometria',
  2: 'identificacao_cartao',
  3: 'identificacao_senha',
  4: 'identificacao_facial',
  5: 'identificacao_qrcode',
  6: 'identificacao_bluetooth',
  7: 'acesso_liberado',
  8: 'acesso_negado',
  9: 'tentativa_invalida',
  10: 'usuario_desconhecido',
  11: 'horario_invalido',
  12: 'antipassback',
  13: 'reset_dispositivo',
  14: 'tamper_alarme',
  15: 'porta_aberta_forcada',
  16: 'porta_aberta_tempo_excedido',
};

const GRANTED_ACCESS_TYPES = new Set<number>([1, 2, 3, 4, 5, 6, 7]);

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

function parseTime(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Control iD envia timestamp em segundos. Se vier em milissegundos
    // (numero muito grande) tratamos tambem.
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms);
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

export function extractRawEvents(body: Record<string, unknown>): ControlidRawEvent[] {
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

  // Body inteiro pode ser um array.
  if (Array.isArray(body)) {
    return body as ControlidRawEvent[];
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
