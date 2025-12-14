import { jsonResponse } from '../middleware/cors';

export async function publicRoutes(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/api/public/health' && req.method === 'GET') {
    return jsonResponse({ success: true, data: { status: 'ok' } });
  }

  return jsonResponse({ success: false, error: 'Not Found' }, { status: 404 });
}
