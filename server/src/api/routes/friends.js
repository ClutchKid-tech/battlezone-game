'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getPostgres } = require('../../db/postgres');
const { getRedis }    = require('../../db/redis');

const router = express.Router();

// GET /api/friends
router.get('/', async (req, res) => {
  const db = getPostgres();
  const { rows } = await db.query(`
    SELECT u.id, u.username, f.status, f.created_at,
           (SELECT COUNT(*) FROM match_result_players WHERE user_id = u.id) AS matches_played
    FROM friendships f
    JOIN users u ON (
      CASE WHEN f.user_id = $1 THEN u.id = f.friend_id ELSE u.id = f.user_id END
    )
    WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'
    ORDER BY u.username
  `, [req.userId]);
  return res.json(rows);
});

// GET /api/friends/requests
router.get('/requests', async (req, res) => {
  const db = getPostgres();
  const { rows } = await db.query(`
    SELECT f.id, u.id AS from_id, u.username AS from_username, f.created_at
    FROM friendships f
    JOIN users u ON u.id = f.user_id
    WHERE f.friend_id = $1 AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `, [req.userId]);
  return res.json(rows);
});

// POST /api/friends/request
router.post('/request', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });

  const db = getPostgres();
  const { rows: target } = await db.query(
    `SELECT id, username FROM users WHERE LOWER(username) = LOWER($1)`, [username]
  );
  if (!target[0]) return res.status(404).json({ error: 'User not found' });
  if (target[0].id === req.userId) return res.status(400).json({ error: 'Cannot add yourself' });

  // Check if friendship already exists
  const { rows: existing } = await db.query(
    `SELECT id, status FROM friendships
     WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
    [req.userId, target[0].id]
  );
  if (existing.length > 0) {
    return res.status(409).json({ error: `Friendship already exists (${existing[0].status})` });
  }

  const id = uuidv4();
  await db.query(
    `INSERT INTO friendships (id, user_id, friend_id, status, created_at) VALUES ($1, $2, $3, 'pending', NOW())`,
    [id, req.userId, target[0].id]
  );

  // Notify via Redis pub/sub (picked up by connected sockets)
  await getRedis().publish('notification:friend_request', JSON.stringify({
    to:       target[0].id,
    fromId:   req.userId,
    fromName: req.username,
  }));

  return res.status(201).json({ id, to: target[0] });
});

// POST /api/friends/accept/:requestId
router.post('/accept/:requestId', async (req, res) => {
  const db = getPostgres();
  const { rows } = await db.query(
    `UPDATE friendships SET status = 'accepted', accepted_at = NOW()
     WHERE id = $1 AND friend_id = $2 AND status = 'pending'
     RETURNING *`,
    [req.params.requestId, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Request not found' });
  return res.json(rows[0]);
});

// DELETE /api/friends/reject/:requestId
router.delete('/reject/:requestId', async (req, res) => {
  const db = getPostgres();
  await db.query(
    `DELETE FROM friendships WHERE id = $1 AND friend_id = $2 AND status = 'pending'`,
    [req.params.requestId, req.userId]
  );
  return res.json({ ok: true });
});

// DELETE /api/friends/:friendId
router.delete('/:friendId', async (req, res) => {
  const db = getPostgres();
  await db.query(
    `DELETE FROM friendships
     WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
    [req.userId, req.params.friendId]
  );
  return res.json({ ok: true });
});

// POST /api/friends/invite  — generate shareable invite link
router.post('/invite', async (req, res) => {
  const redis = getRedis();
  const code  = uuidv4().slice(0, 8).toUpperCase();
  await redis.set(`invite:${code}`, req.userId, { EX: 86400 });  // 24 hours
  return res.json({ code, url: `${process.env.CLIENT_ORIGIN}/invite/${code}` });
});

// POST /api/friends/invite/use
router.post('/invite/use', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });

  const redis    = getRedis();
  const fromId   = await redis.get(`invite:${code}`);
  if (!fromId) return res.status(404).json({ error: 'Invalid or expired invite code' });
  if (fromId === req.userId) return res.status(400).json({ error: 'Cannot invite yourself' });

  // Auto-send friend request
  const db = getPostgres();
  const { rows: existing } = await db.query(
    `SELECT id FROM friendships
     WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
    [req.userId, fromId]
  );
  if (existing.length === 0) {
    await db.query(
      `INSERT INTO friendships (id, user_id, friend_id, status, created_at)
       VALUES ($1, $2, $3, 'pending', NOW())
       ON CONFLICT DO NOTHING`,
      [uuidv4(), req.userId, fromId]
    );
  }

  await redis.del(`invite:${code}`);
  return res.json({ ok: true, fromId });
});

// POST /api/friends/block/:userId
router.post('/block/:targetId', async (req, res) => {
  const db = getPostgres();
  // Remove existing friendship first
  await db.query(
    `DELETE FROM friendships
     WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
    [req.userId, req.params.targetId]
  );
  await db.query(
    `INSERT INTO blocks (user_id, blocked_id, created_at) VALUES ($1, $2, NOW())
     ON CONFLICT DO NOTHING`,
    [req.userId, req.params.targetId]
  );
  return res.json({ ok: true });
});

module.exports = router;
