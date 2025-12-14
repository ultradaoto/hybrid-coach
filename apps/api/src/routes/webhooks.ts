import { jsonResponse } from '../middleware/cors';

export async function webhooksRoutes(_req: Request): Promise<Response> {
  return jsonResponse({ success: false, error: 'Not Implemented' }, { status: 501 });
}
