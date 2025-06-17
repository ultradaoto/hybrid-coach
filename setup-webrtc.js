#!/usr/bin/env node

/**
 * WebRTC Setup Script for MyUltra.coach
 * This script helps configure the environment for WebRTC video streaming
 */

import { networkInterfaces } from 'os';
import https from 'https';
import fs from 'fs';

console.log('🎥 MyUltra.coach WebRTC Setup');
console.log('================================\n');

// 1. Detect local IP addresses
function getLocalIPAddresses() {
    const interfaces = networkInterfaces();
    const addresses = [];
    
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            // Skip internal (localhost) and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push({
                    interface: name,
                    address: iface.address
                });
            }
        }
    }
    
    return addresses;
}

// 2. Get public IP address
function getPublicIP() {
    return new Promise((resolve, reject) => {
        https.get('https://api.ipify.org', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data.trim()));
        }).on('error', reject);
    });
}

// 3. Check if ports are likely to be available
function checkPortRange(start, end) {
    console.log(`📡 Checking port range ${start}-${end} for MediaSoup...`);
    
    // Basic check - just verify the range is reasonable
    const portCount = end - start + 1;
    if (portCount < 1000) {
        console.log(`⚠️  Warning: Port range is small (${portCount} ports). Consider expanding.`);
    } else {
        console.log(`✅ Port range looks good (${portCount} ports available)`);
    }
}

// 4. Generate environment configuration
function generateEnvConfig(localIPs, publicIP) {
    console.log('\n📝 Generating .env configuration...\n');
    
    let config = `# MyUltra.coach Environment Configuration
# Generated on ${new Date().toISOString()}

NODE_ENV=development

# Database Configuration (Update with your actual database URL)
DATABASE_URL="postgresql://username:password@localhost:5432/myultracoach"

# Session and Auth Configuration (Generate secure secrets)
SESSION_SECRET="your-session-secret-here-change-me"
JWT_SECRET="your-jwt-secret-here-change-me"

# Google OAuth Configuration (Get from Google Console)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# MediaSoup WebRTC Configuration
# CRITICAL: Choose the right IP address for your setup:
`;

    // Add local IP options
    if (localIPs.length > 0) {
        config += '\n# Local network IP addresses (for local development):';
        localIPs.forEach(ip => {
            config += `\n# MEDIASOUP_ANNOUNCED_IP=${ip.address}  # ${ip.interface}`;
        });
    }
    
    // Add public IP option
    if (publicIP) {
        config += `\n\n# Public IP address (for production deployment):\n# MEDIASOUP_ANNOUNCED_IP=${publicIP}`;
    }
    
    config += `\n
# For local development, use your network IP (NOT 127.0.0.1)
# Uncomment ONE of the above MEDIASOUP_ANNOUNCED_IP lines
MEDIASOUP_ANNOUNCED_IP=CHANGE_ME

# MediaSoup RTC Port Range (ensure these ports are open in firewall)
MEDIASOUP_RTC_MIN_PORT=40000
MEDIASOUP_RTC_MAX_PORT=49999

# Server Configuration
PORT=3000
HOST=0.0.0.0

# Debug Configuration (for troubleshooting)
DEBUG="hybrid-coach:*"

# Optional: Twilio TURN Service (for better NAT traversal)
# TWILIO_ACCOUNT_SID="your-twilio-account-sid"
# TWILIO_AUTH_TOKEN="your-twilio-auth-token"
`;

    return config;
}

// 5. Main setup function
async function main() {
    try {
        console.log('🔍 Detecting network configuration...\n');
        
        // Get local IP addresses
        const localIPs = getLocalIPAddresses();
        console.log('Local IP addresses found:');
        localIPs.forEach(ip => {
            console.log(`  📍 ${ip.address} (${ip.interface})`);
        });
        
        if (localIPs.length === 0) {
            console.log('❌ No local IP addresses found. This may cause WebRTC issues.');
        }
        
        // Get public IP
        console.log('\n🌐 Getting public IP address...');
        let publicIP;
        try {
            publicIP = await getPublicIP();
            console.log(`  🌍 Public IP: ${publicIP}`);
        } catch (err) {
            console.log(`  ⚠️  Could not detect public IP: ${err.message}`);
        }
        
        // Check port range
        console.log('');
        checkPortRange(40000, 49999);
        
        // Generate environment config
        const envConfig = generateEnvConfig(localIPs, publicIP);
        
        // Check if .env already exists
        const envExists = fs.existsSync('.env');
        const envFilename = envExists ? '.env.new' : '.env';
        
        fs.writeFileSync(envFilename, envConfig);
        
        console.log(`\n✅ Configuration written to ${envFilename}`);
        
        if (envExists) {
            console.log('\n⚠️  Note: .env already exists, created .env.new instead');
            console.log('   Review .env.new and merge changes into your .env file');
        }
        
        console.log('\n🎯 Next steps:');
        console.log('1. Edit your .env file and set MEDIASOUP_ANNOUNCED_IP to the correct IP');
        console.log('2. If testing locally, use your network IP (e.g., 192.168.1.100)');
        console.log('3. If deploying to production, use your server\'s public IP');
        console.log('4. Ensure ports 40000-49999 are open in your firewall');
        console.log('5. Run: npm start');
        console.log('6. Test video call at: /room/create');
        
        console.log('\n🔧 Troubleshooting tips:');
        console.log('- If video doesn\'t work, try the simplified room: /room/{roomId}/simple');
        console.log('- Check browser console for WebRTC errors');
        console.log('- Verify MEDIASOUP_ANNOUNCED_IP is your actual network IP');
        console.log('- Test on same network first, then across internet');
        
    } catch (err) {
        console.error('❌ Setup failed:', err.message);
        process.exit(1);
    }
}

// Run the setup
main(); 