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
            // Check if this user is already in the room
            const existingUser = Array.from(room).find(u => u.userId === data.userId);
            if (existingUser && existingUser.ws !== ws) {
              console.log(`[SimpleWS] User ${data.userName} already in room, removing old connection`);
              room.delete(existingUser);
            }
            
            currentUser = {
              ws,
              userId: data.userId,
              userName: data.userName
            };
            
            room.add(currentUser);
            
            // Get all other users in room
            const otherUsers = Array.from(room).filter(u => u.userId !== data.userId);
            
            if (otherUsers.length > 0) {
              // New user joins existing room
              const firstOtherUser = otherUsers[0];
              
              console.log(`[SimpleWS] ${data.userName} joining room with ${firstOtherUser.userName}`);
              
              // Tell new user about existing user - they should create offer
              ws.send(JSON.stringify({
                type: 'user-joined',
                userId: firstOtherUser.userId,
                userName: firstOtherUser.userName,
                shouldCreateOffer: true
              }));
              
              // Tell existing user about new user - they should wait for offer
              if (firstOtherUser.ws.readyState === ws.OPEN) {
                firstOtherUser.ws.send(JSON.stringify({
                  type: 'user-joined',
                  userId: data.userId,
                  userName: data.userName,
                  shouldCreateOffer: false
                }));
              }
            } else {
              console.log(`[SimpleWS] ${data.userName} is first in room ${roomId}`);
            }
            
            console.log(`[SimpleWS] Room ${roomId} now has ${room.size} user(s)`);
            break;
            
          case 'offer':
          case 'answer':
          case 'ice-candidate':
            // Relay to other user in room
            console.log(`[SimpleWS] Relaying ${data.type} in room ${roomId}`);
            let relayCount = 0;
            room.forEach(user => {
              if (user.ws !== ws && user.ws.readyState === ws.OPEN) {
                console.log(`[SimpleWS] Sending ${data.type} to ${user.userName}`);
                user.ws.send(message);
                relayCount++;
              }
            });
            
            if (relayCount === 0) {
              console.log(`[SimpleWS] WARNING: No other users to relay ${data.type} to!`);
              console.log(`[SimpleWS] Room ${roomId} has ${room.size} users`);
              room.forEach(user => {
                console.log(`[SimpleWS]   - ${user.userName} (${user.userId}) - same as sender: ${user.ws === ws}`);
              });
            }
            break;
            
          case 'leave':
            handleDisconnect();
            break;
            
          case 'ping':
            // Just acknowledge the ping to keep connection alive
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'pong' }));
            }
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