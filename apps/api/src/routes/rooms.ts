import { jsonResponse } from '../middleware/cors';
import type { AuthUser } from '../middleware/auth';
import { createRoomId, roomExists } from '../ws/rooms';

function getJoinUrls(roomId: string) {
  const host = process.env.HOST ?? '127.0.0.1';
  const coachPort = Number(process.env.COACH_PORT ?? 3701);
  const clientPort = Number(process.env.CLIENT_PORT ?? 3702);

  const coachBase = process.env.COACH_APP_URL ?? `http://${host}:${coachPort}`;
  const clientBase = process.env.CLIENT_APP_URL ?? `http://${host}:${clientPort}`;

  return {
    coach: new URL(`/room/${roomId}`, coachBase).toString(),
    client: new URL(`/room/${roomId}`, clientBase).toString(),
  };
}

export async function roomsRoutes(req: Request, user: AuthUser): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // POST /api/rooms/create
  if (path === '/api/rooms/create' && method === 'POST') {
    const roomId = createRoomId();
    const joinUrls = getJoinUrls(roomId);
    return jsonResponse({
      success: true,
      data: {
        roomId,
        joinUrls,
        createdBy: { id: user.id, role: user.role ?? 'unknown' },
      },
    });
  }

  // GET /api/rooms/:roomId
  const match = path.match(/^\/api\/rooms\/([^/]+)$/);
  if (match && method === 'GET') {
    const roomId = match[1];
    return jsonResponse({
      success: true,
      data: {
        roomId,
        exists: roomExists(roomId),
        joinUrls: getJoinUrls(roomId),
      },
    });
  }

  return jsonResponse({ success: false, error: 'Not Found' }, { status: 404 });
}
