import express from 'express';

const router = express.Router();

// Simple HTML page with WebSocket test client for direct testing
router.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Direct WebSocket Test</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        #log { height: 300px; border: 1px solid #ccc; padding: 10px; overflow-y: scroll; margin-top: 10px; }
        button { margin: 5px; }
        .error { color: red; }
        .success { color: green; }
        video, canvas { border: 1px solid #ccc; margin: 10px 0; }
      </style>
    </head>
    <body>
      <h1>Direct WebSocket Relay Test</h1>
      <p>This page directly tests the WebSocket relay for video frames without any authentication.</p>
      
      <div>
        <button id="connectBtn">Connect WebSocket</button>
        <button id="cameraBtn">Start Camera</button>
        <button id="sendFrameBtn" disabled>Send Test Frame</button>
        <button id="disconnectBtn" disabled>Disconnect</button>
      </div>
      
      <div style="display: flex; margin-top: 20px;">
        <div style="margin-right: 20px;">
          <h3>Local Camera:</h3>
          <video id="localVideo" width="320" height="240" autoplay muted playsinline></video>
        </div>
        <div>
          <h3>Received Frame:</h3>
          <canvas id="remoteCanvas" width="320" height="240"></canvas>
        </div>
      </div>
      
      <div>
        <h3>Connection Log:</h3>
        <div id="log"></div>
      </div>
      
      <script>
        // DOM elements
        const log = document.getElementById('log');
        const connectBtn = document.getElementById('connectBtn');
        const cameraBtn = document.getElementById('cameraBtn');
        const sendFrameBtn = document.getElementById('sendFrameBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        const localVideo = document.getElementById('localVideo');
        const remoteCanvas = document.getElementById('remoteCanvas');
        const canvasCtx = remoteCanvas.getContext('2d');
        
        let ws = null;
        let cameraStream = null;
        const roomId = 'direct-test-' + Math.floor(Math.random() * 1000000);
        const peerId = 'peer-' + Math.floor(Math.random() * 1000000);
        
        function logMessage(message, isError = false) {
          const div = document.createElement('div');
          div.textContent = \`\${new Date().toLocaleTimeString()}: \${message}\`;
          if (isError) {
            div.className = 'error';
          } else if (message.includes('success') || message.includes('connected')) {
            div.className = 'success';
          }
          log.appendChild(div);
          log.scrollTop = log.scrollHeight;
        }
        
        // Connect to WebSocket
        connectBtn.addEventListener('click', () => {
          const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
          const wsUrl = \`\${protocol}\${window.location.host}/ws-relay\`;
          
          logMessage(\`Connecting to \${wsUrl}...\`);
          
          try {
            ws = new WebSocket(wsUrl);
            
            ws.onopen = () => {
              logMessage('WebSocket connection established!');
              connectBtn.disabled = true;
              disconnectBtn.disabled = false;
              
              // Join a room
              ws.send(JSON.stringify({
                type: 'join',
                roomId: roomId,
                peerId: peerId,
                userRole: 'tester'
              }));
              logMessage(\`Joined room: \${roomId} as peer: \${peerId}\`);
              
              // Enable send frame button if camera is active
              if (cameraStream) {
                sendFrameBtn.disabled = false;
              }
            };
            
            ws.onmessage = (event) => {
              try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'welcome') {
                  logMessage(\`Server says: \${data.message}\`);
                }
                else if (data.type === 'videoFrame') {
                  logMessage(\`Received video frame from peer: \${data.peerId}\`);
                  
                  // Display the frame
                  const img = new Image();
                  img.onload = () => {
                    canvasCtx.drawImage(img, 0, 0, remoteCanvas.width, remoteCanvas.height);
                  };
                  img.src = \`data:image/jpeg;base64,\${data.data}\`;
                }
                else if (data.type === 'userJoined') {
                  logMessage(\`User joined: \${data.peerId}\`);
                }
                else if (data.type === 'userLeft') {
                  logMessage(\`User left: \${data.peerId}\`);
                }
                else {
                  logMessage(\`Received message: \${JSON.stringify(data)}\`);
                }
              } catch (err) {
                logMessage(\`Error parsing message: \${err.message}\`, true);
              }
            };
            
            ws.onclose = (event) => {
              logMessage(\`Connection closed: \${event.code} - \${event.reason || 'No reason'}\`);
              connectBtn.disabled = false;
              disconnectBtn.disabled = true;
              sendFrameBtn.disabled = true;
            };
            
            ws.onerror = (error) => {
              logMessage(\`WebSocket error: \${error.message || 'Unknown error'}\`, true);
            };
          } catch (err) {
            logMessage(\`Error creating WebSocket: \${err.message}\`, true);
          }
        });
        
        // Start camera
        cameraBtn.addEventListener('click', async () => {
          try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 320 },
                height: { ideal: 240 }
              },
              audio: false
            });
            
            localVideo.srcObject = cameraStream;
            logMessage('Camera started successfully');
            
            // Enable send frame button if WebSocket is connected
            if (ws && ws.readyState === WebSocket.OPEN) {
              sendFrameBtn.disabled = false;
            }
          } catch (err) {
            logMessage(\`Camera error: \${err.message}\`, true);
          }
        });
        
        // Send a video frame
        sendFrameBtn.addEventListener('click', () => {
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            logMessage('WebSocket not connected', true);
            return;
          }
          
          if (!cameraStream) {
            logMessage('Camera not started', true);
            return;
          }
          
          try {
            // Create a canvas to capture the video frame
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 240;
            const ctx = canvas.getContext('2d');
            
            // Draw the current video frame
            ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
            
            // Convert to JPEG and send
            canvas.toBlob((blob) => {
              if (!blob) {
                logMessage('Failed to capture frame', true);
                return;
              }
              
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64data = reader.result.split(',')[1];
                ws.send(JSON.stringify({
                  type: 'videoFrame',
                  data: base64data,
                  roomId: roomId,
                  peerId: peerId
                }));
                logMessage('Sent video frame');
              };
              reader.readAsDataURL(blob);
            }, 'image/jpeg', 0.7);
          } catch (err) {
            logMessage(\`Error sending frame: \${err.message}\`, true);
          }
        });
        
        // Disconnect
        disconnectBtn.addEventListener('click', () => {
          if (ws) {
            ws.close();
            ws = null;
            logMessage('Disconnected from WebSocket');
          }
          
          connectBtn.disabled = false;
          disconnectBtn.disabled = true;
          sendFrameBtn.disabled = true;
        });
      </script>
    </body>
    </html>
  `);
});

export { router }; 