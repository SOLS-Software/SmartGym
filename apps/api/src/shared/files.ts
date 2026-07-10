import { extname } from 'node:path';

export function getImageContentType(fileName: string) {
  const extension = extname(fileName).toLowerCase();

  if (extension === '.png') {
    return 'image/png';
  }

  if (extension === '.webp') {
    return 'image/webp';
  }

  if (extension === '.bmp') {
    return 'image/bmp';
  }

  return 'image/jpeg';
}

export function normalizeFileName(fileName: string) {
  const extension = extname(fileName).toLowerCase();
  const baseName = fileName
    .replace(extension, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `${baseName || 'arquivo'}${extension}`;
}

export function getStudentFilePath(studentId: number, fileName: string) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `alunos/${studentId}/${timestamp}-${normalizeFileName(fileName)}`;
}

export function getExerciseFilePath(exerciseId: number, fileName: string) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `exercicios/${exerciseId}/${timestamp}-${normalizeFileName(fileName)}`;
}

export function getCompanyFilePath(companyId: number, fileName: string) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `empresas/${companyId}/${timestamp}-${normalizeFileName(fileName)}`;
}

export function getProductFilePath(productId: number, fileName: string) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `produtos/${productId}/${timestamp}-${normalizeFileName(fileName)}`;
}

export function getEmployeeFilePath(employeeId: number, fileName: string) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `funcionarios/${employeeId}/${timestamp}-${normalizeFileName(fileName)}`;
}

export function getPromotionFilePath(promotionId: number, fileName: string) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `promocoes/${promotionId}/${timestamp}-${normalizeFileName(fileName)}`;
}

export function getClientFilePath(clientId: number, fileName: string) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `clientes/${clientId}/${timestamp}-${normalizeFileName(fileName)}`;
}

export function getEquipamentoFilePath(equipmentId: number, fileName: string) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `equipamentos/${equipmentId}/${timestamp}-${normalizeFileName(fileName)}`;
}
