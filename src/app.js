import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import expressLayouts from 'express-ejs-layouts';
import session from 'express-session';
import passport from 'passport';
import './config/passport.js';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
// import { initProtooSignaling } from './lib/protooSignaling.js';
import { initWebSocketRelay } from './routes/api/ws-relay.js';
import { initTestWebSocket } from './routes/api/websocket-test.js';
import { debugMiddleware } from './middlewares/debugMiddleware.js';
import { initEnhancedWebSocket } from './routes/websocket-simple-enhanced.js';
import { setupAISessionWebSocket } from './routes/ai-session-ws.js';
import { sessionSummaryHandler } from './services/SessionSummaryHandler.js';
import skoolSyncDaemon from './daemons/skoolSyncDaemon.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layout');

// Add WebSocket bypass middleware FIRST - before any other middleware
app.use((req, res, next) => {
  // Check if this is a WebSocket upgrade request or WebSocket relay request
  // Extended path check to fix 403 forbidden errors
  if (req.headers.upgrade === 'websocket' || 
      req.url.startsWith('/ws-relay') || 
      req.url.startsWith('/ai-session') ||
      req.url.includes('/ws-relay') || 
      req.url.includes('/ai-session')) {
    
    console.log(`[WS-BYPASS] WebSocket/Protoo request to ${req.url}, bypassing auth`);
    // Allow WebSocket requests to bypass auth
    req.wsRequest = true; // Mark as WebSocket request
    return next();
  }
  
  // Regular HTTP request, continue normal flow
  return next();
});

// Middlewares
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// IMPORTANT: Fix Express parsing for WebSocket endpoints
app.use((req, res, next) => {
  if (req.wsRequest) {
    // Skip body parsing for WebSockets
    return next();
  }
  next();
});

// Serve static files from both public directories
app.use(express.static(path.join(__dirname, '..', 'public'))); // Main public directory for styles.css
app.use(express.static(path.join(__dirname, 'public'))); // src/public for JS files

// 🚀 STREAMING OPTIMIZATION: Serve JavaScript modules from src/services
app.use('/src/services', express.static(path.join(__dirname, 'services')));

// 🖼️ SKOOL PROFILE PHOTOS: Serve profile photos from Skool integration
app.use('/profile-photos', express.static(path.join(__dirname, '..', 'public', 'profile-photos')));

// Add debug middleware for WebSocket requests
app.use(debugMiddleware);

// Session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'keyboard cat',
    resave: false,
    saveUninitialized: false,
  })
);

// Skip authentication for WebSocket requests
app.use((req, res, next) => {
  if (req.wsRequest) {
    return next();
  }
  
  // Apply authentication middleware only for non-WebSocket requests
  passport.initialize()(req, res, next);
});

app.use((req, res, next) => {
  if (req.wsRequest) {
    return next();
  }
  
  // Apply session middleware only for non-WebSocket requests
  passport.session()(req, res, next);
});

// Routes
import baseRouter from './routes/index.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import dashboardRouter from './routes/dashboard.js';
import coachRouter from './routes/coach.js';
import clientRouter from './routes/client.js';
import scheduleRouter from './routes/schedule.js';
import roomRouter from './routes/room.js';
import apiRouter from './routes/api.js';
import aiRouter from './routes/ai.js';
import sessionRouter from './routes/session.js';
import debugRouter from './routes/debug.js';

app.use('/', baseRouter);
app.use('/healthz', healthRouter);
app.use('/auth', authRouter);
app.use('/dashboard', dashboardRouter);
app.use('/coach', coachRouter);
app.use('/client', clientRouter);
app.use('/schedule', scheduleRouter);
app.use('/room', roomRouter);
app.use('/session', sessionRouter);
app.use('/api', apiRouter);
app.use('/api/ai', aiRouter);
app.use('/debug', debugRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found' });
});

// Start the server with error handling for port conflicts
const startServer = async (attemptPort) => {
  try {
    // Bind only to loopback by default (safer behind a reverse-proxy). Override with HOST env if needed.
    const HOST = process.env.HOST || '127.0.0.1';
    const httpServer = createServer(app);
    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"]
      },
      maxHttpBufferSize: 1e8, // Increased buffer size (100 MB)
      pingTimeout: 60000, // Increased ping timeout
      pingInterval: 25000, // Send a ping every 25 seconds
      transports: ['polling'], // Use only polling for reliable connections - CRUCIAL FIX
      allowEIO3: true, // Enable compatibility with older clients
      cookie: false, // Don't use cookies for session tracking
      connectTimeout: 30000, // 30 seconds connection timeout
      perMessageDeflate: false, // Disable WebSocket per-message-deflate to avoid issues
      httpCompression: true, // But keep HTTP compression for polling
      upgradeTimeout: 20000, // More time for upgrades from polling to WebSocket
      path: '/socket.io/',
      closeOnBeforeunload: false // Don't close WebSocket when page navigates
    });
    const roomStartTimes = new Map();


    // WebRTC signaling logic for 2-participant rooms (coach-client video)
    io.on('connection', socket => {
      console.log('[SOCK] connected', socket.id);

      socket.on('join-room', ({ roomId, name }) => {
        console.log('[SOCK] join-room', roomId, name);
        const room = io.sockets.adapter.rooms.get(roomId);
        const numClients = room ? room.size : 0;
        if (numClients >= 2) {
          socket.emit('room-full');
          return;
        }
        socket.join(roomId);
        socket.data.name = name;

        // If timer already started send to newcomer
        if (roomStartTimes.has(roomId)) {
          socket.emit('room-start', roomStartTimes.get(roomId));
        }

        if (numClients === 1) {
          // Notify existing peer
          const [existingSocketId] = room;
          const existingSocket = io.sockets.sockets.get(existingSocketId);
          socket.to(existingSocketId).emit('other-user', { socketId: socket.id, name });
          socket.emit('offer-request', existingSocketId);
          socket.emit('participant-name', { socketId: existingSocketId, name: existingSocket?.data.name });

          // Start timer when second participant joins
          if (!roomStartTimes.has(roomId)) {
            const startTs = Date.now();
            roomStartTimes.set(roomId, startTs);
            io.to(roomId).emit('room-start', startTs);
          }
        }
      });

      socket.on('signal', ({ target, signal }) => {
        console.log('[SOCK] relay signal', socket.id, '->', target, signal.type ?? 'candidate');
        io.to(target).emit('signal', { signal, sender: socket.id });
      });

      socket.on('disconnect', () => {
        console.log('[SOCK] disconnect', socket.id);
      });
    });

    // Initialize Protoo signaling for MediaSoup
    // await initProtooSignaling(httpServer);
    
    // Initialize simple WebSocket for fallback video chat (replaced by enhanced WebSocket)
    // initSimpleWebSocket(httpServer);
    
    // Initialize WebSocket relay for environments where WebRTC is blocked
    // initWebSocketRelay(httpServer);
    
    // Initialize test WebSocket server  
    // initTestWebSocket(httpServer);
    
    // Initialize Enhanced WebSocket for tri-party video calls (Coach ↔ Client ↔ AI Orb)
    initEnhancedWebSocket(httpServer);
    
    // Initialize AI Session WebSocket for hybrid coaching
    setupAISessionWebSocket(httpServer);

    httpServer.listen(attemptPort, HOST, () => {
      console.log(`🚀 Server & Socket.IO listening on http://${HOST}:${attemptPort}`);
    });

    return httpServer;
  } catch (err) {
    console.error('Error starting server:', err);
    throw err;
  }
};

// Start with the default port (skip during tests)
if (!process.env.JEST_WORKER_ID) {
  (async () => {
    const initialPort = process.env.PORT || 3000;
    const server = await startServer(initialPort);
  })();
}

export default app; 