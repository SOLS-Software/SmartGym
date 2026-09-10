import { Redis } from 'ioredis';

// B-3: rate limit distribuido entre instancias.
//
// Sem store externo, o @fastify/rate-limit conta em MEMORIA do processo: com 2+
// replicas, o limite (ex.: 10/min no login) passa a valer POR instancia, e o
// teto efetivo multiplica pelo numero de replicas. Setando RATE_LIMIT_REDIS_URL
// (ou REDIS_URL), a contagem vira compartilhada e o limite volta a ser global.
//
// Sem a env => devolve null: o app mantem EXATAMENTE o comportamento em memoria
// de hoje (instancia unica nao precisa de Redis). Ativar e so setar a env ao
// escalar horizontalmente — sem mudanca de codigo. Ver app.ts (registro do
// plugin) e docs/auditoria-api-2026-09-09.md (B-3).

type RateLimitLogger = {
  warn: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
};

export function rateLimitRedisUrl(): string | undefined {
  return process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL || undefined;
}

export function getRateLimitRedis(log?: RateLimitLogger): Redis | null {
  const url = rateLimitRedisUrl();
  if (!url) return null;

  // Resiliencia: um Redis fora do ar NAO pode derrubar a API nem segurar as
  // requisicoes. Timeout de conexao curto + pouca retentativa fazem a operacao
  // falhar rapido; combinado com skipOnError:true no registro do plugin, um
  // Redis indisponivel degrada para "sem limite distribuido" (fail-open), nunca
  // para "app travado". O listener de 'error' evita unhandledRejection no boot.
  const redis = new Redis(url, {
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
    enableAutoPipelining: true,
    connectionName: 'smartgym-rate-limit',
  });

  redis.on('error', (err: Error) => {
    log?.warn({ err: err.message }, 'Rate limit: erro no Redis; contagem degrada para local ate reconectar.');
  });
  redis.once('ready', () => {
    log?.info({}, 'Rate limit: store distribuido no Redis conectado.');
  });

  return redis;
}
