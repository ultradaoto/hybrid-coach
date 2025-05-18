import mediasoup from 'mediasoup';
import { Server } from 'socket.io';

/*
 * Lightweight SFU helper.
 * Export initMediaSFU(httpServer) which mounts a Socket.IO namespace
 * at /mediasoup and relays media for each roomId.
 */

export async function initMediaSFU(httpServer) {
  const io = new Server(httpServer, {
    path: '/mediasoup',
    cors: { origin: '*' },
  });

  const worker = await mediasoup.createWorker();
  const mediaCodecs = [
    { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
    { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
  ];

  const rooms = new Map(); // roomId -> { router, peers: Map(socketId, transports) }

  async function getRoom(roomId) {
    if (rooms.has(roomId)) return rooms.get(roomId);
    const router = await worker.createRouter({ mediaCodecs });
    const peers = new Map();
    const room = { router, peers };
    rooms.set(roomId, room);
    return room;
  }

  io.on('connection', socket => {
    let currentRoomId;
    let transports = [];

    socket.on('join-sfu', async ({ roomId }) => {
      currentRoomId = roomId;
      const room = await getRoom(roomId);
      socket.emit('sfu-rtpCapabilities', room.router.rtpCapabilities);
    });

    socket.on('sfu-create-transport', async (_, cb) => {
      const room = await getRoom(currentRoomId);
      const transport = await room.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: null }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });
      transports.push(transport);
      cb({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    });

    socket.on('sfu-connect-transport', async ({ id, dtlsParameters }, cb) => {
      const transport = transports.find(t => t.id === id);
      await transport.connect({ dtlsParameters });
      cb();
    });

    socket.on('sfu-produce', async ({ transportId, kind, rtpParameters }, cb) => {
      const room = await getRoom(currentRoomId);
      const transport = transports.find(t => t.id === transportId);
      const producer = await transport.produce({ kind, rtpParameters });
      socket.broadcast.to(currentRoomId).emit('sfu-newProducer', { id: producer.id, kind });
      cb({ id: producer.id });
    });

    socket.on('sfu-consume', async ({ transportId, producerId, rtpCapabilities }, cb) => {
      try {
        const room = await getRoom(currentRoomId);
        if (!room.router.canConsume({ producerId, rtpCapabilities })) {
          return cb({ error: 'cannot consume' });
        }
        const transport = transports.find(t => t.id === transportId);
        const consumer = await transport.consume({ producerId, rtpCapabilities });
        cb({
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });
      } catch (err) {
        console.error(err);
        cb({ error: err.message });
      }
    });

    socket.join(currentRoomId);

    socket.on('disconnect', () => {
      transports.forEach(t => t.close());
    });
  });
} 