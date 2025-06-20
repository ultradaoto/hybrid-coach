import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { access, constants } from 'fs/promises';
import { join } from 'path';

// Use built-in fetch if available (Node 18+), otherwise require node-fetch
const fetch = globalThis.fetch || (await import('node-fetch')).default;

/**
 * OrbManager - Manages AI Orb process lifecycle
 * 
 * Responsibilities:
 * - Spawn AI orb processes when participants join rooms
 * - Track participant presence and manage cleanup timers
 * - Monitor orb health and handle graceful shutdown
 * - Coordinate session summaries and database updates
 */
export class OrbManager extends EventEmitter {
    constructor() {
        super();
        this.activeOrbs = new Map(); // roomId -> OrbProcess
        this.maxConcurrentOrbs = parseInt(process.env.MAX_CONCURRENT_ORBS) || 8;
        this.roomParticipants = new Map(); // roomId -> Set<userId>
        this.cleanupTimers = new Map(); // roomId -> timeoutId
        this.orbHealthInterval = null;
    }

    /**
     * Validate GPU server path exists and is accessible
     */
    async validateGpuPath(gpuPath) {
        try {
            // Check if directory exists and is accessible
            await access(gpuPath, constants.F_OK | constants.R_OK);
            
            // Check if aiorb.js exists in the directory
            const aiorbPath = join(gpuPath, 'aiorb.js');
            await access(aiorbPath, constants.F_OK | constants.R_OK);
            
            console.log(`[OrbManager] ✅ GPU path validated: ${gpuPath}`);
            return true;
        } catch (err) {
            console.warn(`[OrbManager] ⚠️ GPU path invalid: ${gpuPath} - ${err.message}`);
            return false;
        }
    }

    /**
     * Spawn a new AI orb via GPU Orb Manager API
     */
    async spawnOrb(roomId, sessionId, appointment) {
        if (this.activeOrbs.size >= this.maxConcurrentOrbs) {
            throw new Error(`Maximum orb capacity reached (${this.maxConcurrentOrbs})`);
        }

        if (this.activeOrbs.has(roomId)) {
            console.log(`[OrbManager] ⚠️ Orb already exists for room ${roomId}`);
            return this.activeOrbs.get(roomId);
        }

        const gpuManagerUrl = process.env.GPU_MANAGER_URL || 'http://127.0.0.1:8002';
        
        try {
            // Determine max lifetime based on environment
            const isTest = appointment.status === 'test' || process.env.ORB_TEST_MODE === 'true';
            const maxLifetime = isTest ? 30000 : 7200000; // 30s for test, 2h for normal
            
            const spawnPayload = {
                roomId,
                sessionId,
                options: {
                    maxLifetime,
                    coachId: appointment.coachId,
                    clientId: appointment.clientId,
                    cpuHost: process.env.CPU_HOST || 'localhost:3000',
                    testMode: isTest
                }
            };
            
            console.log(`[OrbManager] 🚀 Requesting AI Orb spawn via GPU Manager: ${gpuManagerUrl}/orbs/spawn`);
            
            const response = await fetch(`${gpuManagerUrl}/orbs/spawn`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(spawnPayload),
                timeout: 10000 // 10 second timeout
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`GPU Manager API error (${response.status}): ${errorText}`);
            }
            
            const result = await response.json();
            
            // Create local tracking object for the remotely spawned orb
            const orb = {
                orbId: result.orbId, // GPU manager's orb ID
                pid: result.pid,
                roomId,
                sessionId,
                appointment,
                startTime: Date.now(),
                status: 'spawning',
                lastHeartbeat: Date.now(),
                spawnedViaAPI: true, // Flag to indicate this was spawned via API
                metrics: {
                    cpu: 0,
                    memory: 0,
                    latency: 0
                }
            };
            
            this.activeOrbs.set(roomId, orb);
            
            console.log(`[OrbManager] ✅ AI Orb spawned via GPU Manager for room ${roomId} (Orb ID: ${result.orbId}, PID: ${result.pid})`);
            this.emit('orb_spawned', { roomId, orbId: result.orbId, pid: result.pid, sessionId });
            
            return orb;
            
        } catch (error) {
            console.error(`[OrbManager] ❌ Failed to spawn orb via GPU Manager:`, error.message);
            
            // Fallback to direct spawning if API fails
            console.log(`[OrbManager] 🔄 Falling back to direct process spawning...`);
            return await this.spawnOrbDirect(roomId, sessionId, appointment);
        }
    }
    
    /**
     * Fallback: Direct process spawning (legacy method)
     */
    async spawnOrbDirect(roomId, sessionId, appointment) {
        // Production deployment paths
        const gpuServerPath = process.env.GPU_SERVER_PATH || '/var/www/hybrid-coach-gpu';
        const cpuHost = process.env.CPU_HOST || 'localhost:3000';
        
        // Determine if we're in development or production
        const isDevelopment = process.env.NODE_ENV === 'development';
        const fallbackPath = isDevelopment ? '../gpu-server' : '/var/www/hybrid-coach-gpu';
        
        // Use fallback if GPU_SERVER_PATH doesn't exist
        const finalGpuPath = await this.validateGpuPath(gpuServerPath) ? 
            gpuServerPath : 
            fallbackPath;
        
        console.log(`[OrbManager] Using GPU server path: ${finalGpuPath}`);
        
        const args = [
            'aiorb.js',
            `--room=${roomId}`,
            `--session=${sessionId}`,
            `--coach=${appointment.coachId}`,
            `--client=${appointment.clientId}`,
            `--cpu-host=${cpuHost}`,
            `--max-lifetime=7200000`, // 2 hours
            `--idle-timeout=300000`,  // 5 minutes
        ];

        // Add test mode flag if specified
        if (appointment.status === 'test' || process.env.ORB_TEST_MODE === 'true') {
            args.push('--test-mode');
            args.push('--max-lifetime=30000'); // 30 seconds for testing
        }

        // Cross-directory process spawning with proper environment
        const orbProcess = spawn('node', args.filter(Boolean), {
            cwd: finalGpuPath,
            env: {
                ...process.env,
                NODE_ENV: process.env.NODE_ENV || 'production',
                ROOM_ID: roomId,
                SESSION_ID: sessionId,
                CPU_SERVER_HOST: cpuHost,
                // Ensure proper path resolution for GPU server
                PWD: finalGpuPath,
                HOME: process.env.HOME
            },
            // Important for cross-directory execution
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            detached: false,
            shell: false
        });

        const orb = {
            process: orbProcess,
            pid: orbProcess.pid,
            roomId,
            sessionId,
            appointment,
            startTime: Date.now(),
            status: 'spawning',
            lastHeartbeat: Date.now(),
            spawnedViaAPI: false, // Mark as directly spawned
            metrics: {
                cpu: 0,
                memory: 0,
                latency: 0
            }
        };

        this.activeOrbs.set(roomId, orb);
        this.setupOrbHandlers(roomId, orbProcess);
        
        console.log(`[OrbManager] 🚀 Spawned AI Orb for room ${roomId} (PID: ${orbProcess.pid})`);
        this.emit('orb_spawned', { roomId, pid: orbProcess.pid, sessionId });
        
        return orb;
    }

    /**
     * Kill an orb process by room ID (API or direct)
     */
    async killOrbByRoom(roomId, reason = 'manual_termination') {
        const orb = this.activeOrbs.get(roomId);
        if (!orb) {
            console.log(`[OrbManager] ⚠️ No orb found for room ${roomId}`);
            return;
        }

        console.log(`[OrbManager] 🔴 Killing orb for room ${roomId} (PID: ${orb.pid}, Reason: ${reason})`);
        
        if (orb.spawnedViaAPI && orb.orbId) {
            // Use GPU Manager API to kill the orb
            console.log(`[OrbManager] 🎯 Using API termination for orb ${orb.orbId}`);
            await this.killOrbViaAPI(roomId, orb.orbId, reason);
        } else {
            // Use direct process killing (legacy method)
            console.log(`[OrbManager] 🎯 Using direct termination for PID ${orb.pid}`);
            await this.killOrbDirect(orb, reason);
        }

        this.activeOrbs.delete(roomId);
        this.clearCleanupTimer(roomId);
        this.emit('orb_terminated', { roomId, pid: orb.pid, reason });
    }
    
    /**
     * Kill orb via GPU Manager API
     */
    async killOrbViaAPI(roomId, orbId, reason) {
        const gpuManagerUrl = process.env.GPU_MANAGER_URL || 'http://127.0.0.1:8002';
        
        try {
            console.log(`[OrbManager] 🔴 Terminating orb via GPU Manager API: ${orbId}`);
            
            const response = await fetch(`${gpuManagerUrl}/orbs/${orbId}/terminate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    reason,
                    graceful: true
                }),
                timeout: 15000 // 15 second timeout
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.warn(`[OrbManager] ⚠️ API termination failed (${response.status}): ${errorText}`);
                return false;
            }
            
            const result = await response.json();
            console.log(`[OrbManager] ✅ Orb ${orbId} terminated via API: ${result.message}`);
            return true;
            
        } catch (error) {
            console.error(`[OrbManager] ❌ Failed to terminate orb via API:`, error.message);
            return false;
        }
    }
    
    /**
     * Kill orb via direct process methods (legacy)
     */
    async killOrbDirect(orb, reason) {
        try {
            // Send graceful shutdown signal
            if (orb.process && orb.process.connected) {
                orb.process.send({ 
                    type: 'shutdown_graceful', 
                    reason,
                    timeout: 10000 
                });
            }
            
            // Set status to terminating
            orb.status = 'terminating';
            
            // Force kill after timeout
            setTimeout(() => {
                if (orb.process && !orb.process.killed) {
                    console.log(`[OrbManager] ⚠️ Force killing orb for room ${orb.roomId}`);
                    process.kill(orb.pid, 'SIGTERM');
                    
                    // Last resort SIGKILL after 5 more seconds
                    setTimeout(() => {
                        if (orb.process && !orb.process.killed) {
                            process.kill(orb.pid, 'SIGKILL');
                        }
                    }, 5000);
                }
            }, 10000);

        } catch (err) {
            console.error(`[OrbManager] ❌ Error killing orb for room ${orb.roomId}:`, err);
        }
    }

    /**
     * Track when a participant joins a room
     */
    trackParticipantJoin(roomId, userId, userRole) {
        if (!this.roomParticipants.has(roomId)) {
            this.roomParticipants.set(roomId, new Set());
        }
        
        this.roomParticipants.get(roomId).add(userId);
        
        // Reset cleanup timer on activity
        this.resetCleanupTimer(roomId);
        
        // Notify orb of participant change
        const orb = this.activeOrbs.get(roomId);
        if (orb) {
            if (orb.spawnedViaAPI) {
                // For API-spawned orbs, the GPU Manager handles participant tracking
                // No direct process communication needed
                console.log(`[OrbManager] 📡 Participant join tracked for API-spawned orb ${orb.orbId}`);
            } else if (orb.process && orb.process.connected) {
                orb.process.send({
                    type: 'participant_joined',
                    userId,
                    userRole
                });
            }
        }
        
        console.log(`[OrbManager] 👤 ${userRole} (${userId}) joined room ${roomId}`);
        this.emit('participant_joined', { roomId, userId, userRole });
    }

    /**
     * Track when a participant leaves a room
     */
    trackParticipantLeave(roomId, userId) {
        const participants = this.roomParticipants.get(roomId);
        if (!participants) return;
        
        participants.delete(userId);
        
        // Notify orb of participant change
        const orb = this.activeOrbs.get(roomId);
        if (orb) {
            if (orb.spawnedViaAPI) {
                // For API-spawned orbs, the GPU Manager handles participant tracking
                console.log(`[OrbManager] 📡 Participant leave tracked for API-spawned orb ${orb.orbId}`);
            } else if (orb.process && orb.process.connected) {
                orb.process.send({
                    type: 'participant_left',
                    userId
                });
            }
        }
        
        console.log(`[OrbManager] 🏃 User ${userId} left room ${roomId}. Remaining: ${participants.size}`);
        
        if (participants.size === 0) {
            console.log(`[OrbManager] 🏃 All participants left room ${roomId}`);
            this.setCleanupTimer(roomId, 60000); // 1 minute grace period
            this.emit('room_empty', { roomId });
        }
    }

    /**
     * Set a cleanup timer for a room
     */
    setCleanupTimer(roomId, delay) {
        this.clearCleanupTimer(roomId);
        
        console.log(`[OrbManager] ⏰ Setting cleanup timer for room ${roomId}: ${delay}ms`);
        
        const timer = setTimeout(async () => {
            if (this.isRoomEmpty(roomId)) {
                console.log(`[OrbManager] 🧹 Cleanup timer triggered for room ${roomId}`);
                await this.killOrbByRoom(roomId, 'room_empty_timeout');
            }
        }, delay);
        
        this.cleanupTimers.set(roomId, timer);
    }

    /**
     * Reset cleanup timer for active sessions
     */
    resetCleanupTimer(roomId) {
        this.clearCleanupTimer(roomId);
        // Active session gets 30 minute cleanup timer
        this.setCleanupTimer(roomId, 1800000);
    }

    /**
     * Clear cleanup timer
     */
    clearCleanupTimer(roomId) {
        const timer = this.cleanupTimers.get(roomId);
        if (timer) {
            clearTimeout(timer);
            this.cleanupTimers.delete(roomId);
        }
    }

    /**
     * Check if a room is empty
     */
    isRoomEmpty(roomId) {
        const participants = this.roomParticipants.get(roomId);
        return !participants || participants.size === 0;
    }

    /**
     * Check if an orb exists for a room
     */
    hasOrbForRoom(roomId) {
        return this.activeOrbs.has(roomId);
    }

    /**
     * Get orb status for a room
     */
    getOrbStatus(roomId) {
        const orb = this.activeOrbs.get(roomId);
        return orb ? {
            status: orb.status,
            pid: orb.pid,
            uptime: Date.now() - orb.startTime,
            metrics: orb.metrics
        } : null;
    }

    /**
     * Handle messages from orb processes
     */
    handleOrbMessage(roomId, message) {
        const orb = this.activeOrbs.get(roomId);
        if (!orb) return;

        switch (message.type) {
            case 'orb_ready':
                orb.status = 'ready';
                console.log(`[OrbManager] ✅ AI Orb ready for room ${roomId}`);
                this.emit('orb_ready', { roomId, ...message });
                break;
                
            case 'orb_heartbeat':
                orb.lastHeartbeat = Date.now();
                if (message.metrics) {
                    orb.metrics = message.metrics;
                }
                break;
                
            case 'orb_error':
                console.error(`[OrbManager] ❌ Orb error in room ${roomId}:`, message.error);
                orb.status = 'error';
                this.emit('orb_error', { roomId, error: message.error });
                
                // Consider restarting on critical errors
                if (message.critical) {
                    this.scheduleOrbRestart(roomId);
                }
                break;
                
            case 'session_summary':
                console.log(`[OrbManager] 📝 Received session summary for room ${roomId}`);
                this.emit('session_summary', {
                    ...message,
                    roomId,
                    sessionId: orb.sessionId
                });
                break;
                
            case 'orb_shutdown':
                console.log(`[OrbManager] 🛑 Orb shutting down for room ${roomId}:`, message.reason);
                orb.status = 'shutting_down';
                break;
                
            default:
                // Forward other messages
                this.emit('orb_message', { roomId, message });
        }
    }

    /**
     * Setup handlers for orb process events
     */
    setupOrbHandlers(roomId, orbProcess) {
        // Handle IPC messages
        orbProcess.on('message', (message) => {
            this.handleOrbMessage(roomId, message);
        });

        // Handle process errors
        orbProcess.on('error', (error) => {
            console.error(`[OrbManager] ❌ Orb process error for room ${roomId}:`, error);
            this.emit('orb_error', { roomId, error: error.message });
            this.activeOrbs.delete(roomId);
        });

        // Handle process exit
        orbProcess.on('exit', (code, signal) => {
            console.log(`[OrbManager] 🛑 Orb exited for room ${roomId} (code: ${code}, signal: ${signal})`);
            
            const orb = this.activeOrbs.get(roomId);
            if (orb) {
                this.emit('orb_exited', {
                    roomId,
                    pid: orb.pid,
                    code,
                    signal,
                    uptime: Date.now() - orb.startTime
                });
            }
            
            this.activeOrbs.delete(roomId);
            this.clearCleanupTimer(roomId);
        });

        // Capture stdout
        orbProcess.stdout.on('data', (data) => {
            const lines = data.toString().trim().split('\n');
            lines.forEach(line => {
                console.log(`[Orb ${roomId}] ${line}`);
            });
        });

        // Capture stderr
        orbProcess.stderr.on('data', (data) => {
            const lines = data.toString().trim().split('\n');
            lines.forEach(line => {
                console.error(`[Orb ${roomId} ERROR] ${line}`);
            });
        });
    }

    /**
     * Schedule orb restart after critical error
     */
    scheduleOrbRestart(roomId, delay = 5000) {
        const orb = this.activeOrbs.get(roomId);
        if (!orb || orb.status === 'restarting') return;
        
        console.log(`[OrbManager] 🔄 Scheduling orb restart for room ${roomId} in ${delay}ms`);
        orb.status = 'restarting';
        
        setTimeout(async () => {
            try {
                await this.killOrbByRoom(roomId, 'restart');
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Only restart if room still has participants
                if (!this.isRoomEmpty(roomId)) {
                    await this.spawnOrb(roomId, orb.sessionId, orb.appointment);
                }
            } catch (err) {
                console.error(`[OrbManager] ❌ Failed to restart orb for room ${roomId}:`, err);
            }
        }, delay);
    }

    /**
     * Start health monitoring for all orbs
     */
    startHealthMonitoring() {
        if (this.orbHealthInterval) return;
        
        const checkInterval = parseInt(process.env.ORB_HEALTH_CHECK_INTERVAL) || 30000;
        
        this.orbHealthInterval = setInterval(() => {
            const now = Date.now();
            
            this.activeOrbs.forEach((orb, roomId) => {
                const timeSinceHeartbeat = now - orb.lastHeartbeat;
                
                if (timeSinceHeartbeat > 60000) { // 1 minute without heartbeat
                    console.warn(`[OrbManager] ⚠️ Orb unresponsive for room ${roomId} (${timeSinceHeartbeat}ms)`);
                    orb.status = 'unresponsive';
                    
                    // Kill and potentially restart after 2 minutes
                    if (timeSinceHeartbeat > 120000) {
                        this.killOrbByRoom(roomId, 'unresponsive');
                        
                        // Restart if room has participants
                        if (!this.isRoomEmpty(roomId)) {
                            this.scheduleOrbRestart(roomId);
                        }
                    }
                }
                
                // Emit health status
                this.emit('orb_health', {
                    roomId,
                    pid: orb.pid,
                    status: orb.status,
                    uptime: now - orb.startTime,
                    lastHeartbeat: orb.lastHeartbeat,
                    metrics: orb.metrics
                });
            });
        }, checkInterval);
        
        console.log(`[OrbManager] 💓 Health monitoring started (interval: ${checkInterval}ms)`);
    }

    /**
     * Stop health monitoring
     */
    stopHealthMonitoring() {
        if (this.orbHealthInterval) {
            clearInterval(this.orbHealthInterval);
            this.orbHealthInterval = null;
            console.log('[OrbManager] 💔 Health monitoring stopped');
        }
    }

    /**
     * Get metrics for all active orbs
     */
    getMetrics() {
        const metrics = {
            activeOrbs: this.activeOrbs.size,
            maxOrbs: this.maxConcurrentOrbs,
            utilization: (this.activeOrbs.size / this.maxConcurrentOrbs) * 100,
            orbs: []
        };
        
        this.activeOrbs.forEach((orb, roomId) => {
            metrics.orbs.push({
                roomId,
                pid: orb.pid,
                status: orb.status,
                uptime: Date.now() - orb.startTime,
                participants: this.roomParticipants.get(roomId)?.size || 0,
                metrics: orb.metrics
            });
        });
        
        return metrics;
    }

    /**
     * Gracefully shutdown all orbs
     */
    async shutdown() {
        console.log('[OrbManager] 🔄 Shutting down all orbs...');
        
        this.stopHealthMonitoring();
        
        const shutdownPromises = Array.from(this.activeOrbs.keys()).map(roomId => {
            return this.killOrbByRoom(roomId, 'system_shutdown');
        });
        
        await Promise.allSettled(shutdownPromises);
        
        // Clear all timers
        this.cleanupTimers.forEach(timer => clearTimeout(timer));
        this.cleanupTimers.clear();
        
        console.log('[OrbManager] ✅ All orbs terminated');
    }
}

// Create singleton instance
export const orbManager = new OrbManager();

// Start health monitoring
orbManager.startHealthMonitoring();

// Graceful shutdown on process exit
process.on('SIGINT', async () => {
    console.log('\n[OrbManager] Received SIGINT, shutting down...');
    await orbManager.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n[OrbManager] Received SIGTERM, shutting down...');
    await orbManager.shutdown();
    process.exit(0);
});