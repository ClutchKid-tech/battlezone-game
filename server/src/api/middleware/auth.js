'use strict';

const jwt = require('jsonwebtoken');
const { getPostgres } = require('../../db/postgres');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET env var is required');

// REST middleware
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId   = payload.sub;
    req.username = payload.username;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Socket.io middleware
async function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('AUTH_MISSING'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.userId   = payload.sub;
    socket.username = payload.username;
    socket.handshake.auth.userId   = payload.sub;
    socket.handshake.auth.username = payload.username;

    // Check ban status
    const db = getPostgres();
    const { rows } = await db.query(
      'SELECT is_banned FROM users WHERE id = $1',
      [payload.sub]
    );
    if (rows[0]?.is_banned) return next(new Error('BANNED'));

    next();
  } catch (err) {
    next(new Error('AUTH_INVALID'));
  }
}

module.exports = authMiddleware;
module.exports.socketAuth = socketAuth;
