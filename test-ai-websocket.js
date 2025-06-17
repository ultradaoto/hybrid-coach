import WebSocket from 'ws';

const testSessionId = 'test-session-123';
const wsUrl = `ws://localhost:3000/ai-session/${testSessionId}`;

console.log(`Attempting to connect to: ${wsUrl}`);

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
    console.log('✅ WebSocket connection established');
    
    // Send init message
    ws.send(JSON.stringify({
        type: 'init_session',
        sessionId: testSessionId,
        roomId: 'test-room',
        userId: 'test-user',
        userRole: 'coach'
    }));
    
    // Test client speaking after 2 seconds
    setTimeout(() => {
        console.log('Sending client_speaking_detected message...');
        ws.send(JSON.stringify({
            type: 'client_speaking_detected',
            audioData: 'mock-audio-data'
        }));
    }, 2000);
});

ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('📩 Received message:', message);
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
    console.log(`WebSocket closed. Code: ${code}, Reason: ${reason}`);
});

// Keep the script running
setTimeout(() => {
    console.log('Test completed, closing connection...');
    ws.close();
    process.exit(0);
}, 10000);