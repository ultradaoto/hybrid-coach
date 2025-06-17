/**
 * Debug middleware to log all HTTP requests, including WebSocket upgrades
 */
export function debugMiddleware(req, res, next) {
  // Log standard HTTP requests
  console.log(`[DEBUG] ${req.method} ${req.url}`);
  
  // Special handling for WebSocket upgrade requests
  if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
    console.log(`[DEBUG] WebSocket upgrade request: ${req.url}`);
    console.log(`[DEBUG] WebSocket headers:`, JSON.stringify(req.headers, null, 2));
  }
  
  // Continue processing the request
  next();
}

export default debugMiddleware; 