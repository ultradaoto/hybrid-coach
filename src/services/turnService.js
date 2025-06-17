import twilio from 'twilio';

/**
 * Fetches ICE servers (STUN/TURN) from Twilio's Network Traversal Service
 * These credentials will expire after 24 hours
 */
export async function getTwilioIceServers() {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!accountSid || !authToken) {
      console.warn('Twilio credentials not configured. Using public STUN servers only.');
      return getPublicStunServers();
    }
    
    const client = twilio(accountSid, authToken);
    const token = await client.tokens.create();
    
    console.log('Successfully retrieved Twilio ICE servers');
    return token.iceServers;
  } catch (err) {
    console.error('Error getting Twilio ICE servers:', err);
    // Fallback to public STUN servers if Twilio fails
    return getPublicStunServers();
  }
}

/**
 * Provides public STUN servers as a fallback
 */
function getPublicStunServers() {
  return [
    // Google STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    
    // Other public STUN servers for redundancy
    { urls: 'stun:stun.ekiga.net' },
    { urls: 'stun:stun.ideasip.com' },
    { urls: 'stun:stun.schlund.de' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.voiparound.com' },
    { urls: 'stun:stun.voipbuster.com' },
    { urls: 'stun:stun.1und1.de:3478' },
    
    // Add mDNS candidate
    { urls: 'stun:[fe80::1]' }
  ];
} 