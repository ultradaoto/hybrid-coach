import { WebSocketServer } from 'ws';
import { createServer } from 'http';

// AI Session WebSocket handler
export function setupAISessionWebSocket(server) {
    const wss = new WebSocketServer({ 
        noServer: true // We'll handle the upgrade manually
    });

    // Track active AI sessions
    const activeSessions = new Map();
    
    function log(message) {
        console.log(`[AI-WS] ${new Date().toISOString()} - ${message}`);
    }

    // Handle WebSocket upgrade requests manually
    server.on('upgrade', (request, socket, head) => {
        const pathname = request.url;
        
        // Check if this is an AI session WebSocket request
        if (pathname.startsWith('/ai-session/')) {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        }
    });

    wss.on('connection', (ws, req) => {
        const url = new URL(req.url, 'http://localhost');
        const sessionId = url.pathname.split('/').pop();
        
        log(`New AI session connection: ${sessionId}`);
        
        ws.sessionId = sessionId;
        ws.isAlive = true;
        
        // Add to active sessions
        if (!activeSessions.has(sessionId)) {
            activeSessions.set(sessionId, {
                sessionId,
                participants: new Set(),
                aiState: 'listening',
                lastActivity: new Date(),
                transcript: [],
                coachId: null,
                clientId: null
            });
        }
        
        const session = activeSessions.get(sessionId);
        session.participants.add(ws);
        
        ws.on('pong', () => {
            ws.isAlive = true;
        });
        
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                await handleAIMessage(ws, message, session);
            } catch (error) {
                log(`Error handling message: ${error.message}`);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid message format'
                }));
            }
        });
        
        ws.on('close', () => {
            log(`AI session disconnected: ${sessionId}`);
            session.participants.delete(ws);
            
            // Clean up empty sessions
            if (session.participants.size === 0) {
                activeSessions.delete(sessionId);
                log(`Cleaned up session: ${sessionId}`);
            }
        });
        
        // Send initial connection confirmation
        ws.send(JSON.stringify({
            type: 'connection_established',
            sessionId: sessionId,
            timestamp: new Date().toISOString()
        }));
    });

    async function handleAIMessage(ws, message, session) {
        log(`Handling message type: ${message.type} for session: ${session.sessionId}`);
        
        switch (message.type) {
            case 'init_session':
                await initializeSession(ws, message, session);
                break;
                
            case 'client_speaking_detected':
                await handleClientSpeaking(message, session);
                break;
                
            case 'pause_ai':
                await pauseAI(message, session);
                break;
                
            case 'resume_ai':
                await resumeAI(message, session);
                break;
                
            case 'simulate_interaction':
                await simulateInteraction(message, session);
                break;
                
            case 'end_session':
                await endSession(message, session);
                break;
                
            default:
                log(`Unknown message type: ${message.type}`);
        }
    }

    async function initializeSession(ws, message, session) {
        log(`Initializing AI session: ${session.sessionId}`);
        
        // Store user info
        if (message.userRole === 'coach') {
            session.coachId = message.userId;
        } else {
            session.clientId = message.userId;
        }
        
        // Simulate AI session initialization
        setTimeout(() => {
            broadcastToSession(session, {
                type: 'session_ready',
                sessionId: session.sessionId,
                aiState: 'listening',
                timestamp: new Date().toISOString()
            });
            
            session.aiState = 'listening';
        }, 1000);
    }

    async function handleClientSpeaking(message, session) {
        if (session.aiState === 'paused') return;
        
        // Simulate speech-to-text processing
        setTimeout(() => {
            const mockTranscript = generateMockTranscript();
            
            session.transcript.push({
                speaker: 'client',
                text: mockTranscript,
                timestamp: new Date().toISOString()
            });
            
            broadcastToSession(session, {
                type: 'client_speaking',
                transcript: mockTranscript,
                confidence: 0.95,
                timestamp: new Date().toISOString()
            });
            
            // Simulate AI thinking and response
            setTimeout(() => {
                simulateAIResponse(session, mockTranscript);
            }, 1500);
            
        }, 500); // Simulate STT processing delay
    }

    async function simulateAIResponse(session, clientInput) {
        if (session.aiState === 'paused') return;
        
        session.aiState = 'thinking';
        
        // Broadcast AI thinking state
        broadcastToSession(session, {
            type: 'ai_thinking',
            preview: 'Processing your question...',
            timestamp: new Date().toISOString()
        });
        
        // Simulate OpenAI processing time
        setTimeout(() => {
            const aiResponse = generateMockAIResponse(clientInput);
            
            session.transcript.push({
                speaker: 'ai',
                text: aiResponse,
                timestamp: new Date().toISOString()
            });
            
            session.aiState = 'speaking';
            
            broadcastToSession(session, {
                type: 'ai_speaking',
                text: aiResponse,
                confidence: 0.98,
                timestamp: new Date().toISOString()
            });
            
            // After AI finishes speaking, return to listening
            setTimeout(() => {
                session.aiState = 'listening';
                broadcastToSession(session, {
                    type: 'ai_finished_speaking',
                    nextState: 'listening',
                    timestamp: new Date().toISOString()
                });
            }, aiResponse.length * 50); // Simulate speaking duration
            
        }, 2000); // Simulate AI processing time
    }

    async function pauseAI(message, session) {
        log(`Coach pausing AI for session: ${session.sessionId}`);
        
        session.aiState = 'paused';
        session.pausedBy = message.coachId;
        session.pausedAt = new Date().toISOString();
        
        broadcastToSession(session, {
            type: 'ai_paused',
            pausedBy: message.coachId,
            timestamp: session.pausedAt
        });
    }

    async function resumeAI(message, session) {
        log(`Coach resuming AI for session: ${session.sessionId}`);
        
        session.aiState = 'listening';
        session.resumedBy = message.coachId;
        session.resumedAt = new Date().toISOString();
        
        broadcastToSession(session, {
            type: 'ai_resumed',
            resumedBy: message.coachId,
            timestamp: session.resumedAt
        });
    }

    async function simulateInteraction(message, session) {
        log(`Simulating interaction: ${message.speaker} - ${message.text}`);
        
        if (message.speaker === 'client') {
            broadcastToSession(session, {
                type: 'client_speaking',
                transcript: message.text,
                confidence: 1.0,
                timestamp: new Date().toISOString()
            });
            
            setTimeout(() => {
                simulateAIResponse(session, message.text);
            }, 1000);
        }
    }

    async function endSession(message, session) {
        log(`Ending AI session: ${session.sessionId}`);
        
        broadcastToSession(session, {
            type: 'session_ended',
            duration: Date.now() - new Date(session.lastActivity).getTime(),
            transcript: session.transcript,
            timestamp: new Date().toISOString()
        });
        
        // Close all connections for this session
        session.participants.forEach(ws => {
            if (ws.readyState === ws.OPEN) {
                ws.close();
            }
        });
        
        activeSessions.delete(session.sessionId);
    }

    function broadcastToSession(session, data) {
        const message = JSON.stringify(data);
        
        session.participants.forEach(ws => {
            if (ws.readyState === ws.OPEN) {
                ws.send(message);
            }
        });
    }

    function generateMockTranscript() {
        const phrases = [
            "I'm having trouble with my computer setup",
            "Can you help me with this technical issue?",
            "My email isn't working properly",
            "I need assistance with software installation",
            "The application keeps crashing",
            "How do I backup my files?",
            "I'm not sure how to fix this problem",
            "Can you walk me through the steps?",
            "This is really frustrating",
            "I think I need to update something"
        ];
        
        return phrases[Math.floor(Math.random() * phrases.length)];
    }

    function generateMockAIResponse(clientInput) {
        const responses = [
            "I understand your concern. Let me help you troubleshoot this step by step.",
            "That's a common issue. First, let's check if your software is up to date.",
            "I can definitely help with that. Have you tried restarting the application?",
            "Let's work through this together. Can you tell me what error message you're seeing?",
            "That sounds frustrating. Let's start with some basic troubleshooting steps.",
            "I've seen this before. There are a few things we can try to resolve this.",
            "Great question! Let me walk you through the solution.",
            "Before we proceed, can you check if you have the latest version installed?",
            "Let's approach this systematically. First, let's verify your settings.",
            "I'll guide you through the process. Don't worry, we'll get this sorted out."
        ];
        
        return responses[Math.floor(Math.random() * responses.length)];
    }

    // Heartbeat to keep connections alive
    const heartbeat = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (!ws.isAlive) {
                ws.terminate();
                return;
            }
            
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    // Cleanup on server shutdown
    process.on('SIGINT', () => {
        clearInterval(heartbeat);
        wss.close();
    });

    log('AI Session WebSocket server initialized');
    
    return wss;
}