#!/usr/bin/env node

import WebSocket from 'ws';

const testSessionId = 'test-multi-response-123';
const wsUrl = `ws://localhost:3000/ai-session/${testSessionId}`;

console.log(`Testing multiple AI responses...`);
console.log(`Connecting to: ${wsUrl}`);

const ws = new WebSocket(wsUrl);
let responseCount = 0;
let interactionCount = 0;

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
});

ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log(`\n📩 [${new Date().toISOString()}] Received:`, message.type);
    
    switch (message.type) {
        case 'session_ready':
            console.log('   ✅ Session initialized, sending first interaction...');
            sendInteraction(1);
            break;
            
        case 'client_speaking':
            console.log(`   👤 Client: "${message.transcript}"`);
            break;
            
        case 'ai_thinking':
            console.log('   🤔 AI is thinking...');
            break;
            
        case 'ai_speaking':
            responseCount++;
            console.log(`   🤖 AI Response #${responseCount}: "${message.text}"`);
            break;
            
        case 'ai_finished_speaking':
            console.log('   ✅ AI finished speaking, ready for next interaction');
            
            // Send next interaction after AI finishes
            if (interactionCount < 4) {
                setTimeout(() => {
                    sendInteraction(interactionCount + 1);
                }, 2000);
            } else {
                console.log('\n🎉 Test complete! AI responded', responseCount, 'times');
                setTimeout(() => {
                    ws.close();
                    process.exit(0);
                }, 1000);
            }
            break;
    }
});

function sendInteraction(num) {
    interactionCount = num;
    const questions = [
        'I need help with my computer',
        'My email is not working',
        'How do I backup my files?',
        'Should I update my software?'
    ];
    
    const question = questions[num - 1];
    console.log(`\n🗣️  Sending interaction #${num}: "${question}"`);
    
    // Method 1: Using simulate_interaction (works)
    ws.send(JSON.stringify({
        type: 'simulate_interaction',
        text: question,
        speaker: 'client'
    }));
    
    // Method 2: Using client_speaking_detected (to test if this works now)
    setTimeout(() => {
        console.log('   📡 Also sending client_speaking_detected...');
        ws.send(JSON.stringify({
            type: 'client_speaking_detected',
            audioData: 'mock-audio-data'
        }));
    }, 500);
}

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
    console.log(`\nWebSocket closed. Code: ${code}, Reason: ${reason}`);
    console.log(`Total AI responses received: ${responseCount}`);
});

// Timeout after 60 seconds
setTimeout(() => {
    console.log('\n⏰ Test timeout reached');
    ws.close();
    process.exit(1);
}, 60000);