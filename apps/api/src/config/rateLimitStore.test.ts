import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRateLimitRedis, rateLimitRedisUrl } from './rateLimitStore.js';

// B-3: o rate limit distribuido e OPCIONAL. A garantia critica testada aqui e que
// SEM env de Redis o comportamento e o de sempre (memoria): getRateLimitRedis
// devolve null e nada tenta conectar. O caminho COM Redis nao e exercitado aqui
// porque abriria uma conexao de rede (handle aberto / flaky sem um servidor).

describe('rateLimitStore — selecao por env (B-3)', () => {
  const original = {
    rate: process.env.RATE_LIMIT_REDIS_URL,
    redis: process.env.REDIS_URL,
  };

  beforeEach(() => {
    delete process.env.RATE_LIMIT_REDIS_URL;
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    if (original.rate === undefined) delete process.env.RATE_LIMIT_REDIS_URL;
    else process.env.RATE_LIMIT_REDIS_URL = original.rate;
    if (original.redis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = original.redis;
  });

  it('sem env de Redis: url indefinida e cliente null (fallback em memoria)', () => {
    expect(rateLimitRedisUrl()).toBeUndefined();
    expect(getRateLimitRedis()).toBeNull();
  });

  it('RATE_LIMIT_REDIS_URL tem precedencia sobre REDIS_URL', () => {
    process.env.REDIS_URL = 'redis://fallback:6379';
    process.env.RATE_LIMIT_REDIS_URL = 'redis://primary:6379';
    expect(rateLimitRedisUrl()).toBe('redis://primary:6379');
  });

  it('REDIS_URL e usada quando RATE_LIMIT_REDIS_URL nao esta setada', () => {
    process.env.REDIS_URL = 'redis://fallback:6379';
    expect(rateLimitRedisUrl()).toBe('redis://fallback:6379');
  });

  it('string vazia nao conta como configurada (continua em memoria)', () => {
    process.env.RATE_LIMIT_REDIS_URL = '';
    expect(rateLimitRedisUrl()).toBeUndefined();
    expect(getRateLimitRedis()).toBeNull();
  });
});
