#!/usr/bin/env node
/**
 * Test Enhanced WebSocket Endpoint
 * This script tests the /ws-simple/ endpoint from Node.js
 */

import WebSocket from 'ws';

const ROOM_ID = 'test-room-' + Date.now();
const CPU_HOST = process.env.CPU_HOST || 'localhost:3000';

console.log('🧪 Testing Enhanced WebSocket Endpoint');
console.log('=====================================');
console.log(`Room ID: ${ROOM_ID}`);
console.log(`CPU Host: ${CPU_HOST}`);
console.log('');

// Test AI Orb connection
function testAIOrbConnection() {
    const wsUrl = `ws://${CPU_HOST}/ws-simple/${ROOM_ID}`;
    console.log(`🔗 Connecting AI Orb to: ${wsUrl}`);
    
    const ws = new WebSocket(wsUrl);
    
    ws.on('open', () => {
        console.log('✅ AI Orb WebSocket connected');
        
        // Send join message
        const joinMessage = {
            type: 'join',
            roomId: ROOM_ID,
            userId: 'ai-orb-test',
            userName: 'AI Assistant Test',
            userRole: 'ai',
            participantType: 'ai'
        };
        
        console.log('📤 Sending join message:', joinMessage);
        ws.send(JSON.stringify(joinMessage));
    });
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log('📥 Received message:', message);
            
            if (message.type === 'peer-discovery') {
                console.log(`📋 Peer discovery: Found ${message.peers.length} existing participants`);
            }
            
            if (message.type === 'user-joined') {
                console.log(`👤 User joined: ${message.userName} (${message.userRole})`);
            }
            
        } catch (err) {
            console.error('❌ Failed to parse message:', err);
        }
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
    });
    
    ws.on('close', (code, reason) => {
        console.log(`🔌 WebSocket closed: ${code} ${reason}`);
    });
    
    return ws;
}

// Test human participant connection
function testHumanConnection(userRole = 'coach') {
    const wsUrl = `ws://${CPU_HOST}/ws-simple/${ROOM_ID}`;
    console.log(`🔗 Connecting ${userRole} to: ${wsUrl}`);
    
    const ws = new WebSocket(wsUrl);
    
    ws.on('open', () => {
        console.log(`✅ ${userRole} WebSocket connected`);
        
        // Send join message
        const joinMessage = {
            type: 'join',
            roomId: ROOM_ID,
            userId: `${userRole}-test`,
            userName: `Test ${userRole}`,
            userRole: userRole,
            participantType: 'human'
        };
        
        console.log(`📤 ${userRole} sending join message:`, joinMessage);
        ws.send(JSON.stringify(joinMessage));
    });
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log(`📥 ${userRole} received:`, message.type);
            
            if (message.type === 'user-joined' && message.participantType === 'ai') {
                console.log(`🤖 ${userRole} sees AI Orb joined!`);
                
                // Test sending offer to AI (coaches should do this)
                if (userRole === 'coach') {
                    setTimeout(() => {
                        console.log('📤 Coach creating test offer for AI Orb...');
                        ws.send(JSON.stringify({
                            type: 'offer',
                            offer: { type: 'offer', sdp: 'test-offer-sdp' },
                            toId: message.userId
                        }));
                    }, 1000);
                }
            }
            
        } catch (err) {
            console.error(`❌ ${userRole} failed to parse message:`, err);
        }
    });
    
    ws.on('error', (error) => {
        console.error(`❌ ${userRole} WebSocket error:`, error.message);
    });
    
    ws.on('close', (code, reason) => {
        console.log(`🔌 ${userRole} WebSocket closed: ${code} ${reason}`);
    });
    
    return ws;
}

// Run the test
async function runTest() {
    console.log('1. Testing Enhanced WebSocket endpoint connectivity...');
    
    // Test with coach first (should trigger orb spawn in real scenario)
    const coachWs = testHumanConnection('coach');
    
    // Wait a bit then add AI Orb
    setTimeout(() => {
        console.log('\n2. Adding AI Orb to room...');
        const aiWs = testAIOrbConnection();
        
        // Add client after AI joins
        setTimeout(() => {
            console.log('\n3. Adding client to room...');
            const clientWs = testHumanConnection('client');
            
            // Cleanup after test
            setTimeout(() => {
                console.log('\n🧹 Cleaning up test connections...');
                try {
                    coachWs.close();
                    aiWs.close();
                    clientWs.close();
                } catch (err) {
                    // Ignore cleanup errors
                }
                
                console.log('\n✅ Test completed!');
                console.log('\nIf you see AI Orb connections above, the Enhanced WebSocket is working.');
                console.log('If not, check that the Enhanced WebSocket server is running on CPU.');
                
                process.exit(0);
            }, 5000);
            
        }, 2000);
        
    }, 2000);
}

runTest().catch(console.error);