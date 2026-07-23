import { defineConfig } from 'vitest/config';

// Testes de regressao de seguranca da API (logica pura: RBAC do aluno,
// verificacao de senha, cripto de PII). Sem DB/rede — deterministicos.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
