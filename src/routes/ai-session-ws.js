import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

// AI Session WebSocket handler - proxy to GPU server
export function setupAISessionWebSocket(server) {
    const wss = new WebSocketServer({ 
        noServer: true // We'll handle the upgrade manually
    });
    
    const GPU_WS_URL = process.env.GPU_WS_URL || 'ws://localhost:8001';
    
    function log(message) {
        console.log(`[AI-WS] ${new Date().toISOString()} - ${message}`);
    }
    
    log(`AI WebSocket proxy initialized. GPU_WS_URL: ${GPU_WS_URL}`);

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

    wss.on('connection', (clientWs, req) => {
        const url = new URL(req.url, 'http://localhost');
        const sessionId = url.pathname.split('/').pop();
        
        log(`Proxying AI session to GPU server: ${sessionId}`);
        
        // Create connection to GPU server with options
        const gpuWsUrl = `${GPU_WS_URL}/ai-session/${sessionId}`;
        log(`Attempting to connect to GPU server: ${gpuWsUrl}`);
        const gpuWs = new WebSocket(gpuWsUrl, {
            handshakeTimeout: 30000, // 30 seconds for initial connection
            perMessageDeflate: false
        });
        
        // Track connection state
        let gpuConnected = false;
        let keepAliveInterval = null;
        
        // Connection timeout (initial connection only)
        const connectionTimeout = setTimeout(() => {
            if (!gpuConnected) {
                log(`❌ GPU connection timeout after 30 seconds for session: ${sessionId}`);
                gpuWs.close();
            }
        }, 30000);
        
        // Proxy messages from client to GPU server
        clientWs.on('message', (data) => {
            if (gpuWs.readyState === WebSocket.OPEN && gpuConnected) {
                log(`Proxying message to GPU: ${data.toString().substring(0, 100)}...`);
                gpuWs.send(data);
            } else {
                log(`Cannot proxy message - GPU state: ${gpuWs.readyState}, connected: ${gpuConnected}`);
                // Send error back to client
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({
                        type: 'error',
                        message: 'GPU server not ready'
                    }));
                }
            }
        });
        
        // Proxy messages from GPU server to client
        gpuWs.on('message', (data) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                log(`Proxying message from GPU: ${data.toString().substring(0, 100)}...`);
                clientWs.send(data);
            }
        });
        
        // Handle GPU connection events
        gpuWs.on('open', () => {
            log(`✅ Successfully connected to GPU server for session: ${sessionId}`);
            gpuConnected = true;
            clearTimeout(connectionTimeout);
            
            // Start keepalive pings every 30 seconds
            keepAliveInterval = setInterval(() => {
                if (gpuWs.readyState === WebSocket.OPEN) {
                    gpuWs.ping();
                    log(`Sent keepalive ping to GPU server for session: ${sessionId}`);
                }
            }, 30000);
        });
        
        // Handle pong responses from GPU server
        gpuWs.on('pong', () => {
            log(`Received pong from GPU server for session: ${sessionId}`);
        });
        
        gpuWs.on('error', (error) => {
            log(`❌ GPU connection error for session ${sessionId}: ${error.message}`);
            log(`GPU connection code: ${error.code}, target: ${gpuWsUrl}`);
            gpuConnected = false;
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                    type: 'error',
                    message: `GPU server connection failed: ${error.message}`
                }));
            }
        });
        
        gpuWs.on('close', (code, reason) => {
            log(`GPU connection closed for session: ${sessionId}, code: ${code}, reason: ${reason}`);
            gpuConnected = false;
            
            // Clear keepalive interval
            if (keepAliveInterval) {
                clearInterval(keepAliveInterval);
                keepAliveInterval = null;
            }
            
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close();
            }
        });
        
        // Handle client disconnection
        clientWs.on('close', () => {
            log(`Client disconnected from session: ${sessionId}`);
            
            // Clear keepalive interval
            if (keepAliveInterval) {
                clearInterval(keepAliveInterval);
                keepAliveInterval = null;
            }
            
            if (gpuWs.readyState === WebSocket.OPEN) {
                gpuWs.close();
            }
        });
        
        clientWs.on('error', (error) => {
            log(`Client connection error for session ${sessionId}: ${error.message}`);
            if (gpuWs.readyState === WebSocket.OPEN) {
                gpuWs.close();
            }
        });
    });

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

    log('AI Session WebSocket proxy initialized - forwarding to GPU server');
    
    return wss;
}