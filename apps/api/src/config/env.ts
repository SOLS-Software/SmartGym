// Em desenvolvimento, as variáveis são carregadas via --env-file-if-exists no script "dev".
// Em produção, as variáveis são injetadas diretamente pelo serviço de deploy.
// Nenhum carregamento de arquivo é feito em runtime.

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'API_PORT',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'PII_ENCRYPTION_KEY',
] as const;

export function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente obrigatórias não definidas: ${missing.join(', ')}`);
  }
}
