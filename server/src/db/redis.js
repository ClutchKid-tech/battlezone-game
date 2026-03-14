'use strict';

const { createClient } = require('redis');

let client     = null;
let subscriber = null;  // separate connection for pub/sub (redis requirement)

async function connectRedis() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  client = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) return new Error('Redis reconnect limit exceeded');
        return Math.min(retries * 100, 2000);
      },
    },
  });

  client.on('error', (err) => console.error('[Redis] Client error:', err.message));
  client.on('reconnecting', () => console.warn('[Redis] Reconnecting…'));

  subscriber = client.duplicate();
  subscriber.on('error', (err) => console.error('[Redis] Subscriber error:', err.message));

  await client.connect();
  await subscriber.connect();

  console.log('[Redis] Connected');
}

async function disconnectRedis() {
  if (client)     { await client.quit();     client     = null; }
  if (subscriber) { await subscriber.quit(); subscriber = null; }
  console.log('[Redis] Disconnected');
}

function getRedis()      { if (!client)     throw new Error('Redis not initialised'); return client; }
function getSubscriber() { if (!subscriber) throw new Error('Redis subscriber not initialised'); return subscriber; }

// ─────────────────────────────────────────────────────────────────────────────
//  Session helpers (JWT refresh token tracking)
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_TTL = 60 * 60 * 24 * 7;  // 7 days in seconds

async function setSession(userId, sessionId, data) {
  const key = `session:${userId}:${sessionId}`;
  await client.setEx(key, SESSION_TTL, JSON.stringify(data));
}

async function getSession(userId, sessionId) {
  const raw = await client.get(`session:${userId}:${sessionId}`);
  return raw ? JSON.parse(raw) : null;
}

async function deleteSession(userId, sessionId) {
  await client.del(`session:${userId}:${sessionId}`);
}

async function deleteAllSessions(userId) {
  const keys = await client.keys(`session:${userId}:*`);
  if (keys.length) await client.del(keys);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Online presence
// ─────────────────────────────────────────────────────────────────────────────

async function setOnline(userId, roomId = null) {
  const key = `online:${userId}`;
  await client.setEx(key, 120, JSON.stringify({ userId, roomId, ts: Date.now() }));
}

async function setOffline(userId) {
  await client.del(`online:${userId}`);
}

async function isOnline(userId) {
  return (await client.exists(`online:${userId}`)) === 1;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Matchmaking queue helpers
// ─────────────────────────────────────────────────────────────────────────────

async function enqueuePlayer(region, mode, playerEntry) {
  const key = `mm:queue:${region}:${mode}`;
  await client.rPush(key, JSON.stringify(playerEntry));
  await client.expire(key, 300);
}

async function dequeuePlayer(region, mode) {
  const key = `mm:queue:${region}:${mode}`;
  const raw = await client.lPop(key);
  return raw ? JSON.parse(raw) : null;
}

async function getQueueLength(region, mode) {
  return client.lLen(`mm:queue:${region}:${mode}`);
}

async function removeFromQueue(region, mode, userId) {
  const key = `mm:queue:${region}:${mode}`;
  const raw = await client.lRange(key, 0, -1);
  for (const item of raw) {
    const parsed = JSON.parse(item);
    if (parsed.userId === userId) {
      await client.lRem(key, 1, item);
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Rate limiting (sliding window)
// ─────────────────────────────────────────────────────────────────────────────

async function checkRateLimit(key, limit, windowSecs) {
  const now    = Date.now();
  const window = windowSecs * 1000;
  const rKey   = `rl:${key}`;

  const count = await client.eval(
    `local key = KEYS[1]
     local now = tonumber(ARGV[1])
     local window = tonumber(ARGV[2])
     local limit = tonumber(ARGV[3])
     redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
     local count = redis.call('ZCARD', key)
     if count < limit then
       redis.call('ZADD', key, now, now)
       redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)
       return 0
     end
     return count`,
    { keys: [rKey], arguments: [String(now), String(window), String(limit)] }
  );

  return { allowed: count === 0, count };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Party / lobby state
// ─────────────────────────────────────────────────────────────────────────────

const PARTY_TTL = 3600;

async function createParty(leaderId, mode, memberIds) {
  const partyId = `party:${leaderId}:${Date.now()}`;
  const data    = { partyId, leaderId, mode, members: memberIds, createdAt: Date.now() };
  await client.setEx(`party:${leaderId}`, PARTY_TTL, JSON.stringify(data));
  return data;
}

async function getParty(leaderId) {
  const raw = await client.get(`party:${leaderId}`);
  return raw ? JSON.parse(raw) : null;
}

async function dissolveParty(leaderId) {
  await client.del(`party:${leaderId}`);
}

module.exports = {
  connectRedis, disconnectRedis, getRedis, getSubscriber,
  setSession, getSession, deleteSession, deleteAllSessions,
  setOnline, setOffline, isOnline,
  enqueuePlayer, dequeuePlayer, getQueueLength, removeFromQueue,
  checkRateLimit,
  createParty, getParty, dissolveParty,
};
