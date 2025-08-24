import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Skool Authentication Service
 * Handles code generation, validation, session management, and rate limiting
 */
class AuthService {
    /**
     * Generate a unique authentication code for a Skool user
     * @param {string} skoolUserId - User ID from Skool
     * @param {string} skoolUsername - Display name from Skool
     * @returns {Promise<{code: string, expiresAt: Date}>}
     */
    async generateAuthCode(skoolUserId, skoolUsername) {
        try {
            // Check if database is available (for local development)
            let rateLimitCheck = { allowed: true, remaining: 5 };
            try {
                rateLimitCheck = await this.checkDailyLimit(skoolUserId);
                if (!rateLimitCheck.allowed) {
                    throw new Error(`Daily limit exceeded. You can request ${rateLimitCheck.remaining} more codes. Resets in ${rateLimitCheck.resetHours} hours.`);
                }
            } catch (dbError) {
                if (process.env.NODE_ENV === 'development') {
                    console.log('🛠️ Database not available in development - using fallback rate limiting');
                } else {
                    throw dbError; // Re-throw in production
                }
            }

            // Generate unique code: vgs-{timestamp}-{random}
            const timestamp = Date.now();
            const randomBytes = crypto.randomBytes(6).toString('hex');
            const code = `vgs-${timestamp}-${randomBytes}`;

            // Set expiration (30 minutes from now)
            const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

            // Store in database (with fallback for development)
            let authCode = null;
            try {
                authCode = await prisma.authCode.create({
                    data: {
                        code,
                        skoolUserId,
                        skoolUsername,
                        expiresAt
                    }
                });

                // Update rate limiting
                await this.incrementRequestCount(skoolUserId);
            } catch (dbError) {
                if (process.env.NODE_ENV === 'development') {
                    console.log('🛠️ Database not available - using in-memory auth code');
                    authCode = {
                        code,
                        skoolUserId,
                        skoolUsername,
                        expiresAt,
                        createdAt: new Date()
                    };
                } else {
                    throw dbError; // Re-throw in production
                }
            }

            console.log(`🔑 Generated auth code for ${skoolUsername} (${skoolUserId}): ${code}`);
            
            return {
                code: authCode.code,
                expiresAt: authCode.expiresAt
            };

        } catch (error) {
            console.error('❌ Error generating auth code:', error);
            throw error;
        }
    }

    /**
     * Validate an authentication code and check all security requirements
     * @param {string} code - The auth code to validate
     * @param {string} ipAddress - Client IP address
     * @param {string} userAgent - Client browser info
     * @returns {Promise<{valid: boolean, authData?: object, error?: string}>}
     */
    async validateAuthCode(code, ipAddress, userAgent) {
        try {
            // Look up the code
            const authCode = await prisma.authCode.findUnique({
                where: { code },
                include: { userSessions: true }
            });

            if (!authCode) {
                return { valid: false, error: 'Invalid access code. Please request a new one.' };
            }

            if (!authCode.isActive) {
                return { valid: false, error: 'This access code has been disabled.' };
            }

            if (authCode.usedAt) {
                return { valid: false, error: 'This link has already been used. Request a new one if needed.' };
            }

            if (new Date() > authCode.expiresAt) {
                return { valid: false, error: 'This link has expired. DM @MyUltraCoach for a new one.' };
            }

            // Generate device fingerprint
            const deviceFingerprint = this.generateDeviceFingerprint(ipAddress, userAgent);

            return {
                valid: true,
                authData: {
                    skoolUserId: authCode.skoolUserId,
                    skoolUsername: authCode.skoolUsername,
                    code: authCode.code,
                    deviceFingerprint,
                    ipAddress,
                    userAgent
                }
            };

        } catch (error) {
            console.error('❌ Error validating auth code:', error);
            return { valid: false, error: 'Authentication service error. Please try again.' };
        }
    }

    /**
     * Mark an auth code as used and create a user session
     * @param {string} code - The auth code that was used
     * @param {object} authData - Authentication data from validation
     * @returns {Promise<{sessionId: string, expiresAt: Date}>}
     */
    async createUserSession(code, authData) {
        try {
            // Generate secure session ID
            const sessionId = crypto.randomBytes(32).toString('hex');
            
            // Set session expiration (30 days)
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            // Start transaction to mark code as used and create session
            const result = await prisma.$transaction(async (tx) => {
                // Mark auth code as used
                await tx.authCode.update({
                    where: { code },
                    data: {
                        usedAt: new Date(),
                        usedIpAddress: authData.ipAddress,
                        userAgent: authData.userAgent,
                        deviceFingerprint: authData.deviceFingerprint
                    }
                });

                // Create user session
                const session = await tx.userSession.create({
                    data: {
                        sessionId,
                        skoolUserId: authData.skoolUserId,
                        skoolUsername: authData.skoolUsername,
                        authCodeUsed: code,
                        expiresAt,
                        ipAddress: authData.ipAddress,
                        userAgent: authData.userAgent,
                        deviceFingerprint: authData.deviceFingerprint
                    }
                });

                return session;
            });

            console.log(`✅ Created session for ${authData.skoolUsername}: ${sessionId}`);
            
            return {
                sessionId: result.sessionId,
                expiresAt: result.expiresAt,
                userData: {
                    skoolUserId: result.skoolUserId,
                    skoolUsername: result.skoolUsername
                }
            };

        } catch (error) {
            console.error('❌ Error creating user session:', error);
            throw new Error('Failed to create user session');
        }
    }

    /**
     * Validate an existing user session
     * @param {string} sessionId - Session ID from cookie
     * @param {string} ipAddress - Current client IP
     * @param {string} userAgent - Current client browser info
     * @returns {Promise<{valid: boolean, userData?: object, error?: string}>}
     */
    async validateSession(sessionId, ipAddress, userAgent) {
        try {
            if (!sessionId) {
                return { valid: false, error: 'No session found' };
            }

            const session = await prisma.userSession.findUnique({
                where: { sessionId }
            });

            if (!session) {
                return { valid: false, error: 'Invalid session' };
            }

            if (!session.isActive) {
                return { valid: false, error: 'Session has been revoked' };
            }

            if (new Date() > session.expiresAt) {
                // Auto-cleanup expired session
                await this.revokeSession(sessionId);
                return { valid: false, error: 'Session has expired' };
            }

            // Optional: Check device fingerprint for additional security
            const currentFingerprint = this.generateDeviceFingerprint(ipAddress, userAgent);
            if (session.deviceFingerprint !== currentFingerprint) {
                console.warn(`⚠️ Device fingerprint mismatch for session ${sessionId}`);
                // Could be strict and revoke, but allowing for now to support mobile users
            }

            // Update last active timestamp
            await prisma.userSession.update({
                where: { sessionId },
                data: { lastActive: new Date() }
            });

            return {
                valid: true,
                userData: {
                    skoolUserId: session.skoolUserId,
                    skoolUsername: session.skoolUsername,
                    sessionId: session.sessionId,
                    lastActive: session.lastActive
                }
            };

        } catch (error) {
            console.error('❌ Error validating session:', error);
            return { valid: false, error: 'Session validation error' };
        }
    }

    /**
     * Revoke a user session (logout)
     * @param {string} sessionId - Session ID to revoke
     * @returns {Promise<boolean>}
     */
    async revokeSession(sessionId) {
        try {
            await prisma.userSession.update({
                where: { sessionId },
                data: { isActive: false }
            });
            
            console.log(`🔓 Revoked session: ${sessionId}`);
            return true;
        } catch (error) {
            console.error('❌ Error revoking session:', error);
            return false;
        }
    }

    /**
     * Check daily rate limit for a user
     * @param {string} skoolUserId - User ID from Skool
     * @returns {Promise<{allowed: boolean, remaining: number, resetHours: number}>}
     */
    async checkDailyLimit(skoolUserId) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Start of day

            const rateLimit = await prisma.rateLimit.findUnique({
                where: {
                    skoolUserId_requestDate: {
                        skoolUserId,
                        requestDate: today
                    }
                }
            });

            const maxRequestsPerDay = 5;
            const currentCount = rateLimit ? rateLimit.requestCount : 0;
            const remaining = Math.max(0, maxRequestsPerDay - currentCount);
            
            // Calculate hours until reset (next day)
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const resetHours = Math.ceil((tomorrow - new Date()) / (1000 * 60 * 60));

            return {
                allowed: currentCount < maxRequestsPerDay,
                remaining,
                resetHours,
                currentCount
            };

        } catch (error) {
            console.error('❌ Error checking daily limit:', error);
            // Allow request if there's an error (fail open)
            return { allowed: true, remaining: 5, resetHours: 24 };
        }
    }

    /**
     * Increment the request count for rate limiting
     * @param {string} skoolUserId - User ID from Skool
     * @returns {Promise<void>}
     */
    async incrementRequestCount(skoolUserId) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Start of day

            await prisma.rateLimit.upsert({
                where: {
                    skoolUserId_requestDate: {
                        skoolUserId,
                        requestDate: today
                    }
                },
                update: {
                    requestCount: { increment: 1 },
                    lastRequestAt: new Date()
                },
                create: {
                    skoolUserId,
                    requestDate: today,
                    requestCount: 1,
                    lastRequestAt: new Date()
                }
            });

        } catch (error) {
            console.error('❌ Error incrementing request count:', error);
        }
    }

    /**
     * Generate a device fingerprint for session binding
     * @param {string} ipAddress - Client IP address
     * @param {string} userAgent - Client browser info
     * @returns {string} Device fingerprint hash
     */
    generateDeviceFingerprint(ipAddress, userAgent) {
        const fingerprint = `${ipAddress}|${userAgent}`;
        return crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 16);
    }

    /**
     * Get authentication statistics for monitoring
     * @param {number} days - Number of days to look back
     * @returns {Promise<object>} Statistics object
     */
    async getAuthStats(days = 7) {
        try {
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

            const [codesGenerated, codesUsed, activeSessions] = await Promise.all([
                prisma.authCode.count({
                    where: { generatedAt: { gte: since } }
                }),
                prisma.authCode.count({
                    where: { 
                        generatedAt: { gte: since },
                        usedAt: { not: null }
                    }
                }),
                prisma.userSession.count({
                    where: { 
                        isActive: true,
                        expiresAt: { gt: new Date() }
                    }
                })
            ]);

            return {
                codesGenerated,
                codesUsed,
                activeSessions,
                conversionRate: codesGenerated > 0 ? (codesUsed / codesGenerated * 100).toFixed(1) : 0,
                period: `${days} days`
            };

        } catch (error) {
            console.error('❌ Error getting auth stats:', error);
            return null;
        }
    }

    /**
     * Cleanup expired codes and sessions (run as a scheduled job)
     * @returns {Promise<{codesCleanedUp: number, sessionsCleanedUp: number}>}
     */
    async cleanupExpiredAuth() {
        try {
            const now = new Date();

            const [expiredCodes, expiredSessions] = await Promise.all([
                prisma.authCode.deleteMany({
                    where: {
                        OR: [
                            { expiresAt: { lt: now } },
                            { usedAt: { not: null, lt: new Date(now - 7 * 24 * 60 * 60 * 1000) } } // Used codes older than 7 days
                        ]
                    }
                }),
                prisma.userSession.updateMany({
                    where: { expiresAt: { lt: now } },
                    data: { isActive: false }
                })
            ]);

            console.log(`🧹 Cleaned up ${expiredCodes.count} expired codes and ${expiredSessions.count} expired sessions`);
            
            return {
                codesCleanedUp: expiredCodes.count,
                sessionsCleanedUp: expiredSessions.count
            };

        } catch (error) {
            console.error('❌ Error during cleanup:', error);
            return { codesCleanedUp: 0, sessionsCleanedUp: 0 };
        }
    }
}

export default new AuthService();
