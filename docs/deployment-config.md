# Production Deployment Configuration

## Directory Structure

### Production Environment
```
/var/www/
├── myultracoach/                 # CPU Server (main application)
│   ├── src/
│   │   ├── services/
│   │   │   └── OrbManager.js     # Spawns AI orb processes
│   │   └── routes/
│   ├── package.json
│   └── .env
│
└── hybrid-coach-gpu/             # GPU Server (AI orb processes)
    ├── aiorb.js                  # Individual AI orb process
    ├── server.js                 # Legacy GPU server
    ├── package.json
    └── .env
```

### Development Environment
```
project-root/
├── cpu-server/                   # CPU development
│   └── src/services/OrbManager.js
│
└── gpu-server/                   # GPU development
    └── aiorb.js
```

## Environment Variables

### CPU Server (.env)
```bash
# GPU Server Configuration
GPU_SERVER_PATH=/var/www/hybrid-coach-gpu
CPU_HOST=localhost:3000

# Orb Management
MAX_CONCURRENT_ORBS=8
ORB_HEALTH_CHECK_INTERVAL=30000
ORB_TEST_MODE=false

# Development Override
NODE_ENV=production|development
```

### GPU Server (.env)
```bash
# CPU Communication
CPU_SERVER_URL=http://localhost:3000
CPU_WEBSOCKET_URL=ws://localhost:3000

# AI Configuration
OPENAI_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here

# Process Management
MAX_ORB_LIFETIME=7200000
IDLE_TIMEOUT=300000
```

## Process Spawning Configuration

### OrbManager Cross-Directory Spawning
```javascript
// Automatic path detection
const gpuServerPath = process.env.GPU_SERVER_PATH || 
    (process.env.NODE_ENV === 'development' ? 
        '../gpu-server' : 
        '/var/www/hybrid-coach-gpu');

// Spawn process with proper working directory
const orbProcess = spawn('node', ['aiorb.js', ...args], {
    cwd: gpuServerPath,               // Execute in GPU directory
    env: {
        ...process.env,
        PWD: gpuServerPath,           // Set working directory
        CPU_SERVER_HOST: cpuHost      // Pass CPU location
    },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
});
```

## User Permissions

### Deployer Account Setup
```bash
# User: deployer (or your deployment user)
# Must have read/execute permissions on both directories

# Set proper permissions
sudo chown -R deployer:deployer /var/www/myultracoach
sudo chown -R deployer:deployer /var/www/hybrid-coach-gpu

# Ensure execute permissions
chmod +x /var/www/hybrid-coach-gpu/aiorb.js
chmod +x /var/www/myultracoach/src/app.js
```

### Directory Access Requirements
- **CPU Server**: Must have execute permissions in GPU directory
- **GPU Server**: Must be able to communicate back to CPU WebSocket
- **Both**: Need access to shared log directories if used

## Process Management

### CPU Spawning Command
```bash
# What CPU executes:
cd /var/www/hybrid-coach-gpu && node aiorb.js \
    --room=room123 \
    --session=abc456 \
    --coach=coach789 \
    --client=client456 \
    --cpu-host=localhost:3000 \
    --max-lifetime=7200000 \
    --idle-timeout=300000
```

### Orb Process Identification
```bash
# View running orb processes
ps aux | grep aiorb.js

# Output example:
deployer  12345  1.2  2.1  node aiorb.js --room=room123 --session=abc456
deployer  12346  1.1  2.0  node aiorb.js --room=room789 --session=def123
```

### Selective Process Killing
```bash
# Kill specific orb by room (CPU handles this)
# No manual intervention needed - OrbManager handles selective killing

# Emergency: Kill all orbs
pkill -f "aiorb.js"
```

## Logging Configuration

### Separate Log Files
```javascript
// CPU Server logs
const cpuLogPath = '/var/log/myultracoach/cpu.log';

// GPU Server logs (per orb)
const gpuLogPath = '/var/log/hybrid-coach-gpu/';
// Creates: orb-room123.log, orb-room456.log, etc.
```

### Log Rotation
```bash
# Configure logrotate for both systems
/etc/logrotate.d/hybrid-coach
```

## Network Configuration

### Internal Communication
```
CPU Server:  localhost:3000    (HTTP/WebSocket server)
GPU Orbs:    Connect to CPU via WebSocket
Clients:     Connect to CPU via HTTPS/WSS

Flow: Client → CPU → GPU Orb → CPU → Client
```

### Firewall Rules
```bash
# CPU needs incoming connections on port 3000
# GPU needs outgoing connections to CPU
# No direct external access to GPU processes
```

## Monitoring and Health Checks

### Process Monitoring
```javascript
// OrbManager automatically monitors:
- Orb process health (heartbeat every 30s)
- Resource usage per orb
- Connection status
- Automatic restart on failure
```

### System Monitoring
```bash
# Monitor CPU server
systemctl status myultracoach

# Monitor orb processes
ps aux | grep aiorb.js | wc -l  # Count active orbs

# Check GPU directory accessibility
ls -la /var/www/hybrid-coach-gpu/aiorb.js
```

## Deployment Commands

### Initial Setup
```bash
# 1. Deploy CPU server
cd /var/www/myultracoach
npm install
npm run build

# 2. Deploy GPU server
cd /var/www/hybrid-coach-gpu
npm install

# 3. Set environment variables
cp .env.production .env  # Both directories

# 4. Start CPU server (which will spawn GPU orbs as needed)
npm start
```

### Updates
```bash
# Update CPU server
cd /var/www/myultracoach
git pull
npm install
systemctl restart myultracoach

# Update GPU server (will affect new orb spawns)
cd /var/www/hybrid-coach-gpu
git pull
npm install
# No restart needed - new orbs use updated code
```

## Troubleshooting

### Common Issues

#### GPU Path Not Found
```bash
# Error: GPU_SERVER_PATH invalid
# Solution: Check path and permissions
ls -la /var/www/hybrid-coach-gpu/aiorb.js
sudo chown deployer:deployer /var/www/hybrid-coach-gpu
```

#### Permission Denied
```bash
# Error: spawn EACCES
# Solution: Set execute permissions
chmod +x /var/www/hybrid-coach-gpu/aiorb.js
```

#### Cross-Directory Environment Issues
```bash
# Error: Module not found
# Solution: Ensure GPU server has proper dependencies
cd /var/www/hybrid-coach-gpu
npm install
```

### Debug Commands
```bash
# Test orb spawning manually
cd /var/www/hybrid-coach-gpu
node aiorb.js --room=test123 --session=test456 --cpu-host=localhost:3000

# Check CPU→GPU communication
tail -f /var/log/myultracoach/cpu.log
tail -f /var/log/hybrid-coach-gpu/orb-*.log
```

## Security Considerations

### Process Isolation
- Each orb runs as separate process
- Shared deployer user but isolated process space
- No orb can access another orb's memory/state

### File System Access
- GPU orbs run in their own directory
- No write access to CPU server files
- Logs written to separate directories

### Network Security
- Orbs only communicate with CPU server
- No direct external network access for orbs
- All client communication routed through CPU

This configuration ensures reliable cross-directory process management while maintaining security and monitoring capabilities.