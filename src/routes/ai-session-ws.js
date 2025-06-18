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
    log(`Environment check - NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
    log(`Host check - process will connect to: ${GPU_WS_URL}`);

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
        
        // Initialize client heartbeat state
        clientWs.isAlive = true;
        
        // Create connection to GPU server with options
        const gpuWsUrl = `${GPU_WS_URL}/ai-session/${sessionId}`;
        log(`Attempting to connect to GPU server: ${gpuWsUrl}`);
        const gpuWs = new WebSocket(gpuWsUrl, {
            handshakeTimeout: 30000, // 30 seconds for initial connection
            perMessageDeflate: false
        });
        
        // Track connection state
        let gpuConnected = false;
        
        // Connection timeout (initial connection only)
        const connectionTimeout = setTimeout(() => {
            if (!gpuConnected) {
                log(`❌ GPU connection timeout after 30 seconds for session: ${sessionId}`);
                log(`❌ GPU server might not be running on ${GPU_WS_URL}`);
                gpuWs.close();
            }
        }, 30000);
        
        // Proxy messages from client to GPU server
        clientWs.on('message', (data) => {
            if (gpuWs.readyState === WebSocket.OPEN && gpuConnected) {
                const dataStr = data.toString();
                if (dataStr.includes('tts_keepalive')) {
                    log(`📡 Proxying TTS keepalive to GPU`);
                } else {
                    log(`Proxying message to GPU: ${dataStr.substring(0, 100)}...`);
                }
                gpuWs.send(data);
            } else {
                log(`❌ Cannot proxy message - GPU state: ${gpuWs.readyState}, connected: ${gpuConnected}`);
                log(`❌ Message attempted: ${data.toString().substring(0, 50)}...`);
                
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
                const dataStr = data.toString();
                const isLargeMessage = dataStr.length > 10000;
                
                if (isLargeMessage) {
                    // Likely audio data - log differently
                    log(`Proxying LARGE message from GPU: ${dataStr.length} chars (likely audio)`);
                    try {
                        const parsed = JSON.parse(dataStr);
                        if (parsed.type === 'ai_audio_data') {
                            log(`🔊 Proxying ElevenLabs audio: ${parsed.audioData?.length || 0} base64 chars`);
                        }
                    } catch (e) {
                        log(`Large message parse failed, sending raw data`);
                    }
                } else {
                    log(`Proxying message from GPU: ${dataStr.substring(0, 100)}...`);
                }
                
                clientWs.send(data);
            } else {
                log(`❌ Cannot proxy GPU message - client WebSocket not open: ${clientWs.readyState}`);
            }
        });
        
        // Handle GPU connection events
        gpuWs.on('open', () => {
            log(`✅ Successfully connected to GPU server for session: ${sessionId}`);
            gpuConnected = true;
            clearTimeout(connectionTimeout);
            
            // No proxy-level keepalive - application handles its own ping/pong system
        });
        
        // GPU pong responses handled by application-level ping/pong system
        
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
            log(`❌ GPU connection closed for session: ${sessionId}, code: ${code}, reason: ${reason}`);
            log(`❌ GPU close event - was connected: ${gpuConnected}, client state: ${clientWs.readyState}`);
            gpuConnected = false;
            
            // Notify client about GPU disconnection
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                    type: 'websocket_disconnected',
                    reason: `GPU disconnected: code ${code}`,
                    timestamp: new Date().toISOString()
                }));
                
                // Don't close client immediately - let it attempt reconnection
                setTimeout(() => {
                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.close();
                    }
                }, 5000); // 5 second grace period
            }
        });
        
        // Client pong responses handled by application-level ping/pong system
        
        // Handle client disconnection
        clientWs.on('close', () => {
            log(`Client disconnected from session: ${sessionId}`);
            
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

    // Disabled proxy-level heartbeat to avoid conflicts with application-level ping/pong
    // The application handles keepalive with its own ping/pong system
    
    // Cleanup on server shutdown
    process.on('SIGINT', () => {
        wss.close();
    });

    log('AI Session WebSocket proxy initialized - forwarding to GPU server');
    
    return wss;
}