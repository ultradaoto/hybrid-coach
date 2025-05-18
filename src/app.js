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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layout');

// Middlewares
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'keyboard cat',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Routes
import baseRouter from './routes/index.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import dashboardRouter from './routes/dashboard.js';
import coachRouter from './routes/coach.js';
import scheduleRouter from './routes/schedule.js';
import roomRouter from './routes/room.js';
import apiRouter from './routes/api.js';

app.use('/', baseRouter);
app.use('/healthz', healthRouter);
app.use('/auth', authRouter);
app.use('/dashboard', dashboardRouter);
app.use('/coach', coachRouter);
app.use('/schedule', scheduleRouter);
app.use('/room', roomRouter);
app.use('/api', apiRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found' });
});

// Start server & Socket.IO (skip during tests)
if (!process.env.JEST_WORKER_ID) {
  const PORT = process.env.PORT || 3000;
  // Bind only to loopback by default (safer behind a reverse-proxy). Override with HOST env if needed.
  const HOST = process.env.HOST || '127.0.0.1';
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer);
  const roomStartTimes = new Map();

  // WebRTC signaling logic
  io.on('connection', socket => {
    socket.on('join-room', ({ roomId, name }) => {
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
      io.to(target).emit('signal', { signal, sender: socket.id });
    });
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(`🚀 Server & Socket.IO listening on http://${HOST}:${PORT}`);
  });
}

export default app; 