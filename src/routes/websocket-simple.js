import { WebSocketServer } from 'ws';

const rooms = new Map(); // roomId -> Set of { ws, userId, userName }

export function initSimpleWebSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests for /ws-simple/:roomId
  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathParts = url.pathname.split('/');
    
    if (pathParts[1] === 'ws-simple' && pathParts[2]) {
      const roomId = pathParts[2];
      
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, roomId);
      });
    }
  });

  wss.on('connection', (ws, request, roomId) => {
    console.log(`[SimpleWS] New connection for room ${roomId}`);
    
    let currentUser = null;

    // Get or create room
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    const room = rooms.get(roomId);

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        
        switch (data.type) {
          case 'join':
            currentUser = {
              ws,
              userId: data.userId,
              userName: data.userName
            };
            
            // Check if room already has someone
            const existingUsers = Array.from(room);
            const otherUser = existingUsers.find(u => u.userId !== data.userId);
            
            room.add(currentUser);
            
            // Notify the new user about existing users
            if (otherUser) {
              ws.send(JSON.stringify({
                type: 'user-joined',
                userId: otherUser.userId,
                userName: otherUser.userName,
                shouldCreateOffer: true
              }));
              
              // Notify existing user about new user
              otherUser.ws.send(JSON.stringify({
                type: 'user-joined',
                userId: data.userId,
                userName: data.userName,
                shouldCreateOffer: false
              }));
            }
            
            console.log(`[SimpleWS] ${data.userName} joined room ${roomId}. Room size: ${room.size}`);
            break;
            
          case 'offer':
          case 'answer':
          case 'ice-candidate':
            // Relay to other user in room
            room.forEach(user => {
              if (user.ws !== ws && user.ws.readyState === ws.OPEN) {
                user.ws.send(message);
              }
            });
            break;
            
          case 'leave':
            handleDisconnect();
            break;
        }
      } catch (err) {
        console.error('[SimpleWS] Message error:', err);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    ws.on('close', () => {
      handleDisconnect();
    });

    ws.on('error', (error) => {
      console.error('[SimpleWS] WebSocket error:', error);
      handleDisconnect();
    });

    function handleDisconnect() {
      if (currentUser) {
        room.delete(currentUser);
        
        // Notify others in room
        room.forEach(user => {
          if (user.ws.readyState === ws.OPEN) {
            user.ws.send(JSON.stringify({
              type: 'user-left',
              userId: currentUser.userId,
              userName: currentUser.userName
            }));
          }
        });
        
        console.log(`[SimpleWS] ${currentUser.userName} left room ${roomId}. Room size: ${room.size}`);
        
        // Clean up empty rooms
        if (room.size === 0) {
          rooms.delete(roomId);
          console.log(`[SimpleWS] Room ${roomId} deleted (empty)`);
        }
      }
    }
  });

  console.log('[SimpleWS] Simple WebSocket server initialized');
  
  // Periodic cleanup of empty rooms
  setInterval(() => {
    rooms.forEach((room, roomId) => {
      // Remove disconnected clients
      room.forEach(user => {
        if (user.ws.readyState !== user.ws.OPEN) {
          room.delete(user);
        }
      });
      
      // Remove empty rooms
      if (room.size === 0) {
        rooms.delete(roomId);
      }
    });
  }, 30000); // Every 30 seconds
} 