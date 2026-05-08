import { type NextRequest, NextResponse } from 'next/server';

const apiUrl = process.env.API_URL ?? 'http://localhost:3333';

type RouteContext = { params: Promise<{ path: string[] }> };

async function handler(request: NextRequest, { params }: RouteContext) {
  const { path } = await params;
  const pathname = path.join('/');
  const search = request.nextUrl.search;
  const targetUrl = `${apiUrl}/${pathname}${search}`;

  const forwardHeaders: HeadersInit = {};
  const contentType = request.headers.get('content-type');
  if (contentType) forwardHeaders['content-type'] = contentType;

  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: body !== undefined ? body : undefined,
    });

    const responseBody = await response.arrayBuffer();
    const responseContentType =
      response.headers.get('content-type') ?? 'application/octet-stream';

    return new NextResponse(responseBody, {
      status: response.status,
      headers: { 'content-type': responseContentType },
    });
  } catch (error) {
    console.error('[api/proxy]', error);
    return NextResponse.json({ message: 'Erro ao conectar ao servidor.' }, { status: 502 });
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
