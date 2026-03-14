'use strict';

const GameRoom = require('./GameRoom');
const { getRedis } = require('../db/redis');

// Maximum concurrent rooms per process (scale horizontally for more)
const MAX_ROOMS = parseInt(process.env.MAX_ROOMS || '20', 10);
const ROOM_CLEANUP_INTERVAL_MS = 30_000;

class GameServer {
  constructor(io) {
    this.io = io;
    /** @type {Map<string, GameRoom>} */
    this.rooms = new Map();
    this._cleanupTimer = null;
    this._started = false;
  }

  start() {
    if (this._started) return;
    this._started = true;
    this._cleanupTimer = setInterval(() => this._cleanupFinishedRooms(), ROOM_CLEANUP_INTERVAL_MS);
    console.log('[GameServer] Started');
  }

  stop() {
    if (!this._started) return;
    this._started = false;
    clearInterval(this._cleanupTimer);
    for (const room of this.rooms.values()) {
      room.forceEnd('server_shutdown');
    }
    this.rooms.clear();
    console.log('[GameServer] Stopped');
  }

  // Called by MatchmakingService once a lobby is full
  createRoom(roomId, players, mode, region) {
    if (this.rooms.size >= MAX_ROOMS) {
      throw new Error('MAX_ROOMS capacity reached — spawn a new game server process');
    }
    const room = new GameRoom(roomId, players, mode, region, this.io);
    this.rooms.set(roomId, room);
    room.start();
    this._publishRoomCreated(roomId, mode, region);
    console.log(`[GameServer] Created room ${roomId} mode=${mode} region=${region} players=${players.length}`);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  getRoomByPlayerId(playerId) {
    for (const room of this.rooms.values()) {
      if (room.hasPlayer(playerId)) return room;
    }
    return null;
  }

  handleConnection(socket) {
    const { userId, username, roomId } = socket.handshake.auth;
    if (!roomId) {
      socket.emit('error', { code: 'NO_ROOM', message: 'Must provide roomId in auth' });
      socket.disconnect(true);
      return;
    }

    const room = this.getRoom(roomId);
    if (!room) {
      socket.emit('error', { code: 'ROOM_NOT_FOUND', message: `Room ${roomId} does not exist` });
      socket.disconnect(true);
      return;
    }

    room.addSocket(socket, userId, username);
  }

  getStats() {
    const stats = {
      rooms: this.rooms.size,
      activePlayers: 0,
      roomDetails: [],
    };
    for (const [id, room] of this.rooms) {
      const rc = room.getStats();
      stats.activePlayers += rc.alivePlayers;
      stats.roomDetails.push({ id, ...rc });
    }
    return stats;
  }

  _cleanupFinishedRooms() {
    for (const [id, room] of this.rooms) {
      if (room.isFinished() && Date.now() - room.endedAt > 60_000) {
        room.dispose();
        this.rooms.delete(id);
        console.log(`[GameServer] Cleaned up room ${id}`);
      }
    }
  }

  async _publishRoomCreated(roomId, mode, region) {
    try {
      const redis = getRedis();
      await redis.publish('game:room_created', JSON.stringify({ roomId, mode, region, pid: process.pid }));
    } catch (err) {
      console.error('[GameServer] Failed to publish room_created:', err.message);
    }
  }
}

module.exports = GameServer;
