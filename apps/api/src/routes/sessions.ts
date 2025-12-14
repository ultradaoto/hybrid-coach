import { jsonResponse } from '../middleware/cors';
import type { AuthUser } from '../middleware/auth';

export async function sessionsRoutes(_req: Request, _user: AuthUser): Promise<Response> {
  return jsonResponse({ success: false, error: 'Not Implemented' }, { status: 501 });
}
