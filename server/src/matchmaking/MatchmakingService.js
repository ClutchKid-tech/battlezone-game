'use strict';

const { v4: uuidv4 } = require('uuid');
const { getRedis } = require('../db/redis');

// Matchmaking queue config
const QUEUE_FLUSH_INTERVAL_MS  = 2000;   // Check queues every 2 seconds
const LOBBY_FILL_TIMEOUT_MS    = 45_000; // Start with min players after 45s
const SQUAD_SIZE = { solo: 1, duo: 2, squad: 4 };
const MATCH_SIZE = { solo: 100, duo: 100, squad: 100 };  // 100 players per match always
const MIN_PLAYERS_TO_START = parseInt(process.env.MIN_START_PLAYERS || '2', 10);

// Regions
const REGIONS = ['na', 'eu', 'apac', 'sa', 'me'];

class MatchmakingService {
  constructor(gameServer) {
    this.gameServer = gameServer;
    // queues[region][mode] = [ { userId, username, squadId, socketId, joinedAt } ]
    this.queues = {};
    for (const r of REGIONS) {
      this.queues[r] = { solo: [], duo: [], squad: [] };
    }
    // Pending lobbies waiting to fill: lobbyId → { players, mode, region, createdAt }
    this.pendingLobbies = new Map();

    this._flushTimer = setInterval(() => this._flushQueues(), QUEUE_FLUSH_INTERVAL_MS);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Socket interface
  // ─────────────────────────────────────────────────────────────────────

  handleConnection(socket) {
    const { userId, username } = socket.handshake.auth;

    socket.on('mm:join', (data) => this._handleJoin(socket, userId, username, data));
    socket.on('mm:leave', ()     => this._handleLeave(socket, userId));
    socket.on('mm:accept', (data) => this._handleAccept(socket, userId, data));
    socket.on('disconnect', ()   => this._handleLeave(socket, userId));
  }

  _handleJoin(socket, userId, username, data) {
    const { mode, region, squadId } = data;

    if (!REGIONS.includes(region)) {
      socket.emit('mm:error', { code: 'INVALID_REGION' });
      return;
    }
    if (!SQUAD_SIZE[mode]) {
      socket.emit('mm:error', { code: 'INVALID_MODE' });
      return;
    }

    // Remove from any existing queue first
    this._removeFromAllQueues(userId);

    const entry = { userId, username, squadId: squadId || userId, socketId: socket.id, socket, joinedAt: Date.now() };
    this.queues[region][mode].push(entry);
    socket.emit('mm:queued', { region, mode, position: this.queues[region][mode].length });
    console.log(`[MM] ${username} joined ${region}/${mode} queue (size: ${this.queues[region][mode].length})`);
  }

  _handleLeave(socket, userId) {
    this._removeFromAllQueues(userId);
    socket.emit('mm:left', {});
  }

  _handleAccept(socket, userId, data) {
    const lobby = this.pendingLobbies.get(data.lobbyId);
    if (!lobby) return;
    const player = lobby.players.find(p => p.userId === userId);
    if (!player) return;
    player.accepted = true;

    const allAccepted = lobby.players.every(p => p.accepted);
    if (allAccepted) {
      this._launchMatch(lobby);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Queue processing
  // ─────────────────────────────────────────────────────────────────────

  _flushQueues() {
    for (const region of REGIONS) {
      for (const mode of ['solo', 'duo', 'squad']) {
        this._tryFormMatch(region, mode);
      }
    }

    // Check for timed-out pending lobbies (players didn't accept)
    for (const [lobbyId, lobby] of this.pendingLobbies) {
      if (Date.now() - lobby.createdAt > 15_000) {
        // Re-queue players who accepted; drop those who didn't
        for (const p of lobby.players) {
          if (p.accepted) {
            this.queues[lobby.region][lobby.mode].unshift(p);  // priority re-queue
          } else {
            p.socket?.emit('mm:timeout', { lobbyId });
          }
        }
        this.pendingLobbies.delete(lobbyId);
      }
    }
  }

  _tryFormMatch(region, mode) {
    const queue = this.queues[region][mode];
    if (queue.length === 0) return;

    const target = MATCH_SIZE[mode];

    // Force-start if queue has been waiting too long
    const oldestEntry = queue[0];
    const forceStart = queue.length >= MIN_PLAYERS_TO_START &&
      Date.now() - oldestEntry.joinedAt > LOBBY_FILL_TIMEOUT_MS;

    if (queue.length >= target || forceStart) {
      const taken = queue.splice(0, Math.min(queue.length, target));
      const lobbyId = uuidv4();

      const players = taken.map(e => ({
        userId:   e.userId,
        username: e.username,
        squadId:  e.squadId,
        socket:   e.socket,
        accepted: false,
      }));

      const lobby = { lobbyId, players, mode, region, createdAt: Date.now() };
      this.pendingLobbies.set(lobbyId, lobby);

      // Notify all players that a match was found
      for (const p of players) {
        p.socket?.emit('mm:found', {
          lobbyId,
          mode,
          region,
          playerCount: players.length,
        });
      }

      // In production you'd wait for mm:accept from all players
      // For simplicity, auto-accept after 3 seconds
      setTimeout(() => {
        const l = this.pendingLobbies.get(lobbyId);
        if (l) {
          l.players.forEach(p => { p.accepted = true; });
          this._launchMatch(l);
        }
      }, 3000);

      console.log(`[MM] Formed lobby ${lobbyId} for ${region}/${mode} with ${players.length} players`);
    }
  }

  _launchMatch(lobby) {
    this.pendingLobbies.delete(lobby.lobbyId);
    const roomId = uuidv4();

    try {
      const room = this.gameServer.createRoom(roomId, lobby.players, lobby.mode, lobby.region);
      const serverHost = process.env.GAME_SERVER_HOST || 'localhost';
      const serverPort = process.env.PORT || '8080';

      for (const p of lobby.players) {
        p.socket?.emit('mm:match_ready', {
          roomId,
          serverHost,
          serverPort,
          token: p.socket.handshake.auth.token,  // reuse JWT
        });
      }

      this._publishMatchStarted(roomId, lobby);
    } catch (err) {
      console.error(`[MM] Failed to create room: ${err.message}`);
      // Re-queue players
      for (const p of lobby.players) {
        this.queues[lobby.region][lobby.mode].unshift({ ...p, joinedAt: Date.now() });
        p.socket?.emit('mm:requeued', { reason: 'server_error' });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Utilities
  // ─────────────────────────────────────────────────────────────────────

  _removeFromAllQueues(userId) {
    for (const region of REGIONS) {
      for (const mode of ['solo', 'duo', 'squad']) {
        const q = this.queues[region][mode];
        const idx = q.findIndex(e => e.userId === userId);
        if (idx !== -1) q.splice(idx, 1);
      }
    }
  }

  getQueueStats() {
    const stats = {};
    for (const r of REGIONS) {
      stats[r] = {};
      for (const m of ['solo', 'duo', 'squad']) {
        stats[r][m] = this.queues[r][m].length;
      }
    }
    return stats;
  }

  async _publishMatchStarted(roomId, lobby) {
    try {
      const redis = getRedis();
      await redis.publish('mm:match_started', JSON.stringify({
        roomId,
        mode: lobby.mode,
        region: lobby.region,
        playerCount: lobby.players.length,
      }));
    } catch (err) {
      console.error('[MM] Redis publish failed:', err.message);
    }
  }

  destroy() {
    clearInterval(this._flushTimer);
  }
}

module.exports = MatchmakingService;
