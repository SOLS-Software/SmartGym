import { getImageContentType } from './files.js';
import type { ComprefaceConfig, FacialRecognitionResult } from './api-types.js';

export function getComprefaceConfig(): ComprefaceConfig {
  const url = process.env.COMPREFACE_URL;
  const recognitionApiKey = process.env.COMPREFACE_RECOGNITION_API_KEY;
  const detProbThreshold = Number(process.env.COMPREFACE_DET_PROB_THRESHOLD ?? 0.8);
  const similarityThreshold = Number(process.env.COMPREFACE_SIMILARITY_THRESHOLD ?? 0.85);

  if (!url || !recognitionApiKey) {
    throw new Error('Configure COMPREFACE_URL e COMPREFACE_RECOGNITION_API_KEY.');
  }
  if (!Number.isFinite(detProbThreshold) || detProbThreshold <= 0 || detProbThreshold > 1) {
    throw new Error('Configure COMPREFACE_DET_PROB_THRESHOLD entre 0 e 1.');
  }
  if (!Number.isFinite(similarityThreshold) || similarityThreshold <= 0 || similarityThreshold > 1) {
    throw new Error('Configure COMPREFACE_SIMILARITY_THRESHOLD entre 0 e 1.');
  }

  return {
    url: url.replace(/\/+$/g, ''),
    recognitionApiKey,
    detProbThreshold,
    similarityThreshold,
  };
}

export function getStudentFacialSubject(studentId: number) {
  return `aluno-${studentId}`;
}

async function requestCompreface<T>(url: URL, formData: FormData): Promise<T> {
  const config = getComprefaceConfig();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'x-api-key': config.recognitionApiKey },
    body: formData,
  });

  const responseText = await response.text();
  const responseBody = responseText ? JSON.parse(responseText) : {};

  if (!response.ok) {
    const message =
      typeof responseBody.message === 'string'
        ? responseBody.message
        : 'Erro ao comunicar com o CompreFace.';
    throw new Error(message);
  }

  return responseBody as T;
}

function createImageFormData(buffer: Buffer, fileName: string) {
  const contentType = getImageContentType(fileName);
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(buffer)], { type: contentType }), fileName);
  return formData;
}

export async function addComprefaceSubjectExample(
  subject: string,
  buffer: Buffer,
  fileName: string,
) {
  const config = getComprefaceConfig();
  const url = new URL('/api/v1/recognition/faces', config.url);
  url.searchParams.set('subject', subject);
  url.searchParams.set('det_prob_threshold', String(config.detProbThreshold));
  return requestCompreface<{ image_id: string; subject: string }>(
    url,
    createImageFormData(buffer, fileName),
  );
}

export async function recognizeComprefaceFace(buffer: Buffer, fileName: string) {
  const config = getComprefaceConfig();
  const url = new URL('/api/v1/recognition/recognize', config.url);
  url.searchParams.set('limit', '1');
  url.searchParams.set('prediction_count', '1');
  url.searchParams.set('det_prob_threshold', String(config.detProbThreshold));
  return requestCompreface<FacialRecognitionResult>(url, createImageFormData(buffer, fileName));
}
