const DEFAULT_CORS_ORIGIN = '*';

export function withCorsHeaders(headers?: HeadersInit): Headers {
  const h = new Headers(headers);

  h.set('Access-Control-Allow-Origin', process.env.CORS_ORIGIN ?? DEFAULT_CORS_ORIGIN);
  h.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  h.set('Access-Control-Allow-Credentials', 'true');

  return h;
}

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: withCorsHeaders() });
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = withCorsHeaders(init.headers);
  headers.set('Content-Type', 'application/json');

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}
