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
  
  // Log the protoo server options for debugging
  console.log('[PROTOO] Initializing WebSocketServer with path: /protoo');
  
  // SWITCH TO NATIVE WEBSOCKET IMPLEMENTATION
  const WebSocketServer = require('ws').Server;
  const wsServer = new WebSocketServer({ 
    noServer: true // Use noServer mode to manually handle upgrades
  });
  
  console.log('[PROTOO] Using native WebSocket server with noServer mode');
  
  // Create a Map to store active WebSocket connections by roomId and peerId
  const wsConnections = new Map();
  
  // Add upgrade handler to httpServer
  httpServer.on('upgrade', (request, socket, head) => {
    // Only handle connections to /protoo path
    if (request.url.startsWith('/protoo')) {
      console.log(`[PROTOO] Handling upgrade for: ${request.url}`);
      
      wsServer.handleUpgrade(request, socket, head, (ws) => {
        wsServer.emit('connection', ws, request);
      });
    }
  });
  
  // Handle WebSocket connections directly
  wsServer.on('connection', async (ws, req) => {
    console.log(`[PROTOO-WS] Raw WebSocket connection: ${req.url}`);
    
    try {
      // Parse URL parameters
      const urlStr = req.url;
      const u = new URL(urlStr, `ws://${req.headers.host}`);
      const roomId = u.searchParams.get('roomId');
      const peerId = u.searchParams.get('peerId');
      
      if (!roomId || !peerId) {
        console.log(`[PROTOO-WS] Missing roomId or peerId, closing connection`);
        ws.close(4000, 'Missing roomId or peerId');
        return;
      }
      
      console.log(`[PROTOO-WS] Connection established for room ${roomId}, peer ${peerId}`);
      
      // Setup ping/pong for keepalive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocketServer.OPEN) {
          try {
            ws.ping();
          } catch (err) {
            console.error(`[PROTOO-WS] Error sending ping to peer ${peerId}:`, err);
          }
        } else {
          clearInterval(pingInterval);
        }
      }, 5000);
      
      ws.on('pong', () => {
        // Update last activity timestamp
        if (!wsConnections.has(roomId)) {
          wsConnections.set(roomId, new Map());
        }
        const roomPeers = wsConnections.get(roomId);
        
        if (!roomPeers.has(peerId)) {
          roomPeers.set(peerId, { ws, lastActivity: Date.now() });
        } else {
          const peerData = roomPeers.get(peerId);
          peerData.lastActivity = Date.now();
        }
      });
      
      // Store the connection
      if (!wsConnections.has(roomId)) {
        wsConnections.set(roomId, new Map());
      }
      const roomPeers = wsConnections.get(roomId);
      roomPeers.set(peerId, { ws, lastActivity: Date.now() });
      
      // Get or create room data
      const roomData = await getOrCreateRoom(roomId);
      const { protooRoom, mediasoupRouter } = roomData;
      
      // Create a protoo room if it doesn't exist yet
      let protooPeer = null;
      
      // Handle messages
      ws.on('message', async (message) => {
        try {
          // Debug raw message
          console.log(`[PROTOO-WS] RAW message received: ${message.toString('utf8').substring(0, 100)}...`);
          
          const msg = JSON.parse(message);
          console.log(`[PROTOO-WS] Received message from peer ${peerId}:`, msg.method || 'notification');
          
          // Handle requests
          if (msg.method) {
            const peerData = roomData.peers.get(peerId);
            if (!peerData && msg.method !== 'getRouterRtpCapabilities') {
              console.error(`[PROTOO-WS] Cannot find peer data for ${peerId}`);
              sendResponse(ws, msg.id, { error: 'Peer not found' });
              return;
            }
            
            switch (msg.method) {
              case 'getRouterRtpCapabilities':
                // First request when connecting - create the peer if it doesn't exist
                if (!roomData.peers.has(peerId)) {
                  // Create a new peer data structure
                  roomData.peers.set(peerId, {
                    transports: new Map(),
                    producers: new Map(),
                    consumers: new Map(),
                    lastActivity: Date.now()
                  });
                  console.log(`[PROTOO-WS] Created peer data for ${peerId}`);
                }
                
                console.log(`[PROTOO-WS] Sending RTP capabilities to ${peerId}`);
                
                sendResponse(ws, msg.id, mediasoupRouter.rtpCapabilities);
                break;
                
              case 'createWebRtcTransport':
                const { producing, consuming, sctpCapabilities } = msg.data;
                
                try {
                  console.log(`[PROTOO-WS] START createWebRtcTransport for peer ${peerId} (producing: ${producing}, consuming: ${consuming})`);
                  
                  // Get ICE servers on demand for each transport
                  const iceServers = await getIceServers();
                  console.log(`[PROTOO-WS] Got ${iceServers.length} ICE servers for transport`);
                  
                  // Use the actual public IP if available
                  const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || null;
                  
                  // Check if we are very likely in localhost development mode
                  const isLocalDevelopment = req.headers.host && (
                    req.headers.host.includes('localhost') || 
                    req.headers.host.includes('127.0.0.1')
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
                    // CRITICAL FIX: ALWAYS include ICE servers, regardless of environment
                    iceServers: iceServers,
                    // Additional settings to improve NAT traversal
                    enableSctp: !!sctpCapabilities,
                    numSctpStreams: sctpCapabilities ? sctpCapabilities.numStreams : undefined,
                    // Special options for localhost connectivity
                    enableUdpSrflx: true, // Enable UDP Server Reflexive candidates
                    iceTransportPolicy: 'all'
                  };
                  
                  console.log(`[PROTOO-WS] Creating transport for peer ${peerId} (producing: ${producing}, consuming: ${consuming})`);
                  const transport = await mediasoupRouter.createWebRtcTransport(webRtcTransportOptions);
                  peerData.transports.set(transport.id, transport);
                  
                  transport.on('dtlsstatechange', (dtlsState) => {
                    if (dtlsState === 'closed') {
                      console.log(`[PROTOO-WS] WebRtcTransport DTLS state closed: ${transport.id}`);
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
                  
                  console.log(`[PROTOO-WS] WebRtcTransport created successfully with ID ${transport.id}`);
                  console.log(`[PROTOO-WS] Sending transport info with ${transport.iceCandidates.length} ICE candidates`);
                  
                  // Send formatted response via helper
                  console.log(`[PROTOO-WS] Response data structure:`, JSON.stringify(responseData));
                  sendResponse(ws, msg.id, responseData);
                } catch (transportErr) {
                  console.error(`[PROTOO-WS] Error creating WebRtcTransport:`, transportErr);
                  sendResponse(ws, msg.id, { error: transportErr.message || 'Error creating transport' });
                }
                break;
                
              case 'connectWebRtcTransport':
                const { transportId, dtlsParameters } = msg.data;
                
                try {
                  console.log(`[PROTOO-WS] START connectWebRtcTransport for peer ${peerId}, transportId: ${transportId}`);
                  
                  const connectTransport = peerData.transports.get(transportId);
                  
                  if (!connectTransport) {
                    console.error(`[PROTOO-WS] Transport with id "${transportId}" not found for peer ${peerId}`);
                    sendResponse(ws, msg.id, { error: `Transport with id "${transportId}" not found` });
                    return;
                  }
                  
                  await connectTransport.connect({ dtlsParameters });
                  console.log(`[PROTOO-WS] WebRtcTransport connected successfully: ${transportId}`);
                  
                  // Acknowledge successful connection
                  sendResponse(ws, msg.id, {});
                  console.log(`[PROTOO-WS] Sent connectWebRtcTransport response for request ${msg.id}`);
                } catch (connectErr) {
                  console.error(`[PROTOO-WS] Error connecting WebRtcTransport:`, connectErr);
                  sendResponse(ws, msg.id, { error: connectErr.message || 'Error connecting transport' });
                }
                break;
                
              case 'produce':
                const { transportId: produceTransportId, kind, rtpParameters, appData } = msg.data;
                const produceTransport = peerData.transports.get(produceTransportId);
                
                if (!produceTransport) {
                  sendResponse(ws, msg.id, { error: `Transport with id "${produceTransportId}" not found for producing` });
                  return;
                }
                
                const producerInstance = await produceTransport.produce({ kind, rtpParameters, appData });
                peerData.producers.set(producerInstance.id, producerInstance);
                console.log(`[PROTOO-WS] Producer created: ${producerInstance.id} on transport ${produceTransportId}`);
                
                sendResponse(ws, msg.id, { id: producerInstance.id });
                
                // Notify other peers in the same room
                for (const [otherPeerId, otherPeerData] of roomData.peers.entries()) {
                  if (otherPeerId === peerId) continue;
                  
                  // Get the WebSocket for the other peer
                  const roomPeers = wsConnections.get(roomId);
                  if (roomPeers && roomPeers.has(otherPeerId)) {
                    const otherWs = roomPeers.get(otherPeerId).ws;
                    
                    try {
                      if (otherWs.readyState === WebSocketServer.OPEN) {
                        sendNotification(otherWs, 'newProducer', {
                          peerId,
                          producerId: producerInstance.id,
                          kind: producerInstance.kind,
                          appData: producerInstance.appData
                        });
                      }
                    } catch (notifyError) {
                      console.error(`[PROTOO-WS] Error notifying peer ${otherPeerId}:`, notifyError);
                    }
                  }
                }
                break;
                
              case 'consume':
                const { rtpCapabilities, producerId } = msg.data;
                
                // Find a suitable transport - ensure it's a consuming transport
                const consumerTransport = Array.from(peerData.transports.values())
                  .find(t => t.appData && t.appData.consuming === true);
                
                if (!consumerTransport) {
                  sendResponse(ws, msg.id, { error: `No suitable (consuming) transport found for peer ${peerId} to consume producer ${producerId}` });
                  return;
                }
                
                // Find the producer across all peers in the room
                let producerToConsume = null;
                for (const [otherPeerId, otherPeerData] of roomData.peers.entries()) {
                  const foundProducer = otherPeerData.producers.get(producerId);
                  if (foundProducer) {
                    producerToConsume = foundProducer;
                    console.log(`[PROTOO-WS] Found producer ${producerId} from peer ${otherPeerId}`);
                    break;
                  }
                }
                
                if (!producerToConsume) {
                  sendResponse(ws, msg.id, { error: `Producer ${producerId} not found` });
                  return;
                }
                
                if (!mediasoupRouter.canConsume({ producerId, rtpCapabilities })) {
                  sendResponse(ws, msg.id, { error: `Peer ${peerId} cannot consume producer ${producerId}` });
                  return;
                }
                
                const consumerInstance = await consumerTransport.consume({
                  producerId,
                  rtpCapabilities,
                  paused: true // Create consumers paused
                });
                
                peerData.consumers.set(consumerInstance.id, consumerInstance);
                console.log(`[PROTOO-WS] Consumer created: ${consumerInstance.id} for producer ${producerId} on transport ${consumerTransport.id}`);
                
                consumerInstance.on('transportclose', () => {
                  console.log(`[PROTOO-WS] Consumer ${consumerInstance.id} transport closed`);
                  consumerInstance.close();
                });
                
                consumerInstance.on('producerclose', () => {
                  console.log(`[PROTOO-WS] Consumer ${consumerInstance.id} producer closed`);
                  consumerInstance.close();
                });
                
                sendResponse(ws, msg.id, {
                  id: consumerInstance.id,
                  producerId: producerId,
                  kind: consumerInstance.kind,
                  rtpParameters: consumerInstance.rtpParameters
                });
                break;
                
              case 'resumeConsumer':
                const { consumerId } = msg.data;
                const consumerToResume = peerData.consumers.get(consumerId);
                
                if (!consumerToResume) {
                  sendResponse(ws, msg.id, { error: `Consumer with id "${consumerId}" not found` });
                  return;
                }
                
                await consumerToResume.resume();
                console.log(`[PROTOO-WS] Consumer resumed: ${consumerId}`);
                sendResponse(ws, msg.id, {});
                break;
                
              case 'ping':
                // Simple ping-pong for connection keep-alive and health monitoring
                console.log(`[PROTOO-WS] Received ping from peer ${peerId}`);
                
                // Update last activity timestamp
                const peerInfo = roomPeers.get(peerId);
                if (peerInfo) {
                  peerInfo.lastActivity = Date.now();
                }
                
                // Also update in roomData
                if (peerData) {
                  peerData.lastActivity = Date.now();
                }
                
                sendResponse(ws, msg.id, { timestamp: Date.now() });
                break;
                
              default:
                console.error(`[PROTOO-WS] Unknown request method "${msg.method}"`);
                sendResponse(ws, msg.id, { error: `Unknown request method "${msg.method}"` });
            }
          }
        } catch (err) {
          console.error(`[PROTOO-WS] Error processing message from peer ${peerId}:`, err);
          // If it was a request with ID, try to send error response
          if (message && typeof message === 'string') {
            try {
              const msg = JSON.parse(message);
              if (msg.id) {
                sendResponse(ws, msg.id, { error: err.message || 'Internal server error' });
              }
            } catch (e) {
              // Ignore parse errors here
            }
          }
        }
      });
      
      // Handle WebSocket closure
      ws.on('close', (code, reason) => {
        console.log(`[PROTOO-WS] Connection closed for peer ${peerId} in room ${roomId}: [${code}] ${reason || 'No reason'}`);
        
        // Clear ping interval
        clearInterval(pingInterval);
        
        // Remove from connections map
        const roomPeers = wsConnections.get(roomId);
        if (roomPeers) {
          roomPeers.delete(peerId);
          if (roomPeers.size === 0) {
            wsConnections.delete(roomId);
          }
        }
        
        // Clean up peer resources
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
            console.log(`[PROTOO-WS] Storing reconnection info for ${peerId}`);
            roomData.reconnectInfo = roomData.reconnectInfo || {};
            roomData.reconnectInfo[peerId] = {
              producerInfo,
              timestamp: Date.now()
            };
          }, 100);
        }
        
        // Clean up empty rooms
        if (roomData.peers.size === 0) {
          console.log(`[PROTOO-WS] Room ${roomId} is empty, closing mediasoupRouter`);
          mediasoupRouter.close();
          rooms.delete(roomId);
        }
      });
      
      // Handle WebSocket errors
      ws.on('error', (err) => {
        console.error(`[PROTOO-WS] WebSocket error for peer ${peerId}:`, err);
      });
      
      // Send initial success message
      const welcomeMsg = JSON.stringify({
        notification: true,
        method: 'welcomeNotification',
        data: { message: 'Welcome to protoo WebSocket server', timestamp: Date.now() }
      });
      
      ws.send(welcomeMsg);
    } catch (err) {
      console.error('[PROTOO-WS] Error handling WebSocket connection:', err);
      ws.close(1011, err.message);
    }
  });
  
  // Helper function to send a response
  function sendResponse(ws, requestId, data) {
    // Ready state 1 === OPEN (see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState)
    if (!ws || ws.readyState !== 1) return;

    try {
      // Build message using the canonical protoo response format
      const isError = data && data.error;

      const response = {
        response: true,
        id: requestId,
        ok: !isError
      };

      if (isError) {
        response.errorCode = 500;
        response.errorReason = data.error;
      } else {
        response.data = data;
      }

      const responseStr = JSON.stringify(response);
      console.log(`[PROTOO-WS] Sending response id=${requestId}, ok=${response.ok}, payloadKeys=${Object.keys(data || {}).join(',')}`);
      ws.send(responseStr);
    } catch (err) {
      console.error('[PROTOO-WS] Error sending response:', err);
    }
  }
  
  // Helper function to send a notification
  function sendNotification(ws, method, data) {
    // Ready state 1 === OPEN (see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState)
    if (!ws || ws.readyState !== 1) return;
    
    try {
      // Format notification according to protoo protocol
      const notification = {
        notification: true,
        method,
        data
      };
      
      const notificationStr = JSON.stringify(notification);
      console.log(`[PROTOO-WS] Sending notification: ${method}, data: ${JSON.stringify(data).substring(0, 100)}...`);
      ws.send(notificationStr);
    } catch (err) {
      console.error('[PROTOO-WS] Error sending notification:', err);
    }
  }

  console.log('[PROTOO-WS] WebSocket server initialized and listening on path /protoo');

  // Use our WebSocket server instead of protoo
  const protooWsServer = {
    // Dummy methods to satisfy existing code
    on: () => {}, // No-op for connectionrequest
  };

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