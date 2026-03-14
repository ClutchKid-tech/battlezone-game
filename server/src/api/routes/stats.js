'use strict';

const express = require('express');
const { getPostgres } = require('../../db/postgres');
const { getRedis }    = require('../../db/redis');

const router = express.Router();

// GET /api/stats/me
router.get('/me', async (req, res) => {
  const stats = await _getPlayerStats(req.userId);
  if (!stats) return res.status(404).json({ error: 'Stats not found' });
  return res.json(stats);
});

// GET /api/stats/:userId
router.get('/:userId', async (req, res) => {
  const stats = await _getPlayerStats(req.params.userId);
  if (!stats) return res.status(404).json({ error: 'User not found' });
  return res.json(stats);
});

// GET /api/stats/leaderboard/:mode
router.get('/leaderboard/:mode', async (req, res) => {
  const { mode } = req.params;
  const validModes = ['solo', 'duo', 'squad', 'overall'];
  if (!validModes.includes(mode)) return res.status(400).json({ error: 'Invalid mode' });

  const cacheKey = `leaderboard:${mode}`;
  const redis = getRedis();
  const cached = await redis.get(cacheKey);
  if (cached) return res.json(JSON.parse(cached));

  const db = getPostgres();
  const modeFilter = mode === 'overall' ? '' : `WHERE ps.mode = '${mode}'`;
  const { rows } = await db.query(`
    SELECT
      u.id, u.username,
      SUM(ps.kills) AS kills,
      SUM(ps.wins) AS wins,
      SUM(ps.matches) AS matches,
      ROUND(SUM(ps.kills)::decimal / NULLIF(SUM(ps.deaths), 0), 2) AS kd_ratio,
      ROUND(SUM(ps.damage_dealt)::decimal / NULLIF(SUM(ps.matches), 0), 0) AS avg_damage
    FROM player_stats ps
    JOIN users u ON u.id = ps.user_id
    ${modeFilter}
    GROUP BY u.id, u.username
    ORDER BY wins DESC, kills DESC
    LIMIT 100
  `);

  const leaderboard = rows;
  await redis.set(cacheKey, JSON.stringify(leaderboard), { EX: 300 }); // 5 min cache
  return res.json(leaderboard);
});

// GET /api/stats/match/:matchId
router.get('/match/:matchId', async (req, res) => {
  const db = getPostgres();
  const { rows } = await db.query(
    `SELECT mr.*, array_agg(
      json_build_object(
        'userId', mrp.user_id, 'username', u.username,
        'kills', mrp.kills, 'damage', mrp.damage_dealt,
        'placement', mrp.placement, 'survived', mrp.survived,
        'survivalMs', mrp.survival_ms
      )
     ) AS players
     FROM match_results mr
     LEFT JOIN match_result_players mrp ON mrp.match_id = mr.id
     LEFT JOIN users u ON u.id = mrp.user_id
     WHERE mr.id = $1
     GROUP BY mr.id`,
    [req.params.matchId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Match not found' });
  return res.json(rows[0]);
});

// GET /api/stats/me/history
router.get('/me/history', async (req, res) => {
  const db = getPostgres();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  const { rows } = await db.query(`
    SELECT mr.id AS match_id, mr.mode, mr.region, mr.started_at, mr.ended_at,
           mrp.kills, mrp.damage_dealt, mrp.placement, mrp.survived, mrp.survival_ms
    FROM match_result_players mrp
    JOIN match_results mr ON mr.id = mrp.match_id
    WHERE mrp.user_id = $1
    ORDER BY mr.started_at DESC
    LIMIT $2 OFFSET $3
  `, [req.userId, limit, offset]);

  return res.json({ matches: rows, page, limit });
});

async function _getPlayerStats(userId) {
  const db = getPostgres();
  const { rows } = await db.query(`
    SELECT
      u.id, u.username, u.created_at,
      COALESCE(SUM(ps.kills), 0) AS kills,
      COALESCE(SUM(ps.deaths), 0) AS deaths,
      COALESCE(SUM(ps.wins), 0) AS wins,
      COALESCE(SUM(ps.top10), 0) AS top10s,
      COALESCE(SUM(ps.matches), 0) AS matches,
      COALESCE(SUM(ps.damage_dealt), 0) AS total_damage,
      ROUND(SUM(ps.kills)::decimal / NULLIF(SUM(ps.deaths), 0), 2) AS kd_ratio,
      ROUND(SUM(ps.kills)::decimal / NULLIF(SUM(ps.matches), 0), 2) AS kills_per_match,
      ROUND(SUM(ps.wins)::decimal / NULLIF(SUM(ps.matches), 0) * 100, 1) AS win_rate,
      COALESCE(SUM(ps.headshots), 0) AS headshots,
      ROUND(SUM(ps.headshots)::decimal / NULLIF(SUM(ps.shots_fired), 0) * 100, 1) AS headshot_rate
    FROM users u
    LEFT JOIN player_stats ps ON ps.user_id = u.id
    WHERE u.id = $1
    GROUP BY u.id, u.username, u.created_at
  `, [userId]);

  if (!rows[0]) return null;

  // Per-mode breakdown
  const { rows: modeRows } = await db.query(`
    SELECT mode,
           SUM(kills) AS kills, SUM(wins) AS wins, SUM(matches) AS matches
    FROM player_stats
    WHERE user_id = $1
    GROUP BY mode
  `, [userId]);

  return { ...rows[0], modeStats: modeRows };
}

module.exports = router;
