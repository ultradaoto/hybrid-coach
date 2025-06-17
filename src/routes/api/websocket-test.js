import express from 'express';
import { WebSocketServer } from 'ws';

const router = express.Router();

// Create a simple test WebSocket server
let testWsServer = null;

// Initialize a simple test WebSocket server
export function initTestWebSocket(server) {
  // Create a WebSocket server with noServer mode to avoid conflicts
  testWsServer = new WebSocketServer({
    noServer: true
  });

  // Register path-specific upgrade handler
  server.on('upgrade', (request, socket, head) => {
    // Only handle connections for our specific path
    if (request.url.startsWith('/ws-test')) {
      console.log(`[WebSocket Test] Handling upgrade for: ${request.url}`);
      
      testWsServer.handleUpgrade(request, socket, head, (ws) => {
        testWsServer.emit('connection', ws, request);
      });
    }
  });

  testWsServer.on('connection', (ws) => {
    console.log('[WebSocket Test] New connection established');
    
    // Send a welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      message: 'WebSocket test connection successful!'
    }));
    
    // Echo back any messages
    ws.on('message', (message) => {
      console.log('[WebSocket Test] Received message:', message.toString());
      try {
        ws.send(JSON.stringify({
          type: 'echo',
          message: message.toString()
        }));
      } catch (err) {
        console.error('[WebSocket Test] Error sending echo:', err);
      }
    });
    
    ws.on('close', () => {
      console.log('[WebSocket Test] Connection closed');
    });
  });
  
  console.log('[WebSocket Test] Server initialized on path /ws-test');
}

// API endpoint to check WebSocket server status
router.get('/status', (req, res) => {
  if (testWsServer) {
    res.json({
      status: 'ok',
      clients: testWsServer.clients.size,
      server: 'running'
    });
  } else {
    res.json({
      status: 'error',
      server: 'not initialized'
    });
  }
});

// Simple HTML page with WebSocket test client
router.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WebSocket Test</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        #log { height: 300px; border: 1px solid #ccc; padding: 10px; overflow-y: scroll; margin-top: 10px; }
        button { margin: 5px; }
      </style>
    </head>
    <body>
      <h1>WebSocket Test</h1>
      <p>This page tests basic WebSocket connectivity.</p>
      
      <div>
        <button id="connect">Connect</button>
        <button id="disconnect" disabled>Disconnect</button>
        <button id="send" disabled>Send Test Message</button>
      </div>
      
      <div>
        <h3>Connection Log:</h3>
        <div id="log"></div>
      </div>
      
      <script>
        const log = document.getElementById('log');
        const connectBtn = document.getElementById('connect');
        const disconnectBtn = document.getElementById('disconnect');
        const sendBtn = document.getElementById('send');
        
        let ws = null;
        
        function logMessage(message) {
          const div = document.createElement('div');
          div.textContent = \`\${new Date().toLocaleTimeString()}: \${message}\`;
          log.appendChild(div);
          log.scrollTop = log.scrollHeight;
        }
        
        connectBtn.addEventListener('click', () => {
          const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
          const wsUrl = \`\${protocol}\${window.location.host}/ws-test\`;
          
          logMessage(\`Connecting to \${wsUrl}...\`);
          
          try {
            ws = new WebSocket(wsUrl);
            
            ws.onopen = () => {
              logMessage('Connection established!');
              connectBtn.disabled = true;
              disconnectBtn.disabled = false;
              sendBtn.disabled = false;
            };
            
            ws.onmessage = (event) => {
              try {
                const data = JSON.parse(event.data);
                logMessage(\`Received: \${JSON.stringify(data)}\`);
              } catch (e) {
                logMessage(\`Received: \${event.data}\`);
              }
            };
            
            ws.onerror = (error) => {
              logMessage(\`Error: \${error.message || 'Unknown error'}\`);
            };
            
            ws.onclose = () => {
              logMessage('Connection closed');
              connectBtn.disabled = false;
              disconnectBtn.disabled = true;
              sendBtn.disabled = true;
            };
          } catch (e) {
            logMessage(\`Error creating WebSocket: \${e.message}\`);
          }
        });
        
        disconnectBtn.addEventListener('click', () => {
          if (ws) {
            ws.close();
            ws = null;
          }
        });
        
        sendBtn.addEventListener('click', () => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            const message = \`Test message \${Date.now()}\`;
            ws.send(message);
            logMessage(\`Sent: \${message}\`);
          } else {
            logMessage('WebSocket not connected');
          }
        });
      </script>
    </body>
    </html>
  `);
});

export { router }; 