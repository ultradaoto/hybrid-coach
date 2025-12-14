#!/usr/bin/env node

import fetch from 'node-fetch';
import { WebSocket } from 'ws';

console.log('🔍 Checking server status...\n');

// Check CPU server
async function checkCPUServer() {
    try {
        const response = await fetch('http://localhost:3000/healthz');
        const data = await response.text();
        console.log('✅ CPU Server (port 3000): RUNNING');
        console.log(`   Response: ${data.substring(0, 50)}...`);
    } catch (error) {
        console.log('❌ CPU Server (port 3000): NOT RUNNING');
        console.log(`   Error: ${error.message}`);
    }
}

// Check GPU server HTTP
async function checkGPUServerHTTP() {
    try {
        const response = await fetch('http://localhost:8001/health');
        const data = await response.json();
        console.log('✅ GPU Server HTTP (port 8001): RUNNING');
        console.log(`   Response: ${JSON.stringify(data)}`);
    } catch (error) {
        console.log('❌ GPU Server HTTP (port 8001): NOT RUNNING');
        console.log(`   Error: ${error.message}`);
    }
}

// Check GPU server WebSocket
async function checkGPUServerWS() {
    return new Promise((resolve) => {
        try {
            const ws = new WebSocket('ws://localhost:8001/ai-session/test-123');
            
            const timeout = setTimeout(() => {
                ws.close();
                console.log('❌ GPU Server WebSocket (port 8001): TIMEOUT');
                resolve();
            }, 5000);
            
            ws.onopen = () => {
                clearTimeout(timeout);
                console.log('✅ GPU Server WebSocket (port 8001): RUNNING');
                ws.close();
                resolve();
            };
            
            ws.onerror = (error) => {
                clearTimeout(timeout);
                console.log('❌ GPU Server WebSocket (port 8001): CONNECTION FAILED');
                console.log(`   Error: Connection refused or server not running`);
                resolve();
            };
            
        } catch (error) {
            console.log('❌ GPU Server WebSocket (port 8001): FAILED TO CREATE');
            console.log(`   Error: ${error.message}`);
            resolve();
        }
    });
}

// Check environment variables
function checkEnvVars() {
    console.log('\n📋 Environment Variables:');
    console.log(`   GPU_SERVER_URL: ${process.env.GPU_SERVER_URL || 'undefined'}`);
    console.log(`   GPU_WS_URL: ${process.env.GPU_WS_URL || 'undefined'}`);
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
    console.log(`   PORT: ${process.env.PORT || 'undefined'}`);
}

// Run all checks
async function runChecks() {
    await checkCPUServer();
    await checkGPUServerHTTP();
    await checkGPUServerWS();
    checkEnvVars();
    
    console.log('\n💡 Next Steps:');
    console.log('   1. Both servers should be running for AI to work');
    console.log('   2. If GPU server is down: cd hybrid-coach-gpu && node server.js');
    console.log('   3. If CPU server is down: npm start');
    console.log('   4. Check pm2 status on production server');
}

runChecks().catch(console.error);