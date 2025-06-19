import { prisma } from '../lib/prisma.js';
import { orbManager } from './OrbManager.js';

/**
 * SessionSummaryHandler - Processes session summaries from AI Orbs
 * 
 * Responsibilities:
 * - Receive session summaries from AI orbs
 * - Update client profiles with session data
 * - Store session records and transcripts
 * - Prepare context for next sessions
 */
export class SessionSummaryHandler {
    constructor() {
        // Listen for session summaries from OrbManager
        orbManager.on('session_summary', this.handleSessionSummary.bind(this));
        
        console.log('[SessionSummaryHandler] Initialized and listening for summaries');
    }

    /**
     * Process session summary from AI Orb
     */
    async handleSessionSummary(data) {
        console.log(`[SessionSummaryHandler] Processing summary for room ${data.roomId}`);
        
        try {
            const {
                roomId,
                sessionId,
                clientId,
                coachId,
                summary
            } = data;

            // Validate required fields
            if (!clientId || !sessionId || !summary) {
                throw new Error('Missing required fields in session summary');
            }

            // Start transaction for atomic updates
            const result = await prisma.$transaction(async (tx) => {
                // 1. Update session record
                const session = await this.updateSessionRecord(tx, sessionId, summary);
                
                // 2. Update client profile
                const profile = await this.updateClientProfile(tx, clientId, summary);
                
                // 3. Create session summary record
                const summaryRecord = await this.createSummaryRecord(tx, {
                    sessionId,
                    clientId,
                    coachId,
                    summary
                });
                
                // 4. Store conversation transcript if available
                if (summary.transcript && summary.transcript.length > 0) {
                    await this.storeTranscript(tx, sessionId, summary.transcript);
                }
                
                return { session, profile, summaryRecord };
            });

            console.log(`[SessionSummaryHandler] ✅ Successfully processed summary for client ${clientId}`);
            
            // Emit success event
            this.emit('summary_processed', {
                roomId,
                sessionId,
                clientId,
                result
            });

        } catch (err) {
            console.error('[SessionSummaryHandler] ❌ Failed to process session summary:', err);
            
            // Emit error event
            this.emit('summary_error', {
                roomId: data.roomId,
                sessionId: data.sessionId,
                error: err.message
            });
        }
    }

    /**
     * Update session record with completion data
     */
    async updateSessionRecord(tx, sessionId, summary) {
        return await tx.session.update({
            where: { id: sessionId },
            data: {
                endedAt: new Date(),
                status: 'completed',
                duration: summary.duration || null,
                metadata: {
                    keyTopics: summary.keyTopics || [],
                    progress: summary.progress || '',
                    completedSuccessfully: true
                }
            }
        });
    }

    /**
     * Update client profile with session insights
     */
    async updateClientProfile(tx, clientId, summary) {
        // Get existing profile
        const existingProfile = await tx.profile.findUnique({
            where: { userId: clientId }
        });

        // Merge new insights with existing data
        const updatedClientFacts = this.mergeClientFacts(
            existingProfile?.clientFacts || [],
            summary.newInsights || []
        );

        const updatedChallenges = this.mergeChallenges(
            existingProfile?.challenges || [],
            summary.identifiedChallenges || []
        );

        // Update profile
        return await tx.profile.upsert({
            where: { userId: clientId },
            create: {
                userId: clientId,
                clientFacts: updatedClientFacts,
                challenges: updatedChallenges,
                lastSummary: summary.summary || summary.progress,
                contextNotes: summary.nextSessionNotes || summary.recommendations,
                preferences: summary.preferences || {},
                lastSessionDate: new Date()
            },
            update: {
                clientFacts: updatedClientFacts,
                challenges: updatedChallenges,
                lastSummary: summary.summary || summary.progress,
                contextNotes: summary.nextSessionNotes || summary.recommendations,
                preferences: summary.preferences || existingProfile?.preferences || {},
                lastSessionDate: new Date(),
                updatedAt: new Date()
            }
        });
    }

    /**
     * Create detailed session summary record
     */
    async createSummaryRecord(tx, data) {
        const { sessionId, clientId, coachId, summary } = data;

        // Check if sessionSummary model exists, if not store in session metadata
        try {
            return await tx.sessionSummary.create({
            data: {
                sessionId,
                clientId,
                coachId,
                duration: summary.duration || 0,
                keyTopics: summary.keyTopics || [],
                progress: summary.progress || '',
                challenges: summary.identifiedChallenges || [],
                breakthroughs: summary.breakthroughs || [],
                recommendations: summary.recommendations || '',
                nextSessionNotes: summary.nextSessionNotes || '',
                coachingTechniques: summary.coachingTechniques || [],
                clientMood: summary.clientMood || 'neutral',
                engagementLevel: summary.engagementLevel || 'medium',
                actionItems: summary.actionItems || [],
                metadata: {
                    aiModel: summary.aiModel || 'gpt-4',
                    transcriptLength: summary.transcript?.length || 0,
                    generatedAt: new Date().toISOString()
                }
            }
        });
        } catch (err) {
            // If sessionSummary model doesn't exist, store in session metadata instead
            console.log('[SessionSummaryHandler] SessionSummary model not found, storing in session metadata');
            return await tx.session.update({
                where: { id: sessionId },
                data: {
                    metadata: {
                        ...summary,
                        summaryGeneratedAt: new Date().toISOString()
                    }
                }
            });
        }
    }

    /**
     * Store conversation transcript
     */
    async storeTranscript(tx, sessionId, transcript) {
        try {
            // Store transcript entries in batches for efficiency
            const batchSize = 100;
            const batches = [];
            
            for (let i = 0; i < transcript.length; i += batchSize) {
                const batch = transcript.slice(i, i + batchSize);
                batches.push(batch);
            }

            for (const [index, batch] of batches.entries()) {
                const transcriptEntries = batch.map((entry, idx) => ({
                    sessionId,
                    speaker: entry.speaker || 'unknown',
                    content: entry.content || entry.text || '',
                    timestamp: entry.timestamp || new Date(Date.now() + (index * batchSize + idx) * 1000),
                    metadata: entry.metadata || {}
                }));

                await tx.transcript.createMany({
                    data: transcriptEntries
                });
            }

            console.log(`[SessionSummaryHandler] Stored ${transcript.length} transcript entries`);
        } catch (err) {
            // If transcript model doesn't exist, store in session metadata
            console.log('[SessionSummaryHandler] Transcript model not found, storing in session metadata');
            await tx.session.update({
                where: { id: sessionId },
                data: {
                    metadata: {
                        transcript: transcript,
                        transcriptStoredAt: new Date().toISOString()
                    }
                }
            });
            console.log(`[SessionSummaryHandler] Stored transcript in session metadata`);
        }
    }

    /**
     * Merge new client facts with existing ones
     */
    mergeClientFacts(existing, newFacts) {
        const factMap = new Map();
        
        // Add existing facts
        existing.forEach(fact => {
            if (typeof fact === 'string') {
                factMap.set(fact.toLowerCase(), fact);
            } else if (fact.fact) {
                factMap.set(fact.fact.toLowerCase(), fact);
            }
        });
        
        // Add new facts (avoiding duplicates)
        newFacts.forEach(fact => {
            const factText = typeof fact === 'string' ? fact : fact.fact;
            if (factText && !factMap.has(factText.toLowerCase())) {
                factMap.set(factText.toLowerCase(), {
                    fact: factText,
                    addedDate: new Date().toISOString(),
                    source: 'ai_session'
                });
            }
        });
        
        return Array.from(factMap.values());
    }

    /**
     * Merge challenges, updating progress on existing ones
     */
    mergeChallenges(existing, identified) {
        const challengeMap = new Map();
        
        // Add existing challenges
        existing.forEach(challenge => {
            const key = typeof challenge === 'string' ? 
                challenge.toLowerCase() : 
                challenge.description?.toLowerCase();
            
            challengeMap.set(key, challenge);
        });
        
        // Update or add identified challenges
        identified.forEach(challenge => {
            const desc = typeof challenge === 'string' ? 
                challenge : 
                challenge.description;
            
            if (desc) {
                const key = desc.toLowerCase();
                const existing = challengeMap.get(key);
                
                if (existing && typeof existing === 'object') {
                    // Update existing challenge
                    challengeMap.set(key, {
                        ...existing,
                        status: challenge.status || existing.status || 'active',
                        progress: challenge.progress || existing.progress,
                        lastUpdated: new Date().toISOString()
                    });
                } else {
                    // Add new challenge
                    challengeMap.set(key, {
                        description: desc,
                        status: challenge.status || 'active',
                        identifiedDate: new Date().toISOString(),
                        source: 'ai_session'
                    });
                }
            }
        });
        
        return Array.from(challengeMap.values());
    }

    /**
     * Get session context for next session
     */
    async getSessionContext(clientId) {
        try {
            // Get client profile
            const profile = await prisma.profile.findUnique({
                where: { userId: clientId },
                include: {
                    user: {
                        select: {
                            displayName: true,
                            email: true
                        }
                    }
                }
            });

            if (!profile) {
                return null;
            }

            // Get recent session summaries
            const recentSummaries = await prisma.sessionSummary.findMany({
                where: { clientId },
                orderBy: { createdAt: 'desc' },
                take: 3,
                select: {
                    progress: true,
                    keyTopics: true,
                    recommendations: true,
                    nextSessionNotes: true,
                    createdAt: true
                }
            });

            // Build context object
            const context = {
                clientName: profile.user.displayName || 'Client',
                clientFacts: profile.clientFacts || [],
                challenges: profile.challenges || [],
                lastSummary: profile.lastSummary,
                contextNotes: profile.contextNotes,
                preferences: profile.preferences || {},
                recentProgress: recentSummaries.map(s => ({
                    date: s.createdAt,
                    progress: s.progress,
                    topics: s.keyTopics
                })),
                sessionHistory: recentSummaries.length,
                lastSessionDate: profile.lastSessionDate
            };

            return context;
        } catch (err) {
            console.error('[SessionSummaryHandler] Failed to get session context:', err);
            return null;
        }
    }

    /**
     * Get summary statistics for a client
     */
    async getClientStats(clientId) {
        try {
            const stats = await prisma.sessionSummary.groupBy({
                by: ['clientId'],
                where: { clientId },
                _count: {
                    id: true
                },
                _avg: {
                    duration: true,
                    engagementLevel: true
                }
            });

            const topTopics = await prisma.sessionSummary.findMany({
                where: { clientId },
                select: { keyTopics: true }
            });

            // Aggregate topics
            const topicCounts = {};
            topTopics.forEach(session => {
                session.keyTopics.forEach(topic => {
                    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
                });
            });

            return {
                totalSessions: stats[0]?._count?.id || 0,
                avgDuration: stats[0]?._avg?.duration || 0,
                avgEngagement: stats[0]?._avg?.engagementLevel || 0,
                topTopics: Object.entries(topicCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([topic, count]) => ({ topic, count }))
            };
        } catch (err) {
            console.error('[SessionSummaryHandler] Failed to get client stats:', err);
            return null;
        }
    }

    /**
     * EventEmitter functionality
     */
    emit(event, data) {
        // In production, this would emit to an event bus
        console.log(`[SessionSummaryHandler] Event: ${event}`, data);
    }
}

// Create singleton instance
export const sessionSummaryHandler = new SessionSummaryHandler();

/**
 * Expected Session Summary Format from AI Orb:
 * 
 * {
 *   duration: number,              // Session duration in milliseconds
 *   keyTopics: string[],          // Main topics discussed
 *   progress: string,             // Overall progress assessment
 *   identifiedChallenges: [],     // New or updated challenges
 *   breakthroughs: string[],      // Significant moments
 *   recommendations: string,       // Recommendations for client
 *   nextSessionNotes: string,     // Notes for next session
 *   newInsights: string[],        // New facts about client
 *   preferences: object,          // Updated preferences
 *   clientMood: string,           // Overall mood assessment
 *   engagementLevel: string,      // high/medium/low
 *   actionItems: string[],        // Homework or actions
 *   coachingTechniques: string[], // Techniques used
 *   transcript: [{                // Full conversation
 *     speaker: string,
 *     content: string,
 *     timestamp: Date
 *   }]
 * }
 */