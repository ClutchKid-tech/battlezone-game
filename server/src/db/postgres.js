'use strict';

const { Pool } = require('pg');

let pool = null;

async function connectPostgres() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: parseInt(process.env.PG_POOL_MAX || '20', 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.PG_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
  });

  pool.on('error', (err) => {
    console.error('[Postgres] Idle client error:', err.message);
  });

  // Verify connection
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  console.log('[Postgres] Connected');
}

async function disconnectPostgres() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[Postgres] Disconnected');
  }
}

function getPool() {
  if (!pool) throw new Error('Postgres pool not initialised — call connectPostgres() first');
  return pool;
}

// Convenience query helper — always returns result rows
async function query(text, params) {
  const client = await pool.connect();
  try {
    const start  = Date.now();
    const result = await client.query(text, params);
    const ms     = Date.now() - start;
    if (ms > 500) console.warn(`[Postgres] Slow query (${ms}ms): ${text.slice(0, 80)}`);
    return result;
  } finally {
    client.release();
  }
}

// Wraps multiple queries in a single transaction
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Domain helpers
// ─────────────────────────────────────────────────────────────────────────────

async function findUserById(userId) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1 LIMIT 1', [userId]);
  return rows[0] || null;
}

async function findUserByUsername(username) {
  const { rows } = await query('SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1', [username]);
  return rows[0] || null;
}

async function findUserByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
  return rows[0] || null;
}

async function createUser({ username, email, passwordHash }) {
  const { rows } = await query(
    `INSERT INTO users (username, email, password_hash, created_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id, username, email, created_at`,
    [username, email, passwordHash]
  );
  return rows[0];
}

async function getPlayerStats(userId) {
  const { rows } = await query(
    `SELECT * FROM player_stats WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function upsertPlayerStats(userId, delta) {
  // delta: { kills, deaths, wins, top10s, damageDealt, matchesPlayed, shots, hits }
  await query(
    `INSERT INTO player_stats (user_id, kills, deaths, wins, top10s, damage_dealt, matches_played, shots_fired, shots_hit)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (user_id) DO UPDATE SET
       kills          = player_stats.kills          + EXCLUDED.kills,
       deaths         = player_stats.deaths         + EXCLUDED.deaths,
       wins           = player_stats.wins           + EXCLUDED.wins,
       top10s         = player_stats.top10s         + EXCLUDED.top10s,
       damage_dealt   = player_stats.damage_dealt   + EXCLUDED.damage_dealt,
       matches_played = player_stats.matches_played + EXCLUDED.matches_played,
       shots_fired    = player_stats.shots_fired    + EXCLUDED.shots_fired,
       shots_hit      = player_stats.shots_hit      + EXCLUDED.shots_hit`,
    [userId, delta.kills||0, delta.deaths||0, delta.wins||0, delta.top10s||0,
     delta.damageDealt||0, delta.matchesPlayed||0, delta.shots||0, delta.hits||0]
  );
}

async function saveMatchResult(roomId, results) {
  return transaction(async (client) => {
    // Insert match record
    const { rows } = await client.query(
      `INSERT INTO matches (id, mode, region, started_at, ended_at, duration_ms, winner_id)
       VALUES ($1, $2, $3, to_timestamp($4/1000.0), to_timestamp($5/1000.0), $6, $7)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [roomId, results.mode, results.region || 'unknown',
       results.startedAt, results.endedAt, results.duration, results.winnerId || null]
    );
    if (!rows[0]) return;  // already saved

    // Insert per-player results
    for (const p of results.players) {
      await client.query(
        `INSERT INTO match_players (match_id, user_id, kills, damage_dealt, placement, survived, survival_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [roomId, p.userId, p.kills, p.damage, p.placement, p.survived, p.survivalMs]
      );

      // Update aggregated stats
      const isWin   = p.userId === results.winnerId;
      const isTop10 = p.placement <= 10;
      await client.query(
        `INSERT INTO player_stats (user_id, kills, deaths, wins, top10s, damage_dealt, matches_played)
         VALUES ($1,$2,$3,$4,$5,$6,1)
         ON CONFLICT (user_id) DO UPDATE SET
           kills          = player_stats.kills          + EXCLUDED.kills,
           deaths         = player_stats.deaths         + EXCLUDED.deaths,
           wins           = player_stats.wins           + EXCLUDED.wins,
           top10s         = player_stats.top10s         + EXCLUDED.top10s,
           damage_dealt   = player_stats.damage_dealt   + EXCLUDED.damage_dealt,
           matches_played = player_stats.matches_played + 1`,
        [p.userId, p.kills, p.survived ? 0 : 1, isWin ? 1 : 0, isTop10 ? 1 : 0, p.damage]
      );

      // Award XP
      const xp = p.kills * 100 + (isWin ? 500 : 0) + (isTop10 ? 200 : 0) + Math.floor(p.survivalMs / 1000);
      await client.query(
        `UPDATE users SET xp = xp + $1, coins = coins + $2 WHERE id = $3`,
        [xp, Math.floor(xp / 10), p.userId]
      );
    }
  });
}

async function getLeaderboard(limit = 100) {
  const { rows } = await query(
    `SELECT u.username, s.kills, s.deaths, s.wins, s.matches_played,
            ROUND(s.kills::numeric / NULLIF(s.deaths, 0), 2) AS kd_ratio
     FROM player_stats s
     JOIN users u ON u.id = s.user_id
     ORDER BY s.wins DESC, s.kills DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getUserInventory(userId) {
  const { rows } = await query(
    `SELECT i.*, ci.item_id, ci.cosmetic_type, ci.name, ci.rarity
     FROM user_inventory i
     JOIN cosmetic_items ci ON ci.id = i.item_id
     WHERE i.user_id = $1`,
    [userId]
  );
  return rows;
}

async function getShopItems() {
  const { rows } = await query(
    `SELECT ci.*, sr.price_coins, sr.price_real, sr.available_until
     FROM shop_rotations sr
     JOIN cosmetic_items ci ON ci.id = sr.item_id
     WHERE sr.available_from <= NOW() AND (sr.available_until IS NULL OR sr.available_until >= NOW())
     ORDER BY sr.featured DESC, ci.rarity DESC`,
    []
  );
  return rows;
}

async function purchaseItem(userId, itemId, paymentMethod, stripePaymentIntentId = null) {
  return transaction(async (client) => {
    // Get item & price
    const { rows: items } = await client.query(
      `SELECT ci.id, ci.name, sr.price_coins, sr.price_real
       FROM shop_rotations sr JOIN cosmetic_items ci ON ci.id = sr.item_id
       WHERE ci.id = $1 AND sr.available_from <= NOW() AND (sr.available_until IS NULL OR sr.available_until >= NOW())
       LIMIT 1`,
      [itemId]
    );
    if (!items[0]) throw Object.assign(new Error('Item not available'), { code: 'ITEM_UNAVAILABLE' });

    const item = items[0];

    // Check already owned
    const { rows: owned } = await client.query(
      `SELECT id FROM user_inventory WHERE user_id = $1 AND item_id = $2 LIMIT 1`, [userId, itemId]
    );
    if (owned[0]) throw Object.assign(new Error('Already owned'), { code: 'ALREADY_OWNED' });

    if (paymentMethod === 'coins') {
      // Deduct coins
      const { rowCount } = await client.query(
        `UPDATE users SET coins = coins - $1 WHERE id = $2 AND coins >= $1`,
        [item.price_coins, userId]
      );
      if (!rowCount) throw Object.assign(new Error('Insufficient coins'), { code: 'INSUFFICIENT_COINS' });
    }
    // For real-money purchases, Stripe webhook has already verified the intent before calling this

    // Grant item
    await client.query(
      `INSERT INTO user_inventory (user_id, item_id, purchased_at, payment_method, stripe_payment_id)
       VALUES ($1, $2, NOW(), $3, $4)`,
      [userId, itemId, paymentMethod, stripePaymentIntentId]
    );

    // Create receipt
    const { rows: receipt } = await client.query(
      `INSERT INTO purchase_receipts (user_id, item_id, item_name, amount_coins, amount_real, payment_method, stripe_payment_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING id`,
      [userId, itemId, item.name, item.price_coins || 0, item.price_real || 0, paymentMethod, stripePaymentIntentId]
    );

    return { receipt: receipt[0], item };
  });
}

async function getFriends(userId) {
  const { rows } = await query(
    `SELECT u.id, u.username, u.avatar_url, f.created_at AS friends_since,
            CASE WHEN online_sessions.user_id IS NOT NULL THEN true ELSE false END AS online
     FROM friendships f
     JOIN users u ON (u.id = CASE WHEN f.user_id_a = $1 THEN f.user_id_b ELSE f.user_id_a END)
     LEFT JOIN online_sessions ON online_sessions.user_id = u.id AND online_sessions.expires_at > NOW()
     WHERE (f.user_id_a = $1 OR f.user_id_b = $1) AND f.status = 'accepted'
     ORDER BY online DESC, u.username`,
    [userId]
  );
  return rows;
}

async function addBanRecord(userId, reason, bannedBy, expiresAt = null) {
  await query(
    `INSERT INTO bans (user_id, reason, banned_by, created_at, expires_at, active)
     VALUES ($1, $2, $3, NOW(), $4, true)`,
    [userId, reason, bannedBy, expiresAt]
  );
  await query(`UPDATE users SET is_banned = true WHERE id = $1`, [userId]);
}

async function isUserBanned(userId) {
  const { rows } = await query(
    `SELECT id FROM bans WHERE user_id = $1 AND active = true
     AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
    [userId]
  );
  return rows.length > 0;
}

// Alias for files that use getPostgres() convention
const getPostgres = getPool;

module.exports = {
  connectPostgres, disconnectPostgres, getPool, getPostgres, query, transaction,
  findUserById, findUserByUsername, findUserByEmail, createUser,
  getPlayerStats, upsertPlayerStats, saveMatchResult, getLeaderboard,
  getUserInventory, getShopItems, purchaseItem,
  getFriends, addBanRecord, isUserBanned,
};
