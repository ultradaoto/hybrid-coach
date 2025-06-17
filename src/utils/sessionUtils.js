import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';

// Cache for session IDs to avoid redundant database queries
const sessionCache = new Map();

/**
 * Get an existing session ID for a room or create a new one
 * @param {string} roomId - The room ID to get/create a session for
 * @returns {Promise<string>} The session ID
 */
export async function getOrCreateSessionId(roomId) {
  // Check cache first
  if (sessionCache.has(roomId)) {
    return sessionCache.get(roomId);
  }
  
  try {
    // Look for an existing session for this room
    const existingSession = await prisma.session.findFirst({
      where: {
        roomId: roomId
      },
      orderBy: {
        startedAt: 'desc'
      }
    });
    
    if (existingSession) {
      // Cache the result
      sessionCache.set(roomId, existingSession.id);
      return existingSession.id;
    }
    
    // Create a new session
    const sessionId = uuidv4();
    
    await prisma.session.create({
      data: {
        id: sessionId,
        roomId: roomId,
        status: 'active'
      }
    });
    
    // Cache the result
    sessionCache.set(roomId, sessionId);
    return sessionId;
  } catch (err) {
    console.error('Error in getOrCreateSessionId:', err);
    // Return a fallback session ID if database access fails
    return uuidv4();
  }
} 