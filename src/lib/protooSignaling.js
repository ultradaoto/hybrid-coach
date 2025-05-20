import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const protoo = require('protoo-server'); // Use require for protoo-server
// console.log('Inspecting protoo object keys:', Object.keys(protoo)); // [ 'version', 'Room', 'WebSocketServer' ]

import mediasoup from 'mediasoup';
// import { WebSocketServer } from 'ws'; // No longer need WebSocketServer from 'ws' directly for Protoo
import { URL } from 'url';
import createDebug from 'debug';

const debug = createDebug('hybrid-coach:protooSignaling');
const warn = createDebug('hybrid-coach:protooSignaling:WARN');
const error = createDebug('hybrid-coach:protooSignaling:ERROR');

let worker;
const rooms = new Map(); // roomId -> { protooRoom, mediasoupRouter, peers: Map<peerId, { transports, producers, consumers }> }

const mediaCodecs = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
  // { kind: 'video', mimeType: 'video/H264', clockRate: 90000, parameters: { 'packetization-mode': 1, 'profile-level-id': '42e01f' } },
];

async function getOrCreateWorker() {
  if (worker && !worker.closed) {
    return worker;
  }
  //TODO: Get number of workers from .env or config
  worker = await mediasoup.createWorker({
    logLevel: 'warn', // TODO: From config
    rtcMinPort: 40000, // TODO: From config
    rtcMaxPort: 49999, // TODO: From config
  });
  debug('mediasoup worker created');
  worker.on('died', (err) => {
    error('mediasoup worker died (this should not happen): %o', err);
    process.exit(1); // TODO: More graceful recovery
  });
  return worker;
}

async function getOrCreateRoom(roomId) {
  let roomData = rooms.get(roomId);
  if (roomData) {
    return roomData;
  }

  const currentWorker = await getOrCreateWorker();
  const mediasoupRouter = await currentWorker.createRouter({ mediaCodecs });
  debug(`mediasoup router created for room ${roomId}`);

  const protooRoom = new protoo.Room();
  roomData = { protooRoom, mediasoupRouter, peers: new Map() };
  rooms.set(roomId, roomData);

  // Periodically check for empty rooms to clean up (optional)
  // router.on('close', () => rooms.delete(roomId)); 

  return roomData;
}

export async function initProtooSignaling(httpServer) {
  await getOrCreateWorker();

  // const wsServer = new WebSocketServer({ server: httpServer, path: '/protoo' }); // OLD: Using 'ws' directly
  const protooWsServer = new protoo.WebSocketServer(httpServer, {
    path: '/protoo',
    maxReceivedFrameSize      : 960000, // TODO: From config
    maxReceivedMessageSize    : 960000,
    fragmentOutgoingMessages  : true,
    fragmentationThreshold    : 960000
  });

  protooWsServer.on('connectionrequest', async (info, accept, reject) => {
    // The 'ws' (WebSocket instance) is indirectly available via 'accept()' or info.socket
    // For Protoo, we typically get the transport by calling accept().
    const u = new URL(info.request.url, `ws://${info.request.headers.host}`);
    const roomId = u.searchParams.get('roomId');
    const peerId = u.searchParams.get('peerId');

    debug(`protoo connection request for roomId "${roomId}", peerId "${peerId}" from origin ${info.origin}`);

    if (!roomId || !peerId) {
      reject(400, 'Connection request without roomId and/or peerId');
      return;
    }

    try {
      const roomData = await getOrCreateRoom(roomId);
      const { protooRoom, mediasoupRouter } = roomData;

      // Accept the connection and get the Protoo transport instance.
      const protooTransport = accept(); // This is the key change

      const protooPeer = await protooRoom.createPeer(peerId, protooTransport);
      debug(`protoo peer created: ${peerId} in room ${roomId} with transportId ${protooTransport.id}`);

      roomData.peers.set(peerId, {
        protooPeer,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map()
      });
      
      // Check if this peer is reconnecting and had producers
      if (roomData.reconnectInfo && roomData.reconnectInfo[peerId]) {
        const reconnectData = roomData.reconnectInfo[peerId];
        // Only use reconnect data if it's recent (within last 30 seconds)
        if (Date.now() - reconnectData.timestamp < 30000) {
          debug(`Peer ${peerId} is reconnecting, will restore producer info`);
          // We'll tell this peer about other peers' producers in the existing loop below
          // But don't need any special handling here
        }
        // Clean up after using
        delete roomData.reconnectInfo[peerId];
      }
      
      // Inform the new peer about existing producers in the room
      for (const existingPeerData of roomData.peers.values()) {
        if (existingPeerData.protooPeer.id === peerId) continue; // Don't tell about self, though it has no producers yet
        for (const producer of existingPeerData.producers.values()) {
          try {
            protooPeer.notify('newProducer', { 
              peerId: existingPeerData.protooPeer.id, 
              producerId: producer.id,
              kind: producer.kind,
              appData: producer.appData
            }).catch(err => {
              error(`Error notifying new peer ${peerId} of existing producer ${producer.id}: %o`, err);
            });
          } catch (notifyError) {
            error(`Error trying to notify new peer ${peerId} of existing producer ${producer.id}: %o`, notifyError);
          }
        }
      }
      
      protooPeer.on('request', async (requestMessage, acceptRequest, rejectRequest) => {
        debug(`protoo request from ${peerId} (transportId: ${protooTransport.id}): method "%s", data: %o`, requestMessage.method, requestMessage.data);
        const peerData = roomData.peers.get(peerId);
        if (!peerData) {
          error('cannot find peerData for peerId', peerId);
          rejectRequest(404, 'peer not found');
          return;
        }
        try {
          switch (requestMessage.method) {
            case 'getRouterRtpCapabilities': {
              acceptRequest(mediasoupRouter.rtpCapabilities);
              break;
            }
            case 'createWebRtcTransport': {
              const { producing, consuming, sctpCapabilities } = requestMessage.data;
              const webRtcTransportOptions = {
                listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || null }],
                enableUdp: true, enableTcp: true, preferUdp: true,
                initialAvailableOutgoingBitrate: 1000000, 
                appData: { producing, consuming },
                iceServers: [
                  { urls: 'stun:stun.l.google.com:19302' },
                  { urls: 'stun:stun1.l.google.com:19302' },
                  { urls: 'stun:stun2.l.google.com:19302' },
                  { urls: 'stun:stun3.l.google.com:19302' },
                  { urls: 'stun:stun4.l.google.com:19302' }
                ]
              };
              if (sctpCapabilities) {
                webRtcTransportOptions.enableSctp = true;
                webRtcTransportOptions.numSctpStreams = sctpCapabilities.numStreams;
              }
              const transport = await mediasoupRouter.createWebRtcTransport(webRtcTransportOptions);
              debug(`[SERVER createWebRtcTransport] WebRtcTransport created: transport.id = ${transport.id}`);
              if (!transport.id) {
                error('[SERVER createWebRtcTransport] CRITICAL: transport.id is missing after creation!');
              }
              peerData.transports.set(transport.id, transport);

              transport.on('dtlsstatechange', (dtlsState) => {
                if (dtlsState === 'closed') {
                  debug('WebRtcTransport DTLS state closed:', transport.id);
                  transport.close();
                }
              });
              const responseData = {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
                sctpParameters: transport.sctpParameters
              };
              debug('[SERVER createWebRtcTransport] Accepting request with data:',responseData);
              acceptRequest(responseData);
              break;
            }
            case 'connectWebRtcTransport': {
              const { transportId, dtlsParameters } = requestMessage.data;
              const transport = peerData.transports.get(transportId);

              if (!transport) {
                throw new Error(`transport with id "${transportId}" not found`);
              }

              await transport.connect({ dtlsParameters });
              debug(`WebRtcTransport connected: ${transportId}`);
              acceptRequest({}); // mediasoup-demo sends empty object on success
              break;
            }
            case 'produce': {
              const { transportId, kind, rtpParameters, appData } = requestMessage.data;
              const transport = peerData.transports.get(transportId);
              if (!transport) {
                throw new Error(`transport with id "${transportId}" not found for producing`);
              }
              const producer = await transport.produce({ kind, rtpParameters, appData });
              peerData.producers.set(producer.id, producer);
              debug(`Producer created: ${producer.id} on transport ${transportId}`);

              acceptRequest({ id: producer.id });

              // Notify other peers in the same room (excluding the producer itself)
              for (const otherPeerData of roomData.peers.values()) {
                if (otherPeerData.protooPeer.id === peerId) continue;
                try {
                  otherPeerData.protooPeer.notify('newProducer', { 
                    peerId, // Let them know who produced
                    producerId: producer.id, 
                    kind: producer.kind, 
                    appData: producer.appData 
                  }).catch(err => {
                    error(`Error notifying peer ${otherPeerData.protooPeer.id} of new producer: %o`, err);
                  });
                } catch (notifyError) {
                   error(`Error trying to notify peer ${otherPeerData.protooPeer.id}: %o`, notifyError);
                }
              }
              break;
            }
            case 'consume': {
              const { rtpCapabilities, producerId } = requestMessage.data;
              // Find a suitable transport - ensure it's a consuming transport
              const consumerTransport = Array.from(peerData.transports.values())
                .find(t => t.appData && t.appData.consuming === true);

              if (!consumerTransport) {
                debug(`No suitable (consuming) transport found for peer ${peerId} to consume producer ${producerId}. Available transports:`, 
                  Array.from(peerData.transports.values()).map(t => `${t.id}(consuming:${!!t.appData.consuming})`));
                throw new Error(`no suitable (consuming) transport found for peer ${peerId} to consume producer ${producerId}`);
              }
              
              // Find the producer across all peers in the room
              let producer = null;
              for (const [otherPeerId, otherPeerData] of roomData.peers.entries()) {
                const foundProducer = otherPeerData.producers.get(producerId);
                if (foundProducer) {
                  producer = foundProducer;
                  debug(`Found producer ${producerId} from peer ${otherPeerId}`);
                  break;
                }
              }
              
              if (!producer) {
                debug(`Producer ${producerId} not found in any peer`);
                throw new Error(`producer ${producerId} not found`);
              }
              
              if (!mediasoupRouter.canConsume({ producerId, rtpCapabilities })) {
                throw new Error(`peer ${peerId} cannot consume producer ${producerId}`);
              }

              const consumer = await consumerTransport.consume({
                producerId,
                rtpCapabilities,
                paused: true // mediasoup-demo typically creates consumers paused
              });
              peerData.consumers.set(consumer.id, consumer);
              debug(`Consumer created: ${consumer.id} for producer ${producerId} on transport ${consumerTransport.id}`);

              consumer.on('transportclose', () => {
                debug(`Consumer ${consumer.id} transport closed`);
                consumer.close();
              });
              consumer.on('producerclose', () => {
                debug(`Consumer ${consumer.id} producer closed`);
                consumer.close();
              });

              acceptRequest({
                id: consumer.id,
                producerId: producerId,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters
              });
              break;
            }
            case 'resumeConsumer': {
              const { consumerId } = requestMessage.data;
              const consumer = peerData.consumers.get(consumerId);
              if (!consumer) {
                throw new Error(`consumer with id "${consumerId}" not found`);
              }
              await consumer.resume();
              debug(`Consumer resumed: ${consumerId}`);
              acceptRequest({});
              break;
            }
            default: {
              error('unknown protoo request.method "%s"', requestMessage.method);
              rejectRequest(400, `unknown protoo request.method "${requestMessage.method}"`);
            }
          }
        } catch (err) {
          error('protoo request failed: %o', err);
          rejectRequest(500, err.message);
        }
      });

      protooPeer.on('close', () => {
        debug(`protoo peer closed: ${peerId} (transportId: ${protooTransport.id})`);
        const peerData = roomData.peers.get(peerId);
        if (peerData) {
          // Store information about producers for potential reconnection
          const producerInfo = Array.from(peerData.producers.values()).map(p => ({
            id: p.id,
            kind: p.kind,
            appData: p.appData
          }));
          
          // Close all transports for this peer
          peerData.transports.forEach(t => t.close());
          // Consumers & producers are automatically closed when their transport closes
          
          // Clean up peer data
          roomData.peers.delete(peerId);
          
          // Store reconnection info for a short time
          setTimeout(() => {
            debug(`Storing reconnection info for ${peerId}`);
            roomData.reconnectInfo = roomData.reconnectInfo || {};
            roomData.reconnectInfo[peerId] = {
              producerInfo,
              timestamp: Date.now()
            };
          }, 100);
        }
        
        // Optional: If room becomes empty, close the mediasoupRouter and delete the room
        if (roomData.peers.size === 0 && roomData.protooRoom.peers.length === 0) {
          debug(`room ${roomId} is empty, closing mediasoupRouter`);
          mediasoupRouter.close();
          rooms.delete(roomId);
        }
      });

    } catch (err) {
      error(`Error processing protoo connectionrequest for ${peerId} in room ${roomId}: %s`, err.message, err.stack);
      reject(500, err.message || 'Error processing connection request'); // Reject the connection request itself
    }
  });

  debug('Protoo signaling server (using protoo.WebSocketServer) initialized and listening on /protoo');
} 