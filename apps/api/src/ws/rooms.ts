import type { Server, ServerWebSocket, WebSocketHandler } from 'bun';

export type RoomsWsData = {
  peerId: string;
  roomId: string | null;
  role: 'coach' | 'client' | 'unknown';
  name?: string;
};

type JoinMessage = {
  type: 'join';
  roomId: string;
  role?: 'coach' | 'client';
  name?: string;
};

type SignalMessage = {
  type: 'signal';
  roomId: string;
  to?: string;
  data: unknown;
};

type ControlMessage = {
  type: 'ai_control' | 'chat' | 'presence';
  roomId: string;
  to?: string;
  data?: unknown;
};

type RoomsMessage = JoinMessage | SignalMessage | ControlMessage;

type PeerInfo = {
  peerId: string;
  role: RoomsWsData['role'];
  name?: string;
};

type RoomState = {
  createdAt: number;
  peers: Map<string, ServerWebSocket<RoomsWsData>>;
};

const rooms = new Map<string, RoomState>();

function getOrCreateRoom(roomId: string): RoomState {
  const existing = rooms.get(roomId);
  if (existing) return existing;
  const next: RoomState = { createdAt: Date.now(), peers: new Map() };
  rooms.set(roomId, next);
  return next;
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function send(ws: ServerWebSocket<RoomsWsData>, msg: unknown) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // ignore
  }
}

function listPeers(room: RoomState): PeerInfo[] {
  const peers: PeerInfo[] = [];
  for (const [peerId, sock] of room.peers) {
    peers.push({ peerId, role: sock.data.role, name: sock.data.name });
  }
  return peers;
}

function removeFromRoom(ws: ServerWebSocket<RoomsWsData>) {
  const roomId = ws.data.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  room.peers.delete(ws.data.peerId);
  console.log(`[rooms-ws] peer_left room=${roomId} peer=${ws.data.peerId} role=${ws.data.role}`);
  for (const sock of room.peers.values()) {
    send(sock, { type: 'peer_left', roomId, peerId: ws.data.peerId });
  }
  if (room.peers.size === 0) rooms.delete(roomId);
  ws.data.roomId = null;
}

export function createRoomId(): string {
  const roomId = crypto.randomUUID();
  getOrCreateRoom(roomId);
  return roomId;
}

export function roomExists(roomId: string): boolean {
  return rooms.has(roomId);
}

export function handleRoomsUpgrade(req: Request, server: Server<RoomsWsData>): Response {
  const ok = server.upgrade(req, {
    data: {
      peerId: crypto.randomUUID(),
      roomId: null,
      role: 'unknown',
    } satisfies RoomsWsData,
  });
  if (ok) return new Response(null);
  return new Response('Upgrade failed', { status: 400 });
}

export const roomsWebsocket = {
  open(ws: ServerWebSocket<RoomsWsData>) {
    send(ws, { type: 'hello', peerId: ws.data.peerId });
  },

  message(ws: ServerWebSocket<RoomsWsData>, message: string | Uint8Array) {
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object') return;

    const msg = parsed as Partial<RoomsMessage>;
    if (msg.type === 'join') {
      if (typeof msg.roomId !== 'string' || !msg.roomId) return;
      const roomId = msg.roomId;
      const room = getOrCreateRoom(roomId);

      removeFromRoom(ws);

      ws.data.roomId = roomId;
      ws.data.role = msg.role === 'coach' || msg.role === 'client' ? msg.role : 'unknown';
      ws.data.name = typeof msg.name === 'string' ? msg.name : undefined;

      const wasEmpty = room.peers.size === 0;
      room.peers.set(ws.data.peerId, ws);

      console.log(
        `[rooms-ws] peer_joined room=${roomId} peer=${ws.data.peerId} role=${ws.data.role} peers=${room.peers.size}`
      );

      const peers = listPeers(room);
      send(ws, {
        type: 'joined',
        roomId,
        peerId: ws.data.peerId,
        isOfferer: wasEmpty,
        peers,
      });

      for (const sock of room.peers.values()) {
        if (sock === ws) continue;
        send(sock, {
          type: 'peer_joined',
          roomId,
          peer: { peerId: ws.data.peerId, role: ws.data.role, name: ws.data.name },
        });
      }
      return;
    }

    const roomId = typeof msg.roomId === 'string' ? msg.roomId : ws.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (msg.type === 'signal') {
      const to = typeof msg.to === 'string' ? msg.to : null;
      if (to) {
        const target = room.peers.get(to);
        if (!target) return;
        send(target, { type: 'signal', roomId, from: ws.data.peerId, data: msg.data });
        return;
      }

      for (const sock of room.peers.values()) {
        if (sock === ws) continue;
        send(sock, { type: 'signal', roomId, from: ws.data.peerId, data: msg.data });
      }
      return;
    }

    if (msg.type === 'ai_control' || msg.type === 'chat' || msg.type === 'presence') {
      const to = typeof msg.to === 'string' ? msg.to : null;
      const envelope = { type: msg.type, roomId, from: ws.data.peerId, data: msg.data ?? null };
      if (to) {
        const target = room.peers.get(to);
        if (target) send(target, envelope);
        return;
      }
      for (const sock of room.peers.values()) {
        if (sock === ws) continue;
        send(sock, envelope);
      }
      return;
    }
  },

  close(ws: ServerWebSocket<RoomsWsData>) {
    removeFromRoom(ws);
  },
} satisfies WebSocketHandler<RoomsWsData>;
