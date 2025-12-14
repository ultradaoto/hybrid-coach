import { jsonResponse } from '../middleware/cors';
import type { AuthUser } from '../middleware/auth';

export async function usersRoutes(_req: Request, user: AuthUser): Promise<Response> {
  // Minimal "who am I" endpoint to support portal bootstrapping.
  const url = new URL(_req.url);
  if (url.pathname === '/api/users/me' && _req.method === 'GET') {
    return jsonResponse({ success: true, data: { user } });
  }

  return jsonResponse({ success: false, error: 'Not Found' }, { status: 404 });
}
