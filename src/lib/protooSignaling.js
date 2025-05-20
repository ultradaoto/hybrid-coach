import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const protoo = require('protoo-server'); // Use require for protoo-server
// console.log('Inspecting protoo object keys:', Object.keys(protoo)); // [ 'version', 'Room', 'WebSocketServer' ]

import mediasoup from 'mediasoup';
// import { WebSocketServer } from 'ws'; // No longer need WebSocketServer from 'ws' directly for Protoo
import { URL } from 'url';
import createDebug from 'debug';
import { getTwilioIceServers } from '../services/turnService.js';
import https from 'https';

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

async function getIceServers() {
  try {
    // Try to get Twilio ICE servers first
    const twilioServers = await getTwilioIceServers();
    debug('Successfully fetched Twilio ICE servers');
    
    // Log details of each server
    twilioServers.forEach((server, index) => {
      const urls = Array.isArray(server.urls) ? server.urls.join(', ') : server.urls;
      debug(`ICE Server ${index + 1}: ${urls}`);
      if (server.credential) {
        debug(`Server ${index + 1} has credentials: YES`);
      }
      if (urls && urls.includes('turn:')) {
        debug(`Server ${index + 1} is a TURN server`);
      }
    });
    
    return twilioServers;
  } catch (err) {
    error('Error fetching Twilio ICE servers, using fallback STUN servers:', err);
    // Fallback to public STUN if Twilio fails
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ];
  }
}

// Add this function to detect the server's public IP address
async function getPublicIpAddress() {
  return new Promise((resolve, reject) => {
    https.get('https://api.ipify.org', (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data.trim());
      });
    }).on('error', (err) => {
      error('Error fetching public IP:', err);
      reject(err);
    });
  });
}

export async function initProtooSignaling(httpServer) {
  await getOrCreateWorker();

  // Log and verify the announced IP
  const configuredAnnouncedIp = process.env.MEDIASOUP_ANNOUNCED_IP;
  let actualAnnouncedIp = configuredAnnouncedIp;
  
  if (!configuredAnnouncedIp) {
    try {
      actualAnnouncedIp = await getPublicIpAddress();
      debug(`No MEDIASOUP_ANNOUNCED_IP set in .env, detected public IP as: ${actualAnnouncedIp}`);
      process.env.MEDIASOUP_ANNOUNCED_IP = actualAnnouncedIp;
    } catch (err) {
      error('Failed to auto-detect public IP, WebRTC may fail:', err);
    }
  } else {
    debug(`Using configured MEDIASOUP_ANNOUNCED_IP: ${configuredAnnouncedIp}`);
  }

  // const wsServer = new WebSocketServer({ server: httpServer, path: '/protoo' }); // OLD: Using 'ws' directly
  const protooWsServer = new protoo.WebSocketServer(httpServer, {
    path: '/protoo',
    maxReceivedFrameSize      : 2097152, // Increased from 960000 to 2MB
    maxReceivedMessageSize    : 2097152, // Increased from 960000 to 2MB
    fragmentOutgoingMessages  : true,
    fragmentationThreshold    : 1048576, // Increased from 960000 to 1MB
    keepalive: true,
    keepaliveInterval: 15000, // Send keepalive more frequently (15 seconds)
    keepaliveGracePeriod: 15000, // Wait 15 seconds before dropping connection
    dropConnectionOnKeepaliveTimeout: true,
    autoAcceptConnections: false, // Explicitly handle each connection
    ignoreXForwardedFor: false, // Support proxied connections
    closeTimeout: 5000, // 5 seconds to allow proper connection closing
    maxConnections: 100, // Limit concurrent connections
    clientTracking: true, // Keep track of connected clients
    disableNagleAlgorithm: true // Disable Nagle's algorithm for better real-time performance
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

      // Check if we already have this peer in the room (reconnection case)
      const existingPeerData = roomData.peers.get(peerId);
      
      // If there's an existing peer with this ID, clean it up first
      if (existingPeerData) {
        debug(`Peer ${peerId} reconnecting - cleaning up old resources`);
        
        try {
          // Save producer information for later use
          const producerInfo = Array.from(existingPeerData.producers.values()).map(p => ({
            id: p.id,
            kind: p.kind,
            appData: p.appData
          }));
          
          // Store reconnection info in room data
          if (!roomData.reconnectInfo) {
            roomData.reconnectInfo = {};
          }
          
          roomData.reconnectInfo[peerId] = {
            producerInfo,
            timestamp: Date.now()
          };
          
          // Try to close transports and clean up peer resources
          if (existingPeerData.transports) {
            for (const transport of existingPeerData.transports.values()) {
              try {
                transport.close();
              } catch (e) {
                warn(`Error closing transport for reconnecting peer ${peerId}:`, e);
              }
            }
          }
          
          // Remove from existing room structures
          if (protooRoom.hasPeer(peerId)) {
            debug(`Removing existing protoo peer ${peerId} for clean reconnection`);
            if (typeof protooRoom.removePeer === 'function') {
              protooRoom.removePeer(peerId);
            } else if (protooRoom.peers && typeof protooRoom.peers.delete === 'function') {
              protooRoom.peers.delete(peerId);
            } else {
              warn(`Could not find method to remove peer ${peerId} from protoo room`);
              // If we can't remove, try to close the peer
              const existingPeer = Array.from(protooRoom.peers || []).find(p => p.id === peerId);
              if (existingPeer && typeof existingPeer.close === 'function') {
                existingPeer.close();
              }
            }
          }
          
          // Delete the peer data to allow clean reconnection
          roomData.peers.delete(peerId);
        } catch (cleanupErr) {
          warn(`Error cleaning up existing peer ${peerId} for reconnection:`, cleanupErr);
          // Continue anyway to allow reconnection
        }
      }

      // Accept the connection and get the Protoo transport instance.
      const protooTransport = accept(); // This is the key change

      // Create the peer with the given ID
      let protooPeer;
      try {
        protooPeer = await protooRoom.createPeer(peerId, protooTransport);
      } catch (peerCreateErr) {
        // Handle case where peer might still exist in room
        warn(`Error creating peer ${peerId}, might already exist:`, peerCreateErr);
        
        // Try to get existing peer
        if (protooRoom.hasPeer(peerId)) {
          warn(`Peer ${peerId} already exists in protoo room, attempting to close and recreate`);
          // Use the appropriate method to remove the peer
          if (typeof protooRoom.removePeer === 'function') {
            protooRoom.removePeer(peerId);
          } else if (protooRoom.peers && typeof protooRoom.peers.delete === 'function') {
            // Try using the peers Map directly
            protooRoom.peers.delete(peerId);
          } else {
            warn(`Could not find method to remove peer ${peerId} from protoo room`);
            // If we can't remove, try to close the peer
            const existingPeer = Array.from(protooRoom.peers || []).find(p => p.id === peerId);
            if (existingPeer && typeof existingPeer.close === 'function') {
              existingPeer.close();
            }
          }
          // Retry peer creation
          protooPeer = await protooRoom.createPeer(peerId, protooTransport);
        } else {
          // If failed for another reason, just throw
          throw peerCreateErr;
        }
      }
      
      debug(`protoo peer created: ${peerId} in room ${roomId} with transportId ${protooTransport.id}`);

      // Create fresh peer data structure
      roomData.peers.set(peerId, {
        protooPeer,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
        lastActivity: Date.now()
      });
      
      // Check if this peer is reconnecting and had producers
      if (roomData.reconnectInfo && roomData.reconnectInfo[peerId]) {
        const reconnectData = roomData.reconnectInfo[peerId];
        // Only use reconnect data if it's recent (within last 60 seconds)
        if (Date.now() - reconnectData.timestamp < 60000) {
          debug(`Peer ${peerId} is reconnecting, will restore producer info`);
          // We'll tell this peer about other peers' producers in the existing loop below
          
          // Note: We don't actually need to restore the producers here since
          // clients will re-produce media after connection is established
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
              
              // Get ICE servers on demand for each transport
              const iceServers = await getIceServers();
              debug(`Got ${iceServers.length} ICE servers for transport`);
              
              // Only force TURN if proper TURN servers are available
              const hasTurnServer = iceServers.some(server => {
                const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
                return urls.some(url => url.startsWith('turn:'));
              });
              
              // Use the actual public IP if available
              const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || null;
              
              // Check if we are very likely in localhost development mode
              const isLocalDevelopment = info && info.origin && (
                info.origin.includes('localhost') || 
                info.origin.includes('127.0.0.1')
              );
              
              const webRtcTransportOptions = {
                listenIps: [
                  // Try with explicit IP announcement
                  { ip: '0.0.0.0', announcedIp },
                  // Add a direct localhost IP for local development
                  ...(isLocalDevelopment ? [{ ip: '127.0.0.1', announcedIp: '127.0.0.1' }] : [])
                ],
                enableUdp: true, 
                enableTcp: true, 
                preferUdp: true,
                initialAvailableOutgoingBitrate: 1000000,
                appData: { producing, consuming },
                // Only include iceServers in production mode
                ...((!isLocalDevelopment && hasTurnServer) ? { iceServers } : {}),
                // Additional settings to improve NAT traversal
                enableSctp: !!sctpCapabilities,
                numSctpStreams: sctpCapabilities ? sctpCapabilities.numStreams : undefined,
                // Special options for localhost connectivity
                enableUdpSrflx: true, // Enable UDP Server Reflexive candidates
                iceTransportPolicy: 'all', // Accept all ICE candidate types
                additionalSettings: {
                  iceCheckMinInterval: isLocalDevelopment ? 50 : 100, // Faster ICE checks in development
                  // Add keep-alive settings to maintain long connections
                  dtlsTimeoutInitial: 30000, // 30 seconds initial DTLS timeout
                  dtlsTimeoutMax: 60000, // 60 seconds max DTLS timeout
                  keepaliveIntervalMs: 2500, // Send ICE keep-alive packets every 2.5 seconds
                  iceUnwritableTimeout: 30000, // 30 seconds before considering ICE unwritable
                  iceInactiveTimeout: 30000, // 30 seconds inactive timeout
                  iceFailedTimeout: 30000, // 30 seconds failure timeout
                  // Connection health monitoring
                  enableHealthMonitoring: true,
                  healthCheckIntervalMs: 10000 // Check connection health every 10 seconds
                }
              };
              
              // Log important options
              debug(`Creating transport with options: listenIps=${JSON.stringify(webRtcTransportOptions.listenIps)}, enableUdp=${webRtcTransportOptions.enableUdp}, enableTcp=${webRtcTransportOptions.enableTcp}`);
              
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
            case 'ping': {
              // Simple ping-pong for connection keep-alive and health monitoring
              debug(`Received ping from peer ${peerId}`);
              
              // Update last activity timestamp
              if (peerData) {
                peerData.lastActivity = Date.now();
              }
              
              acceptRequest({ timestamp: Date.now() });
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

  // Add automatic connection health checking
  if (typeof global.roomHealthInterval === 'undefined') {
    global.roomHealthInterval = setInterval(async () => {
      try {
        // Check all rooms
        for (const [roomId, roomData] of rooms.entries()) {
          debug(`Health check for room: ${roomId}, peers: ${roomData.peers.size}`);
          
          // Check each peer's signaling connection
          for (const [peerId, peerData] of roomData.peers.entries()) {
            if (!peerData.protooPeer) continue;
            
            try {
              // Test signaling connection with a ping
              await peerData.protooPeer.request('ping', { timestamp: Date.now() })
                .then(() => {
                  // Connection is good, peer responded
                  debug(`Peer ${peerId} responded to health check ping`);
                })
                .catch(err => {
                  // Connection may be dead
                  warn(`Peer ${peerId} failed health check ping: ${err.message}`);
                  
                  // Check last activity time
                  const lastActivity = peerData.lastActivity || 0;
                  const inactiveTime = Date.now() - lastActivity;
                  
                  // If peer has been inactive for more than 60 seconds, consider them disconnected
                  if (inactiveTime > 60000) {
                    warn(`Peer ${peerId} inactive for ${Math.floor(inactiveTime/1000)}s, removing from room ${roomId}`);
                    
                    // Close all transports for this peer
                    if (peerData.transports && peerData.transports.size > 0) {
                      for (const transport of peerData.transports.values()) {
                        try {
                          transport.close();
                        } catch (e) {
                          error(`Error closing transport for inactive peer ${peerId}:`, e);
                        }
                      }
                    }
                    
                    // Remove peer from room
                    roomData.peers.delete(peerId);
                    roomData.protooRoom.hasPeer(peerId) && roomData.protooRoom.removePeer(peerId);
                  }
                });
            } catch (pingErr) {
              error(`Error during health check for peer ${peerId}:`, pingErr);
            }
            
            // Record this connection check as activity
            peerData.lastActivity = Date.now();
          }
          
          // Clean up empty rooms
          if (roomData.peers.size === 0) {
            debug(`Room ${roomId} is empty, closing mediasoupRouter and removing room`);
            roomData.mediasoupRouter.close();
            rooms.delete(roomId);
          }
        }
      } catch (e) {
        error(`Error in room health check interval:`, e);
      }
    }, 30000); // Check every 30 seconds
  }
} 