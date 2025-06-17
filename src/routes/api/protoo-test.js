import express from 'express';

const router = express.Router();

// Simple HTML page with WebSocket test client specific for protoo
router.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Protoo WebSocket Test</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        #log { height: 300px; border: 1px solid #ccc; padding: 10px; overflow-y: scroll; margin-top: 10px; }
        button { margin: 5px; }
        .error { color: red; }
        .success { color: green; }
      </style>
    </head>
    <body>
      <h1>Protoo WebSocket Test</h1>
      <p>This page tests connectivity to the protoo WebSocket server.</p>
      
      <div>
        <input id="roomId" placeholder="Room ID" value="test-room-123">
        <input id="peerId" placeholder="Peer ID" value="test-peer-123">
        <button id="connect">Connect</button>
        <button id="disconnect" disabled>Disconnect</button>
      </div>
      
      <div>
        <h3>Connection Log:</h3>
        <div id="log"></div>
      </div>
      
      <script>
        const log = document.getElementById('log');
        const connectBtn = document.getElementById('connect');
        const disconnectBtn = document.getElementById('disconnect');
        const roomIdInput = document.getElementById('roomId');
        const peerIdInput = document.getElementById('peerId');
        
        let ws = null;
        
        function logMessage(message, isError = false) {
          const div = document.createElement('div');
          div.textContent = \`\${new Date().toLocaleTimeString()}: \${message}\`;
          if (isError) {
            div.className = 'error';
          } else if (message.includes('success') || message.includes('established')) {
            div.className = 'success';
          }
          log.appendChild(div);
          log.scrollTop = log.scrollHeight;
        }
        
        connectBtn.addEventListener('click', () => {
          const roomId = roomIdInput.value.trim();
          const peerId = peerIdInput.value.trim();
          
          if (!roomId || !peerId) {
            logMessage('Please enter both Room ID and Peer ID', true);
            return;
          }
          
          const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
          const wsUrl = \`\${protocol}\${window.location.host}/protoo?roomId=\${roomId}&peerId=\${peerId}\`;
          
          logMessage(\`Connecting to \${wsUrl}...\`);
          
          try {
            ws = new WebSocket(wsUrl);
            
            ws.onopen = () => {
              logMessage('Connection established!');
              connectBtn.disabled = true;
              disconnectBtn.disabled = false;
              
              // Send a ping message
              const pingMessage = {
                request: true,
                id: 1,
                method: 'ping',
                data: { timestamp: Date.now() }
              };
              try {
                ws.send(JSON.stringify(pingMessage));
                logMessage('Sent ping message');
              } catch (e) {
                logMessage(\`Error sending ping: \${e.message}\`, true);
              }
            };
            
            ws.onmessage = (event) => {
              try {
                const data = JSON.parse(event.data);
                logMessage(\`Received: \${JSON.stringify(data)}\`);
                
                // If we receive a ping request, send a response
                if (data.request && data.method === 'ping') {
                  const response = {
                    response: true,
                    id: data.id,
                    ok: true,
                    data: { timestamp: Date.now() }
                  };
                  ws.send(JSON.stringify(response));
                  logMessage('Responded to ping request');
                }
              } catch (e) {
                logMessage(\`Error parsing message: \${e.message}\`, true);
                logMessage(\`Raw data: \${event.data}\`);
              }
            };
            
            ws.onerror = (error) => {
              logMessage(\`Error: \${error.message || 'Unknown error'}\`, true);
            };
            
            ws.onclose = (event) => {
              logMessage(\`Connection closed: Code \${event.code} - \${event.reason || 'No reason'}\`);
              connectBtn.disabled = false;
              disconnectBtn.disabled = true;
            };
          } catch (e) {
            logMessage(\`Error creating WebSocket: \${e.message}\`, true);
          }
        });
        
        disconnectBtn.addEventListener('click', () => {
          if (ws) {
            ws.close();
            ws = null;
          }
        });
      </script>
    </body>
    </html>
  `);
});

export { router }; 