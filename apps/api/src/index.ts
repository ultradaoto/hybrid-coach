import { publicRoutes } from './routes/public';
import { coachRoutes } from './routes/coach';
import { clientRoutes } from './routes/client';
import { adminRoutes } from './routes/admin';
import { authMiddleware } from './middleware/auth';
import { handleOptions, jsonResponse } from './middleware/cors';
import { authRoutes } from './routes/auth';
import { roomsRoutes } from './routes/rooms';
import { sessionsRoutes } from './routes/sessions';
import { usersRoutes } from './routes/users';
import { webhooksRoutes } from './routes/webhooks';
import { handleRoomsUpgrade, roomsWebsocket, type RoomsWsData } from './ws/rooms';
import { livekitRoutes } from './routes/livekit';
import { onboardingRoutes } from './routes/onboarding';

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3699);
const hostname = process.env.HOST ?? '127.0.0.1';

// WebSocket type (rooms only - AI voice now goes through LiveKit)
type WsData = RoomsWsData & { wsType: 'rooms' };

Bun.serve<WsData>({
  port,
  hostname,
  websocket: {
    open(ws) {
      roomsWebsocket.open(ws as any);
    },
    message(ws, message) {
      roomsWebsocket.message(ws as any, message);
    },
    close(ws) {
      roomsWebsocket.close(ws as any);
    },
  },
  async fetch(req, server) {
    if (req.method === 'OPTIONS') {
      return handleOptions();
    }

    const url = new URL(req.url);
    const path = url.pathname;
    
    // Debug: Log all incoming requests
    if (path.includes('/api/client/sessions')) {
      console.log(`[API] 📨 Incoming request: ${req.method} ${path}`);
    }

    // Handle rooms WebSocket upgrade (legacy - may be removed)
    if (path === '/ws/rooms') {
      const ok = server.upgrade(req, {
        data: {
          peerId: crypto.randomUUID(),
          roomId: null,
          role: 'unknown',
          wsType: 'rooms',
        } satisfies WsData,
      });
      if (ok) return new Response(null);
      return new Response('Upgrade failed', { status: 400 });
    }

    if (path.startsWith('/api/auth')) {
      return authRoutes(req);
    }

    // LiveKit token generation (no auth required for room joining)
    if (path.startsWith('/api/livekit')) {
      return livekitRoutes(req);
    }

    if (path.startsWith('/api/public')) {
      return publicRoutes(req);
    }

    if (path.startsWith('/api/users')) {
      const authResult = await authMiddleware(req);
      if (!authResult.success) return authResult.response;
      return usersRoutes(req, authResult.user);
    }

    if (path.startsWith('/api/rooms')) {
      const authResult = await authMiddleware(req);
      if (!authResult.success) return authResult.response;
      return roomsRoutes(req, authResult.user);
    }

    if (path.startsWith('/api/sessions')) {
      const authResult = await authMiddleware(req);
      if (!authResult.success) return authResult.response;
      return sessionsRoutes(req, authResult.user);
    }

    if (path.startsWith('/api/webhooks')) {
      return webhooksRoutes(req);
    }

    // Onboarding routes (client auth required)
    if (path.startsWith('/api/onboarding')) {
      const authResult = await authMiddleware(req, 'client');
      if (!authResult.success) return authResult.response;
      return onboardingRoutes(req, authResult.user);
    }

    if (path.startsWith('/api/coach')) {
      const authResult = await authMiddleware(req, 'coach');
      if (!authResult.success) return authResult.response;
      return coachRoutes(req, authResult.user);
    }

    if (path.startsWith('/api/client')) {
      const authResult = await authMiddleware(req, 'client');
      if (!authResult.success) return authResult.response;
      return clientRoutes(req, authResult.user);
    }

    if (path.startsWith('/api/admin')) {
      // Admin login doesn't require auth
      if (path === '/api/admin/login') {
        return adminRoutes(req);
      }
      // All other admin routes require admin auth
      const authResult = await authMiddleware(req, 'admin');
      if (!authResult.success) return authResult.response;
      return adminRoutes(req, authResult.user);
    }

    if (path === '/healthz') {
      return jsonResponse({ success: true, data: { status: 'ok' } });
    }

    return jsonResponse({ success: false, error: 'Not Found' }, { status: 404 });
  },
});

console.log(`Bun API listening on http://${hostname}:${port}`);
