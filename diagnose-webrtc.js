#!/usr/bin/env node

/**
 * WebRTC Diagnostic Script for MyUltra.coach
 * This script helps diagnose WebRTC connectivity issues
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import fs from 'fs';

const execAsync = promisify(exec);

console.log('🔧 MyUltra.coach WebRTC Diagnostics');
console.log('=====================================\n');

// Check if environment variables are set
function checkEnvironment() {
    console.log('📋 Environment Check:');
    
    const requiredVars = [
        'MEDIASOUP_ANNOUNCED_IP',
        'MEDIASOUP_RTC_MIN_PORT',
        'MEDIASOUP_RTC_MAX_PORT'
    ];
    
    const issues = [];
    
    requiredVars.forEach(varName => {
        const value = process.env[varName];
        if (!value) {
            issues.push(`❌ ${varName} is not set`);
        } else if (varName === 'MEDIASOUP_ANNOUNCED_IP' && (value === 'CHANGE_ME' || value === '127.0.0.1' || value === 'localhost')) {
            issues.push(`⚠️  ${varName} is set to '${value}' - this likely won't work for WebRTC`);
        } else {
            console.log(`✅ ${varName} = ${value}`);
        }
    });
    
    if (issues.length > 0) {
        console.log('\nEnvironment Issues:');
        issues.forEach(issue => console.log(`  ${issue}`));
        return false;
    }
    
    return true;
}

// Check if .env file exists and is configured
function checkEnvFile() {
    console.log('\n📄 .env File Check:');
    
    if (!fs.existsSync('.env')) {
        console.log('❌ .env file not found');
        console.log('   Run: node setup-webrtc.js to create one');
        return false;
    }
    
    const envContent = fs.readFileSync('.env', 'utf8');
    
    if (envContent.includes('MEDIASOUP_ANNOUNCED_IP=CHANGE_ME')) {
        console.log('❌ MEDIASOUP_ANNOUNCED_IP still set to CHANGE_ME');
        console.log('   Edit .env and set your actual IP address');
        return false;
    }
    
    console.log('✅ .env file exists and appears configured');
    return true;
}

// Check if required packages are installed
async function checkDependencies() {
    console.log('\n📦 Dependencies Check:');
    
    try {
        const { stdout } = await execAsync('npm list mediasoup protoo-server socket.io --depth=0 2>/dev/null || true');
        
        const required = ['mediasoup', 'protoo-server', 'socket.io'];
        const missing = [];
        
        required.forEach(pkg => {
            if (stdout.includes(pkg)) {
                console.log(`✅ ${pkg} is installed`);
            } else {
                missing.push(pkg);
            }
        });
        
        if (missing.length > 0) {
            console.log('\nMissing packages:');
            missing.forEach(pkg => console.log(`❌ ${pkg}`));
            console.log('Run: npm install');
            return false;
        }
        
        return true;
    } catch (err) {
        console.log('⚠️  Could not check dependencies:', err.message);
        return true; // Continue anyway
    }
}

// Check if ports are in use
async function checkPorts() {
    console.log('\n🚪 Port Check:');
    
    const minPort = process.env.MEDIASOUP_RTC_MIN_PORT || 40000;
    const maxPort = process.env.MEDIASOUP_RTC_MAX_PORT || 49999;
    const webPort = process.env.PORT || 3000;
    
    console.log(`WebRTC port range: ${minPort}-${maxPort}`);
    console.log(`Web server port: ${webPort}`);
    
    // Check if web server port is in use
    try {
        const { stdout } = await execAsync(`netstat -ano | findstr :${webPort} || echo "Port available"`);
        if (stdout.includes('LISTENING')) {
            console.log(`⚠️  Port ${webPort} is already in use`);
        } else {
            console.log(`✅ Port ${webPort} appears available`);
        }
    } catch (err) {
        console.log(`⚠️  Could not check port ${webPort}: ${err.message}`);
    }
}

// Test STUN/TURN connectivity
async function testSTUNTURN() {
    console.log('\n🌐 STUN/TURN Test:');
    
    const stunServers = [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302'
    ];
    
    console.log('Testing STUN servers (this is basic connectivity, not full STUN test):');
    
    for (const server of stunServers) {
        const [, host, port] = server.match(/stun:([^:]+):(\d+)/);
        try {
            // Basic connectivity test (not actual STUN protocol)
            await new Promise((resolve, reject) => {
                const net = require('net');
                const socket = new net.Socket();
                socket.setTimeout(3000);
                
                socket.connect(port, host, () => {
                    console.log(`✅ Can connect to ${server}`);
                    socket.destroy();
                    resolve();
                });
                
                socket.on('error', reject);
                socket.on('timeout', () => reject(new Error('Timeout')));
            });
        } catch (err) {
            console.log(`❌ Cannot connect to ${server}: ${err.message}`);
        }
    }
}

// Generate browser test URL
function generateTestInfo() {
    const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP;
    const port = process.env.PORT || 3000;
    
    console.log('\n🧪 Test Information:');
    console.log(`Server should be accessible at: http://${announcedIp}:${port}`);
    console.log(`Dashboard: http://${announcedIp}:${port}/dashboard`);
    console.log(`Create test room: http://${announcedIp}:${port}/room/create`);
    console.log(`Simplified room test: http://${announcedIp}:${port}/room/{roomId}/simple`);
    
    console.log('\n📱 Browser Testing Tips:');
    console.log('1. Open browser console (F12) to see WebRTC logs');
    console.log('2. Test on same network first');
    console.log('3. Try Chrome and Edge to test cross-browser compatibility');
    console.log('4. Look for ICE connection errors in console');
}

// Main diagnostic function
async function main() {
    try {
        const envOk = checkEnvFile();
        const configOk = checkEnvironment();
        const depsOk = await checkDependencies();
        await checkPorts();
        await testSTUNTURN();
        generateTestInfo();
        
        console.log('\n📊 Diagnostic Summary:');
        if (envOk && configOk && depsOk) {
            console.log('✅ Basic configuration looks good!');
            console.log('   If video still doesn\'t work, check:');
            console.log('   - Browser console for WebRTC errors');
            console.log('   - Firewall blocking ports 40000-49999');
            console.log('   - Try the simplified room: /room/{roomId}/simple');
        } else {
            console.log('❌ Configuration issues found. Fix the above issues and run again.');
        }
        
        console.log('\n🔍 Common Issues:');
        console.log('- MEDIASOUP_ANNOUNCED_IP set to 127.0.0.1 (use your network IP)');
        console.log('- Firewall blocking MediaSoup port range');
        console.log('- Testing from different networks without TURN server');
        console.log('- Browser blocking camera/microphone access');
        
    } catch (err) {
        console.error('❌ Diagnostic failed:', err.message);
        process.exit(1);
    }
}

// Run diagnostics
main(); 