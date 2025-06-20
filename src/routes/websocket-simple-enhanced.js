import { WebSocketServer } from 'ws';
import { orbManager } from '../services/OrbManager.js';

const rooms = new Map(); // roomId -> Map<userId, participant>

/**
 * Enhanced WebSocket server for 3-party mesh network
 * 
 * DEBUGGING MODE ACTIVE:
 * - Currently blocks Client connections to isolate Coach ↔ AI Orb connection issues
 * - Only allows Coach ↔ AI Orb connections for debugging
 * - Client connections will be blocked with 'connection-blocked' message
 * 
 * Original support: Coach ↔ Client ↔ AI Orb tri-party connections
 */
export function initEnhancedWebSocket(httpServer) {
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
        console.log(`[EnhancedWS] 🔗 New connection for room ${roomId} from ${request.socket.remoteAddress}`);
        
        let currentParticipant = null;
        let pingInterval = null;

        // Get or create room
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Map());
        }
        const room = rooms.get(roomId);

        // Setup ping/pong for connection health
        const setupPingPong = () => {
            ws.isAlive = true;
            
            ws.on('pong', () => {
                ws.isAlive = true;
            });
            
            pingInterval = setInterval(() => {
                if (!ws.isAlive) {
                    console.log(`[EnhancedWS] Connection timeout for ${currentParticipant?.userId}`);
                    return ws.terminate();
                }
                
                ws.isAlive = false;
                ws.ping();
            }, 30000);
        };

        setupPingPong();

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                
                switch (data.type) {
                    case 'join':
                        currentParticipant = handleJoin(ws, room, roomId, data);
                        // If join was blocked (debugging mode), terminate connection
                        if (currentParticipant === null) {
                            return; // Connection already closed in handleJoin
                        }
                        break;
                        
                    case 'offer':
                    case 'answer':
                    case 'ice-candidate':
                        handleSignaling(room, currentParticipant, data);
                        break;
                        
                    case 'leave':
                        handleLeave(room, roomId, currentParticipant);
                        break;
                        
                    case 'ping':
                        ws.send(JSON.stringify({ type: 'pong' }));
                        break;
                        
                    case 'ai_status':
                        // Forward AI status to other participants
                        broadcastToOthers(room, currentParticipant, data);
                        break;
                        
                    case 'client_signal':
                        // Handle client signals (hand raising, etc.) and forward to coach
                        console.log(`[EnhancedWS] Client signal: ${data.action} from ${currentParticipant?.userName}`);
                        broadcastToOthers(room, currentParticipant, data);
                        break;
                        
                    case 'ai_control':
                        // Handle AI control commands from coach and forward to AI orb
                        console.log(`[EnhancedWS] AI control: ${data.action} from ${currentParticipant?.userName}`);
                        broadcastToOthers(room, currentParticipant, data);
                        break;
                        
                    case 'orb_heartbeat':
                        // Handle AI orb heartbeat messages
                        console.log(`[EnhancedWS] AI orb heartbeat received for room ${roomId}`);
                        // Forward heartbeat to OrbManager via process message (if available)
                        if (currentParticipant?.participantType === 'ai') {
                            // This heartbeat will be handled by OrbManager through the process channel
                        }
                        break;
                        
                    case 'ai-orb-shutdown':
                        // Handle AI orb shutdown notifications
                        console.log(`[EnhancedWS] AI orb shutdown notification for session ${data.sessionId}`);
                        // Remove AI participant from room when it shuts down
                        const aiParticipant = Array.from(room.values()).find(p => p.participantType === 'ai');
                        if (aiParticipant) {
                            handleLeave(room, roomId, aiParticipant);
                        }
                        break;
                        
                    default:
                        console.log(`[EnhancedWS] Unhandled message type: ${data.type}`);
                }
            } catch (err) {
                console.error('[EnhancedWS] Message error:', err);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid message format'
                }));
            }
        });

        ws.on('close', () => {
            if (pingInterval) clearInterval(pingInterval);
            handleLeave(room, roomId, currentParticipant);
        });

        ws.on('error', (error) => {
            console.error('[EnhancedWS] WebSocket error:', error);
            if (pingInterval) clearInterval(pingInterval);
            handleLeave(room, roomId, currentParticipant);
        });
    });

    /**
     * Handle participant joining room
     */
    function handleJoin(ws, room, roomId, data) {
        console.log(`[EnhancedWS] 👤 ${data.userRole} ${data.userName} (${data.participantType}) joining room ${roomId}`);
        
        
        // Check if this user is already in the room (reconnection)
        const existingUser = room.get(data.userId);
        if (existingUser) {
            console.log(`[EnhancedWS] User ${data.userName} reconnecting to room ${roomId}`);
            existingUser.ws = ws; // Update WebSocket connection
        }
        
        // Create participant object
        const participant = {
            ws,
            userId: data.userId,
            userName: data.userName,
            userRole: data.userRole,
            participantType: data.participantType || 'human'
        };
        
        room.set(data.userId, participant);
        
        // Get existing participants (excluding self)
        const existingParticipants = Array.from(room.values())
            .filter(p => p.userId !== data.userId)
            .map(p => ({
                userId: p.userId,
                userName: p.userName,
                userRole: p.userRole,
                participantType: p.participantType
            }));

        // Send peer discovery to new participant
        ws.send(JSON.stringify({
            type: 'peer-discovery',
            peers: existingParticipants,
            roomId
        }));

        // Notify existing participants about new user
        room.forEach(p => {
            if (p.userId !== data.userId && p.ws.readyState === ws.OPEN) {
                // DEBUGGING: Only create offers for Coach ↔ AI Orb connections
                const shouldCreateOfferForPair = shouldCreateOfferDebugMode(p, participant);
                
                p.ws.send(JSON.stringify({
                    type: 'user-joined',
                    userId: data.userId,
                    userName: data.userName,
                    userRole: data.userRole,
                    participantType: data.participantType,
                    shouldCreateOffer: shouldCreateOfferForPair
                }));
                
                if (shouldCreateOfferForPair) {
                    console.log(`[EnhancedWS] 🤝 DEBUGGING: Creating offer between ${p.userName}(${p.userRole}/${p.participantType}) and ${participant.userName}(${participant.userRole}/${participant.participantType})`);
                } else {
                    console.log(`[EnhancedWS] ⏸️  DEBUGGING: Skipping offer between ${p.userName}(${p.userRole}/${p.participantType}) and ${participant.userName}(${participant.userRole}/${participant.participantType})`);
                }
            }
        });

        // Track participant in OrbManager (for human participants)
        if (data.participantType !== 'ai') {
            orbManager.trackParticipantJoin(roomId, data.userId, data.userRole);
        }

        console.log(`[EnhancedWS] 📊 Room ${roomId} now has ${room.size} participants`);
        logRoomState(roomId, room);
        
        return participant;
    }

    /**
     * Log current room state for debugging
     */
    function logRoomState(roomId, room) {
        const participants = Array.from(room.values()).map(p => 
            `${p.userName}(${p.userRole}/${p.participantType})`
        ).join(', ');
        console.log(`[EnhancedWS] 📋 Room ${roomId} participants: [${participants}]`);
    }

    /**
     * Determine who should create WebRTC offer
     * Uses deterministic logic to avoid offer collisions
     */
    function shouldCreateOffer(existing, joining) {
        // AI always receives offers (never creates them)
        if (joining.participantType === 'ai') return true;
        if (existing.participantType === 'ai') return false;
        
        // Coach creates offer to client
        if (existing.userRole === 'coach' && joining.userRole === 'client') return true;
        if (existing.userRole === 'client' && joining.userRole === 'coach') return false;
        
        // For same roles or edge cases, use ID comparison
        return existing.userId < joining.userId;
    }

    /**
     * DEBUGGING MODE: Only allow Coach ↔ AI Orb connections
     * Temporarily bypass Client connections to isolate Coach ↔ AI Orb issues
     */
    function shouldCreateOfferDebugMode(existing, joining) {
        // Block any connection involving a client
        if (existing.userRole === 'client' || joining.userRole === 'client') {
            console.log(`[EnhancedWS] 🚫 DEBUGGING: Blocking connection with Client participant`);
            return false;
        }
        
        // Only allow Coach ↔ AI Orb connections
        const isCoachToAI = (existing.userRole === 'coach' && joining.participantType === 'ai') ||
                           (existing.participantType === 'ai' && joining.userRole === 'coach');
        
        if (!isCoachToAI) {
            console.log(`[EnhancedWS] 🚫 DEBUGGING: Not a Coach ↔ AI Orb connection, skipping`);
            return false;
        }
        
        // Use original logic for Coach ↔ AI Orb connections
        // AI always receives offers (never creates them)
        if (joining.participantType === 'ai') return true;
        if (existing.participantType === 'ai') return false;
        
        // This shouldn't happen in Coach ↔ AI Orb scenario, but fallback
        return existing.userId < joining.userId;
    }

    /**
     * Handle WebRTC signaling messages
     */
    function handleSignaling(room, sender, data) {
        if (!sender) {
            console.error('[EnhancedWS] Signaling from unknown sender');
            return;
        }

        const messageType = data.type;
        const targetId = data.toId || data.targetId;
        
        // Rate-limited logging for ICE candidates (max 1 per second per connection)
        if (messageType === 'ice-candidate') {
            const iceKey = `${sender.userId}->${targetId}`;
            const now = Date.now();
            if (!global.lastIceLog) global.lastIceLog = new Map();
            
            if (!global.lastIceLog.has(iceKey) || now - global.lastIceLog.get(iceKey) > 1000) {
                console.log(`[EnhancedWS] ${messageType} from ${sender.userId} to ${targetId || 'all'}`);
                global.lastIceLog.set(iceKey, now);
            }
        } else {
            // Log all non-ICE messages normally
            console.log(`[EnhancedWS] ${messageType} from ${sender.userId} to ${targetId || 'all'}`);
        }
        
        if (targetId) {
            // Targeted signaling for 3-way mesh
            const target = room.get(targetId);
            if (target && target.ws.readyState === target.ws.OPEN) {
                target.ws.send(JSON.stringify({
                    ...data,
                    fromId: sender.userId
                }));
            } else {
                console.warn(`[EnhancedWS] Target ${targetId} not found or disconnected`);
            }
        } else {
            // Broadcast to all other participants (legacy support)
            let relayCount = 0;
            room.forEach(participant => {
                if (participant.userId !== sender.userId && 
                    participant.ws.readyState === participant.ws.OPEN) {
                    participant.ws.send(JSON.stringify({
                        ...data,
                        fromId: sender.userId
                    }));
                    relayCount++;
                }
            });
            
            if (relayCount === 0) {
                console.warn(`[EnhancedWS] No recipients for ${messageType} from ${sender.userId}`);
            }
        }
    }

    /**
     * Handle participant leaving room
     */
    function handleLeave(room, roomId, participant) {
        if (!participant) return;
        
        room.delete(participant.userId);
        
        // Notify other participants
        room.forEach(p => {
            if (p.ws.readyState === p.ws.OPEN) {
                p.ws.send(JSON.stringify({
                    type: 'user-left',
                    userId: participant.userId,
                    userName: participant.userName,
                    userRole: participant.userRole,
                    participantType: participant.participantType
                }));
            }
        });
        
        // Track in OrbManager (for human participants)
        if (participant.participantType !== 'ai') {
            orbManager.trackParticipantLeave(roomId, participant.userId);
        }
        
        console.log(`[EnhancedWS] ${participant.userRole} ${participant.userName} left room ${roomId}. Remaining: ${room.size}`);
        
        // Clean up empty rooms
        if (room.size === 0) {
            rooms.delete(roomId);
            console.log(`[EnhancedWS] Room ${roomId} deleted (empty)`);
        } else {
            logRoomState(roomId, room);
        }
    }

    /**
     * Broadcast message to all participants except sender
     */
    function broadcastToOthers(room, sender, message) {
        room.forEach(participant => {
            if (participant.userId !== sender?.userId && 
                participant.ws.readyState === participant.ws.OPEN) {
                participant.ws.send(JSON.stringify(message));
            }
        });
    }

    /**
     * Log current room state for debugging
     */
    function logRoomState(roomId, room) {
        const participants = Array.from(room.values()).map(p => ({
            userId: p.userId,
            role: p.userRole,
            type: p.participantType
        }));
        
        console.log(`[EnhancedWS] Room ${roomId} state:`, JSON.stringify(participants));
    }

    // Periodic cleanup of disconnected clients
    setInterval(() => {
        rooms.forEach((room, roomId) => {
            const disconnected = [];
            
            // Find disconnected participants
            room.forEach((participant, userId) => {
                if (participant.ws.readyState !== participant.ws.OPEN) {
                    disconnected.push(participant);
                }
            });
            
            // Remove disconnected participants
            disconnected.forEach(participant => {
                console.log(`[EnhancedWS] Cleaning up disconnected ${participant.userRole} from room ${roomId}`);
                handleLeave(room, roomId, participant);
            });
            
            // Remove empty rooms
            if (room.size === 0) {
                rooms.delete(roomId);
                console.log(`[EnhancedWS] Room ${roomId} removed (empty)`);
            }
        });
    }, 30000); // Every 30 seconds

    // Admin endpoints for monitoring
    const getActiveRooms = () => {
        const roomsInfo = {};
        rooms.forEach((room, roomId) => {
            roomsInfo[roomId] = {
                participants: room.size,
                details: Array.from(room.values()).map(p => ({
                    userId: p.userId,
                    role: p.userRole,
                    type: p.participantType
                }))
            };
        });
        return roomsInfo;
    };

    // Attach to server for admin access
    if (httpServer.wsInfo) {
        httpServer.wsInfo.enhanced = { getActiveRooms };
    }

    console.log('[EnhancedWS] Enhanced WebSocket server initialized for 3-party mesh');
}

/**
 * Message Protocol Documentation:
 * 
 * Join:
 * {
 *   type: 'join',
 *   roomId: string,
 *   userId: string,
 *   userName: string,
 *   userRole: 'coach' | 'client' | 'ai',
 *   participantType: 'human' | 'ai'
 * }
 * 
 * Peer Discovery (sent to joining participant):
 * {
 *   type: 'peer-discovery',
 *   peers: Array<{userId, userName, userRole, participantType}>,
 *   roomId: string
 * }
 * 
 * User Joined (sent to existing participants):
 * {
 *   type: 'user-joined',
 *   userId: string,
 *   userName: string,
 *   userRole: string,
 *   participantType: string,
 *   shouldCreateOffer: boolean
 * }
 * 
 * Targeted Signaling:
 * {
 *   type: 'offer' | 'answer' | 'ice-candidate',
 *   fromId: string,
 *   toId: string,
 *   offer | answer | candidate: RTCSessionDescription | RTCIceCandidate
 * }
 * 
 * AI Status:
 * {
 *   type: 'ai_status',
 *   status: 'ready' | 'speaking' | 'listening' | 'processing',
 *   sessionId: string
 * }
 */