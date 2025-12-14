import type { AuthUser } from '../middleware/auth';
import { jsonResponse } from '../middleware/cors';

export async function adminRoutes(_req: Request, _user: AuthUser): Promise<Response> {
  return jsonResponse(
    { success: false, error: 'Not Implemented' },
    { status: 501 }
  );
}
