import express from 'express';
import { WebSocketServer as Server } from 'ws';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Store active WebSocket connections by roomId
const roomConnections = new Map();

// Create WebSocket server when the main app is running
let wsServer = null;

// Initialize the WebSocket server
function initWebSocketRelay(server) {
  // Create a WebSocket server with noServer mode
  wsServer = new Server({ 
    noServer: true // Use noServer mode to manually handle upgrades
  });

  console.log('[WebSocket Relay] Server initialized with noServer mode');
  
  // Add upgrade handler to http server
  server.on('upgrade', (request, socket, head) => {
    // Only handle connections to /ws-relay path
    if (request.url.startsWith('/ws-relay')) {
      console.log(`[WebSocket Relay] Handling upgrade for: ${request.url}`);
      
      wsServer.handleUpgrade(request, socket, head, (ws) => {
        wsServer.emit('connection', ws, request);
      });
    }
  });

  wsServer.on('connection', (ws, req) => {
    console.log(`[WebSocket Relay] New raw connection: ${req.url}`);
    
    // Parse URL parameters - extract token and roomId
    try {
      const urlParams = new URL(`http://localhost${req.url}`).searchParams;
      const tokenFromUrl = urlParams.get('token');
      const roomIdFromUrl = urlParams.get('roomId');
      
      if (tokenFromUrl) {
        console.log('[WebSocket Relay] Connection includes authentication token');
      }
      
      // Only handle connections to our path
      if (!req.url.includes('/ws-relay')) {
        console.log(`[WebSocket Relay] Ignoring connection to different path: ${req.url}`);
        return; // Not for us, let other handlers deal with it
      }
      
      // Create client info object - define it in the scope of this connection handler
      const clientInfo = {
        roomId: roomIdFromUrl || null,
        peerId: null,
        userRole: null,
        id: uuidv4()
      };

      console.log(`[WebSocket Relay] New connection: ${clientInfo.id} for path: ${req.url}`);

      // Keep connection alive with pings
      const pingInterval = setInterval(() => {
        if (ws.readyState === 1) { // OPEN
          try {
            ws.ping();
          } catch (err) {
            console.error('[WebSocket Relay] Ping error:', err);
          }
        } else {
          clearInterval(pingInterval);
        }
      }, 10000);
      
      // Clear interval when connection closes
      ws.on('close', () => {
        clearInterval(pingInterval);
        console.log(`[WebSocket Relay] Connection closed: ${clientInfo.id}`);
        
        // Remove from room connections
        if (clientInfo.roomId && roomConnections.has(clientInfo.roomId)) {
          const roomClients = roomConnections.get(clientInfo.roomId);
          roomClients.delete(clientInfo.id);
          
          // Remove empty rooms
          if (roomClients.size === 0) {
            roomConnections.delete(clientInfo.roomId);
          } else {
            // Notify others about disconnect
            broadcast(clientInfo.roomId, {
              type: 'userLeft',
              peerId: clientInfo.peerId
            }, clientInfo.id);
          }
        }
      });

      // Send welcome message to confirm connection
      try {
        ws.send(JSON.stringify({
          type: 'welcome',
          message: 'Successfully connected to WebSocket relay'
        }));
      } catch (err) {
        console.error('[WebSocket Relay] Error sending welcome message:', err);
      }

      ws.on('message', (message) => {
        try {
          const msg = JSON.parse(message);
          console.log(`[WebSocket Relay] Received message type: ${msg.type} from ${clientInfo.id}`);
          
          // Handle join message
          if (msg.type === 'join') {
            clientInfo.roomId = msg.roomId || clientInfo.roomId; // Use roomId from message or URL
            clientInfo.peerId = msg.peerId;
            clientInfo.userRole = msg.userRole;

            // Add to room connections
            if (!roomConnections.has(clientInfo.roomId)) {
              roomConnections.set(clientInfo.roomId, new Map());
            }
            
            const roomClients = roomConnections.get(clientInfo.roomId);
            roomClients.set(clientInfo.id, ws);
            
            console.log(`[WebSocket Relay] Client ${clientInfo.id} joined room ${clientInfo.roomId} as ${clientInfo.userRole}`);
            
            // Notify others in the room
            broadcast(clientInfo.roomId, {
              type: 'userJoined',
              peerId: clientInfo.peerId,
              userRole: clientInfo.userRole
            }, clientInfo.id);
          }
          // Handle video frame relay
          else if (msg.type === 'videoFrame' && clientInfo.roomId) {
            // Forward to everyone in the same room except sender
            broadcast(clientInfo.roomId, {
              type: 'videoFrame',
              peerId: clientInfo.peerId,
              data: msg.data
            }, clientInfo.id);
          }
          // Handle chat messages
          else if (msg.type === 'chat' && clientInfo.roomId) {
            // Forward to everyone in the same room
            broadcast(clientInfo.roomId, {
              type: 'chat',
              peerId: clientInfo.peerId,
              text: msg.text
            }, clientInfo.id);
          }
          // Handle ping messages
          else if (msg.type === 'ping') {
            try {
              ws.send(JSON.stringify({
                type: 'pong',
                timestamp: Date.now()
              }));
            } catch (err) {
              console.error('[WebSocket Relay] Error sending pong:', err);
            }
          }
        } catch (err) {
          console.error('[WebSocket Relay] Error processing message:', err);
        }
      });
      
      ws.on('error', (err) => {
        console.error(`[WebSocket Relay] WebSocket error for client ${clientInfo.id}:`, err);
      });
    } catch (err) {
      console.error('[WebSocket Relay] Error processing connection:', err);
    }
  });

  // Log stats periodically
  setInterval(() => {
    console.log(`[WebSocket Relay] Active rooms: ${roomConnections.size}`);
    let totalClients = 0;
    roomConnections.forEach(clients => {
      totalClients += clients.size;
    });
    console.log(`[WebSocket Relay] Total connected clients: ${totalClients}`);
  }, 30000);
}

// Broadcast a message to all clients in a room except the sender
function broadcast(roomId, message, senderId) {
  if (!roomConnections.has(roomId)) return;
  
  const roomClients = roomConnections.get(roomId);
  const messageStr = JSON.stringify(message);
  
  roomClients.forEach((ws, id) => {
    if (id !== senderId && ws.readyState === 1) {
      try {
        ws.send(messageStr);
      } catch (err) {
        console.error(`[WebSocket Relay] Error broadcasting to client ${id}:`, err);
      }
    }
  });
}

// API endpoint for testing
router.get('/', (req, res) => {
  res.send('WebSocket relay status: ' + (wsServer ? 'running' : 'not initialized'));
});

// API endpoint that returns active rooms and clients
router.get('/status', (req, res) => {
  if (!wsServer) {
    return res.status(500).json({ error: 'WebSocket relay not initialized' });
  }
  
  const rooms = {};
  roomConnections.forEach((clients, roomId) => {
    rooms[roomId] = {
      clients: Array.from(clients.keys())
    };
  });
  
  res.json({
    status: 'ok',
    activeConnections: wsServer.clients.size,
    rooms
  });
});

export { router, initWebSocketRelay }; 