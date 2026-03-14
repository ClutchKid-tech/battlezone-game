'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const { connectPostgres } = require('./db/postgres');
const { connectRedis } = require('./db/redis');
const GameServer = require('./game/GameServer');
const MatchmakingService = require('./matchmaking/MatchmakingService');
const VoiceServer = require('./voice/VoiceServer');
const authRouter = require('./api/routes/auth');
const statsRouter = require('./api/routes/stats');
const shopRouter = require('./api/routes/shop');
const friendsRouter = require('./api/routes/friends');
const authMiddleware = require('./api/middleware/auth');
const { apiLimiter, strictLimiter } = require('./api/middleware/rateLimit');

async function bootstrap() {
  // Connect to databases first — fail fast if unavailable
  await connectPostgres();
  await connectRedis();
  console.log('[Boot] Databases connected');

  const app = express();
  app.set('trust proxy', 1);  // Nginx sits in front; trust X-Forwarded-For for rate limiting

  // Security hardening
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'wss:', 'ws:'],
        mediaSrc: ["'self'", 'blob:'],
        workerSrc: ["'self'", 'blob:'],
      },
    },
  }));
  app.use(compression());
  app.use(cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
    credentials: true,
  }));
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));

  // Global API rate limiting
  app.use('/api', apiLimiter);

  // REST API routes
  app.use('/api/auth', strictLimiter, authRouter);
  app.use('/api/stats', authMiddleware, statsRouter);
  app.use('/api/shop', authMiddleware, shopRouter);
  app.use('/api/friends', authMiddleware, friendsRouter);

  // Health check endpoint for load balancer
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
  });

  // Serve static client in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('../../client/dist'));
    app.get('*', (req, res) => {
      res.sendFile('../../client/dist/index.html', { root: __dirname });
    });
  }

  // Create HTTP(S) server
  let server;
  if (process.env.TLS_CERT && process.env.TLS_KEY) {
    server = https.createServer({
      cert: fs.readFileSync(process.env.TLS_CERT),
      key: fs.readFileSync(process.env.TLS_KEY),
    }, app);
    console.log('[Boot] HTTPS enabled');
  } else {
    server = http.createServer(app);
    console.log('[Boot] HTTP mode (use TLS in production)');
  }

  // Socket.io with WSS support
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket'],          // WebSocket only — no long-polling
    pingTimeout: 10000,
    pingInterval: 5000,
    maxHttpBufferSize: 1e5,             // 100 KB max message size
    connectionStateRecovery: {
      maxDisconnectionDuration: 3000,   // 3s grace window for reconnects
    },
  });

  // Initialise game layer
  const gameServer = new GameServer(io);
  const matchmaking = new MatchmakingService(gameServer);
  const voiceServer = new VoiceServer(io);

  gameServer.start();
  voiceServer.start();
  console.log('[Boot] Game server and voice server started');

  // Attach matchmaking socket namespace
  const mmNamespace = io.of('/matchmaking');
  mmNamespace.use(require('./api/middleware/socketAuth'));
  mmNamespace.on('connection', (socket) => matchmaking.handleConnection(socket));

  // Main game socket namespace
  const gameNamespace = io.of('/game');
  gameNamespace.use(require('./api/middleware/socketAuth'));
  gameNamespace.on('connection', (socket) => gameServer.handleConnection(socket));

  // Voice socket namespace
  const voiceNamespace = io.of('/voice');
  voiceNamespace.use(require('./api/middleware/socketAuth'));
  voiceNamespace.on('connection', (socket) => voiceServer.handleConnection(socket));

  const PORT = parseInt(process.env.PORT || '8080', 10);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Boot] Server listening on port ${PORT} (PID ${process.pid})`);
  });

  // Graceful shutdown
  const gracefulShutdown = async (signal) => {
    console.log(`[Shutdown] Received ${signal}, shutting down gracefully…`);
    gameServer.stop();
    voiceServer.stop();
    server.close(async () => {
      await require('./db/postgres').disconnectPostgres();
      await require('./db/redis').disconnectRedis();
      console.log('[Shutdown] Done');
      process.exit(0);
    });
    // Force exit after 15s if connections remain
    setTimeout(() => {
      console.error('[Shutdown] Forced exit after timeout');
      process.exit(1);
    }, 15_000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Unhandled rejection guard — log and stay alive
  process.on('unhandledRejection', (reason) => {
    console.error('[Process] Unhandled rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught exception:', err);
    gracefulShutdown('uncaughtException');
  });
}

bootstrap().catch((err) => {
  console.error('[Boot] Fatal error during startup:', err);
  process.exit(1);
});
