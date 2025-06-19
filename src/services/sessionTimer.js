/**
 * SessionTimer - Manages 20-minute session timing with AI coordination
 * 
 * Tracks session duration, sends time warnings to GPU, and manages graceful session endings.
 */

import { prisma } from '../lib/prisma.js';

export class SessionTimer {
    constructor(sessionId, aiWs, durationMinutes = 20) {
        this.sessionId = sessionId;
        this.aiWs = aiWs;
        this.duration = durationMinutes * 60 * 1000; // Convert to milliseconds
        this.startTime = Date.now();
        this.isActive = true;
        this.endCallbacks = [];
        
        // Warning schedule for 20-minute sessions
        this.warnings = [
            { at: 18 * 60 * 1000, type: '2min', minutesRemaining: 2, sent: false },
            { at: 19 * 60 * 1000, type: '1min', minutesRemaining: 1, sent: false },
            { at: 19.5 * 60 * 1000, type: '30sec', minutesRemaining: 0.5, sent: false }
        ];
        
        // Performance tracking
        this.metrics = {
            warningsSent: 0,
            actualDuration: null,
            endedGracefully: false,
            clientDisconnectTime: null
        };
        
        console.log(`[SESSION_TIMER] ⏰ Timer started for session ${sessionId} (${durationMinutes} min)`);
        
        // Start monitoring
        this.startMonitoring();
    }
    
    /**
     * Start the session monitoring loop
     */
    startMonitoring() {
        this.monitoringInterval = setInterval(() => {
            if (!this.isActive) {
                this.stopMonitoring();
                return;
            }
            
            this.checkTimeWarnings();
            this.checkSessionEnd();
        }, 1000); // Check every second
        
        console.log(`[SESSION_TIMER] 📊 Monitoring started for session ${this.sessionId}`);
    }
    
    /**
     * Check if any time warnings need to be sent
     */
    checkTimeWarnings() {
        const elapsed = Date.now() - this.startTime;
        
        for (const warning of this.warnings) {
            if (elapsed >= warning.at && !warning.sent) {
                this.sendTimeWarning(warning);
                warning.sent = true;
            }
        }
    }
    
    /**
     * Check if session has reached its end time
     */
    checkSessionEnd() {
        const elapsed = Date.now() - this.startTime;
        
        if (elapsed >= this.duration) {
            console.log(`[SESSION_TIMER] ⏰ Session ${this.sessionId} time expired (${this.duration/1000}s)`);
            this.initiateEndSequence();
        }
    }
    
    /**
     * Send time warning to GPU
     */
    async sendTimeWarning(warning) {
        console.log(`[SESSION_TIMER] ⚠️ Sending ${warning.type} warning to GPU`);
        
        if (this.aiWs && this.aiWs.readyState === 1) { // WebSocket.OPEN
            try {
                const warningMessage = {
                    type: 'time_warning',
                    sessionId: this.sessionId,
                    minutesRemaining: warning.minutesRemaining,
                    warningType: warning.type,
                    totalElapsed: Date.now() - this.startTime,
                    timestamp: Date.now()
                };
                
                this.aiWs.send(JSON.stringify(warningMessage));
                this.metrics.warningsSent++;
                
                console.log(`[SESSION_TIMER] ✅ ${warning.type} warning sent to GPU`);
                
                // Update database
                await this.updateSessionWarnings();
                
            } catch (error) {
                console.error(`[SESSION_TIMER] ❌ Failed to send ${warning.type} warning:`, error);
            }
        } else {
            console.error(`[SESSION_TIMER] ❌ AI WebSocket not available for ${warning.type} warning`);
        }
    }
    
    /**
     * Initiate the end-of-session sequence
     */
    async initiateEndSequence() {
        if (!this.isActive) return; // Already ending
        
        console.log(`[SESSION_TIMER] 🏁 Initiating end sequence for session ${this.sessionId}`);
        this.isActive = false;
        this.metrics.actualDuration = Date.now() - this.startTime;
        
        // Send final message to GPU to generate summary
        if (this.aiWs && this.aiWs.readyState === 1) {
            try {
                const endMessage = {
                    type: 'session_ending',
                    sessionId: this.sessionId,
                    finalWarning: true,
                    actualDuration: this.metrics.actualDuration,
                    timestamp: Date.now()
                };
                
                this.aiWs.send(JSON.stringify(endMessage));
                console.log(`[SESSION_TIMER] 📡 End sequence message sent to GPU`);
                
            } catch (error) {
                console.error(`[SESSION_TIMER] ❌ Failed to send end message:`, error);
            }
        }
        
        // Update session status
        await this.updateSessionStatus('ending');
        
        // Trigger end callbacks
        this.triggerEndCallbacks();
        
        // Stop monitoring
        this.stopMonitoring();
    }
    
    /**
     * Update session warnings count in database
     */
    async updateSessionWarnings() {
        try {
            await prisma.session.update({
                where: { id: this.sessionId },
                data: { warningsSent: this.metrics.warningsSent }
            });
        } catch (error) {
            console.error(`[SESSION_TIMER] ❌ Failed to update session warnings:`, error);
        }
    }
    
    /**
     * Update session status in database
     */
    async updateSessionStatus(status) {
        try {
            await prisma.session.update({
                where: { id: this.sessionId },
                data: { 
                    status: status,
                    ...(status === 'completed' && { endedAt: new Date() })
                }
            });
            console.log(`[SESSION_TIMER] 📊 Session status updated to: ${status}`);
        } catch (error) {
            console.error(`[SESSION_TIMER] ❌ Failed to update session status:`, error);
        }
    }
    
    /**
     * Add callback for when session ends
     */
    onSessionEnd(callback) {
        this.endCallbacks.push(callback);
    }
    
    /**
     * Trigger all end callbacks
     */
    triggerEndCallbacks() {
        console.log(`[SESSION_TIMER] 📞 Triggering ${this.endCallbacks.length} end callbacks`);
        this.endCallbacks.forEach(callback => {
            try {
                callback(this.sessionId, this.metrics);
            } catch (error) {
                console.error(`[SESSION_TIMER] ❌ End callback error:`, error);
            }
        });
    }
    
    /**
     * Manually end the session (coach control or early end)
     */
    async endSession(reason = 'manual') {
        if (!this.isActive) return;
        
        console.log(`[SESSION_TIMER] ⏹️ Manually ending session: ${reason}`);
        this.metrics.endedGracefully = (reason === 'manual');
        
        await this.initiateEndSequence();
    }
    
    /**
     * Pause the session timer (for coach control)
     */
    pauseTimer() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            console.log(`[SESSION_TIMER] ⏸️ Timer paused for session ${this.sessionId}`);
        }
    }
    
    /**
     * Resume the session timer
     */
    resumeTimer() {
        if (!this.monitoringInterval && this.isActive) {
            this.startMonitoring();
            console.log(`[SESSION_TIMER] ▶️ Timer resumed for session ${this.sessionId}`);
        }
    }
    
    /**
     * Stop monitoring and cleanup
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            console.log(`[SESSION_TIMER] ⏹️ Monitoring stopped for session ${this.sessionId}`);
        }
    }
    
    /**
     * Get current session metrics
     */
    getMetrics() {
        const elapsed = Date.now() - this.startTime;
        const remaining = Math.max(0, this.duration - elapsed);
        
        return {
            sessionId: this.sessionId,
            elapsed: elapsed,
            remaining: remaining,
            elapsedMinutes: Math.floor(elapsed / 60000),
            remainingMinutes: Math.floor(remaining / 60000),
            isActive: this.isActive,
            warningsSent: this.metrics.warningsSent,
            nextWarning: this.getNextWarning()
        };
    }
    
    /**
     * Get next upcoming warning
     */
    getNextWarning() {
        const elapsed = Date.now() - this.startTime;
        
        for (const warning of this.warnings) {
            if (!warning.sent && elapsed < warning.at) {
                return {
                    type: warning.type,
                    timeUntil: warning.at - elapsed,
                    minutesRemaining: warning.minutesRemaining
                };
            }
        }
        
        return null;
    }
    
    /**
     * Force cleanup (called when session disconnects unexpectedly)
     */
    cleanup() {
        console.log(`[SESSION_TIMER] 🧹 Cleaning up timer for session ${this.sessionId}`);
        this.isActive = false;
        this.stopMonitoring();
        this.metrics.clientDisconnectTime = Date.now();
    }
}

/**
 * Session Timer Manager - Manages multiple active session timers
 */
export class SessionTimerManager {
    constructor() {
        this.activeTimers = new Map(); // sessionId -> SessionTimer
        console.log('[SESSION_TIMER_MGR] 🎛️ Session Timer Manager initialized');
    }
    
    /**
     * Start timer for a session
     */
    startTimer(sessionId, aiWs, durationMinutes = 20) {
        if (this.activeTimers.has(sessionId)) {
            console.log(`[SESSION_TIMER_MGR] ⚠️ Timer already exists for session ${sessionId}`);
            return this.activeTimers.get(sessionId);
        }
        
        const timer = new SessionTimer(sessionId, aiWs, durationMinutes);
        this.activeTimers.set(sessionId, timer);
        
        // Auto-cleanup when timer ends
        timer.onSessionEnd((sessionId) => {
            this.removeTimer(sessionId);
        });
        
        console.log(`[SESSION_TIMER_MGR] ✅ Timer started for session ${sessionId}`);
        return timer;
    }
    
    /**
     * Get timer for a session
     */
    getTimer(sessionId) {
        return this.activeTimers.get(sessionId);
    }
    
    /**
     * Remove timer for a session
     */
    removeTimer(sessionId) {
        const timer = this.activeTimers.get(sessionId);
        if (timer) {
            timer.cleanup();
            this.activeTimers.delete(sessionId);
            console.log(`[SESSION_TIMER_MGR] 🗑️ Timer removed for session ${sessionId}`);
        }
    }
    
    /**
     * Get all active timers
     */
    getActiveTimers() {
        return Array.from(this.activeTimers.values());
    }
    
    /**
     * Get metrics for all active sessions
     */
    getAllMetrics() {
        const metrics = {};
        for (const [sessionId, timer] of this.activeTimers) {
            metrics[sessionId] = timer.getMetrics();
        }
        return metrics;
    }
    
    /**
     * Cleanup all timers (server shutdown)
     */
    cleanupAll() {
        console.log(`[SESSION_TIMER_MGR] 🧹 Cleaning up ${this.activeTimers.size} active timers`);
        for (const timer of this.activeTimers.values()) {
            timer.cleanup();
        }
        this.activeTimers.clear();
    }
}

// Export singleton instance
export const sessionTimerManager = new SessionTimerManager();