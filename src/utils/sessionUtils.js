import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';

// Cache for session IDs to avoid redundant database queries
const sessionCache = new Map();

/**
 * Get an existing session ID for a room or create a new one
 * This function only returns a session ID for coordination purposes.
 * The actual session records are created by the room route with proper appointment/user relations.
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
    
    // Don't create a session record here - just return a UUID for coordination
    // The actual session record will be created by the room route with proper relations
    const sessionId = uuidv4();
    
    // Cache the ID for consistency
    sessionCache.set(roomId, sessionId);
    return sessionId;
  } catch (err) {
    console.error('Error in getOrCreateSessionId:', err);
    // Return a fallback session ID if database access fails
    return uuidv4();
  }
} 