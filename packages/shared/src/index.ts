// Codigo compartilhado entre api, web e mobile.
//
// O pacote existia, estava declarado como dependencia dos tres apps e ligado ao
// build do Next (`transpilePackages`), mas continha apenas dois schemas zod que
// NENHUM app importava — enquanto a validacao de CPF/CNPJ e as mascaras estavam
// copiadas entre eles. Os schemas mortos foram removidos e o pacote passou a
// abrigar o que de fato e comum.
//
// Tudo em um arquivo de proposito: o pacote e consumido por tres runtimes
// diferentes (tsx/Node ESM na API, webpack no Next, Metro no Expo) e cada um
// resolve extensao de import de um jeito. Sem imports relativos internos, nao
// ha o que resolver.

// Validacao de documentos brasileiros (CPF/CNPJ).
//
// Estas funcoes existiam em TRES copias divergentes — apps/api/src/shared/
// normalize.ts, apps/web/src/shared/registration/registrationHelpers.tsx e
// apps/web/src/features/companies/companyUtils.ts (+ apps/mobile/lib/utils/
// format.ts). Regra de negocio duplicada e regra que sai de sincronia: a
// validacao do servidor podia aceitar um CPF que a do cliente rejeitava (ou o
// contrario) sem que nada acusasse.

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Valida CPF pelo algoritmo dos digitos verificadores (modulo 11).
 * Rejeita tambem as sequencias repetidas (111.111.111-11), que passam no
 * calculo mas nao sao CPFs validos.
 */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);

  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
    return false;
  }

  const calculateDigit = (size: number) => {
    let sum = 0;
    for (let index = 0; index < size; index += 1) {
      sum += Number(cpf[index]) * (size + 1 - index);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

/** Valida CNPJ pelo algoritmo dos digitos verificadores (modulo 11). */
export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);

  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) {
    return false;
  }

  const calculateDigit = (size: number) => {
    const weights =
      size === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let index = 0; index < size; index += 1) {
      sum += Number(cnpj[index]) * Number(weights[index]);
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return calculateDigit(12) === Number(cnpj[12]) && calculateDigit(13) === Number(cnpj[13]);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Mascaras de entrada compartilhadas entre web e mobile.
//
// `formatPhone` chegou a existir em QUATRO copias identicas (mobile/utils,
// mobile/admin.tsx, web/studentValidation.ts, web/EmployeeRegistration.tsx) e
// `formatCpf`/`formatCep` em duas cada. Como mascara define o formato que chega
// na API, divergencia aqui vira bug de dado.

export function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);

  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

export function formatCnpj(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function formatCep(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

/** Telefone sem DDD: 8 digitos (0000-0000) ou 9 (00000-0000). */
export function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 9);

  if (digits.length <= 8) {
    return digits.replace(/^(\d{4})(\d)/, '$1-$2');
  }

  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

export function isImageFile(path: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(path);
}
