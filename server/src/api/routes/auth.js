'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getPostgres } = require('../../db/postgres');
const { getRedis }    = require('../../db/redis');

const router     = express.Router();
const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRY  = process.env.JWT_EXPIRY || '1h';
const REFRESH_EXP = process.env.REFRESH_EXPIRY || '30d';
const SALT_ROUNDS = 12;

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password are required' });
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getPostgres();
  try {
    const exists = await db.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
      [username, email]
    );
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }

    const hash   = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = uuidv4();
    await db.query(
      `INSERT INTO users (id, username, email, password_hash, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, username, email, hash]
    );

    // Give new player 500 starting coins
    await db.query(`UPDATE users SET coins = 500 WHERE id = $1`, [userId]);

    const { access, refresh } = _generateTokens(userId, username);
    await _storeRefreshToken(userId, refresh);

    return res.status(201).json({ access, refresh, userId, username });
  } catch (err) {
    console.error('[Auth] Register error:', err.message);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const usernameOrEmail = req.body.usernameOrEmail || req.body.username || req.body.email;
  const { password } = req.body;
  if (!usernameOrEmail || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const db = getPostgres();
  try {
    const { rows } = await db.query(
      `SELECT id, username, password_hash, is_banned FROM users
       WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)`,
      [usernameOrEmail]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = rows[0];
    if (user.is_banned) {
      return res.status(403).json({ error: 'Account banned' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    const { access, refresh } = _generateTokens(user.id, user.username);
    await _storeRefreshToken(user.id, refresh);

    return res.json({ access, refresh, userId: user.id, username: user.username });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refresh } = req.body;
  if (!refresh) return res.status(400).json({ error: 'refresh token required' });

  try {
    const payload = jwt.verify(refresh, JWT_SECRET);
    const stored  = await _getRefreshToken(payload.sub);

    if (!stored || stored !== refresh) {
      return res.status(401).json({ error: 'Refresh token revoked' });
    }

    const { access, refresh: newRefresh } = _generateTokens(payload.sub, payload.username);
    await _storeRefreshToken(payload.sub, newRefresh);

    return res.json({ access, refresh: newRefresh });
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const { refresh } = req.body;
  if (refresh) {
    try {
      const payload = jwt.verify(refresh, JWT_SECRET, { ignoreExpiration: true });
      await _revokeRefreshToken(payload.sub);
    } catch {}
  }
  return res.json({ ok: true });
});

// GET /api/auth/me  (protected — attach authMiddleware upstream)
router.get('/me', require('../middleware/auth'), async (req, res) => {
  const db = getPostgres();
  const { rows } = await db.query(
    `SELECT id, username, email, coins, xp, created_at, last_login_at FROM users WHERE id = $1`,
    [req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  return res.json(rows[0]);
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function _generateTokens(userId, username) {
  const access = jwt.sign(
    { sub: userId, username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY, algorithm: 'HS256' }
  );
  const refresh = jwt.sign(
    { sub: userId, username, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_EXP, algorithm: 'HS256' }
  );
  return { access, refresh };
}

async function _storeRefreshToken(userId, token) {
  const redis = getRedis();
  await redis.set(`refresh:${userId}`, token, { EX: 30 * 24 * 60 * 60 });
}

async function _getRefreshToken(userId) {
  return await getRedis().get(`refresh:${userId}`);
}

async function _revokeRefreshToken(userId) {
  await getRedis().del(`refresh:${userId}`);
}

module.exports = router;
