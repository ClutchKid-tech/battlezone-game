/**
 * NetworkManager — Socket.io client with:
 *   - Automatic reconnect with exponential backoff
 *   - Client-side prediction + server reconciliation
 *   - Entity interpolation for remote players
 *   - Lag compensation (input buffer)
 *   - Latency measurement (RTT)
 */

import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;
const INTERP_DELAY_MS = 100;   // interpolation buffer delay
const INPUT_BUFFER_SIZE = 32;

export default class NetworkManager {
  constructor() {
    this._socket      = null;
    this._mmSocket    = null;
    this._connected   = false;
    this.roomId       = null;
    this.rtt          = 0;

    // Client-side prediction
    this._inputSequence  = 0;
    this._pendingInputs  = [];       // inputs sent but not yet acknowledged

    // Entity state buffers for interpolation
    // Map<playerId, Array<{t, pos, rot, vel}>>
    this._entityBuffers  = new Map();

    // Event handlers registered by game
    this._handlers = {};

    // Latency ping interval
    this._pingTimer = null;
    this._pingTime  = 0;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Connection
  // ─────────────────────────────────────────────────────────────────────

  connect(token, roomId) {
    this.roomId = roomId;

    this._socket = io(`${SERVER_URL}/game`, {
      auth:       { token, roomId },
      transports: ['websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay:    1000,
      reconnectionDelayMax: 10000,
    });

    this._socket.on('connect',    () => this._onConnect());
    this._socket.on('disconnect', (r) => this._onDisconnect(r));
    this._socket.on('connect_error', (err) => this._onConnectError(err));

    // Core game events
    this._socket.on('room:state',    (d) => this._emit('room:state',    d));
    this._socket.on('room:countdown',(d) => this._emit('room:countdown',d));
    this._socket.on('room:start',    (d) => this._emit('room:start',    d));
    this._socket.on('room:end',      (d) => this._emit('room:end',      d));
    this._socket.on('world:state',   (d) => this._onWorldState(d));

    // Player events
    this._socket.on('player:damaged',  (d) => this._emit('player:damaged',  d));
    this._socket.on('player:killed',   (d) => this._emit('player:killed',   d));
    this._socket.on('player:snap',     (d) => this._emit('player:snap',     d));
    this._socket.on('player:shot',     (d) => this._emit('player:shot',     d));
    this._socket.on('player:reloading',(d) => this._emit('player:reloading',d));
    this._socket.on('player:emote',    (d) => this._emit('player:emote',    d));
    this._socket.on('player:equip',    (d) => this._emit('player:equip',    d));
    this._socket.on('player:heal',     (d) => this._emit('player:heal',     d));
    this._socket.on('stats:update',    (d) => this._emit('stats:update',    d));
    this._socket.on('hitmarker',       (d) => this._emit('hitmarker',       d));
    this._socket.on('kill:confirmed',  (d) => this._emit('kill:confirmed',  d));
    this._socket.on('shoot:confirmed', (d) => this._emit('shoot:confirmed', d));

    // Loot / inventory
    this._socket.on('loot:removed',   (d) => this._emit('loot:removed',   d));
    this._socket.on('loot:spawned',   (d) => this._emit('loot:spawned',   d));
    this._socket.on('loot:out_of_range',(d)=> this._emit('loot:out_of_range',d));
    this._socket.on('inventory:update',(d) => this._emit('inventory:update',d));
    this._socket.on('reload:complete', (d) => this._emit('reload:complete', d));

    // Vehicle events
    this._socket.on('vehicle:entered', (d) => this._emit('vehicle:entered', d));
    this._socket.on('vehicle:exited',  (d) => this._emit('vehicle:exited',  d));

    // Grenade / explosion
    this._socket.on('grenade:thrown',  (d) => this._emit('grenade:thrown',  d));
    this._socket.on('grenade:explode', (d) => this._emit('grenade:explode', d));

    // Chat
    this._socket.on('chat:message',    (d) => this._emit('chat:message',    d));

    // Ping/pong for RTT measurement
    this._socket.on('pong', (d) => {
      this.rtt = Date.now() - d.clientTime;
      this._emit('rtt', { rtt: this.rtt });
    });

    // Equip acknowledgement
    this._socket.on('equip:ok', (d) => this._emit('equip:ok', d));
    this._socket.on('error',    (d) => this._emit('server:error', d));
  }

  connectMatchmaking(token) {
    this._mmSocket = io(`${SERVER_URL}/matchmaking`, {
      auth:       { token },
      transports: ['websocket'],
    });

    this._mmSocket.on('connect',        () => this._emit('mm:connected'));
    this._mmSocket.on('mm:queued',      (d) => this._emit('mm:queued',     d));
    this._mmSocket.on('mm:found',       (d) => { this._emit('mm:found', d); this._mmSocket.emit('mm:accept', { lobbyId: d.lobbyId }); });
    this._mmSocket.on('mm:match_ready', (d) => this._emit('mm:matched',    d));
    this._mmSocket.on('mm:left',        (d) => this._emit('mm:cancelled',  d));
    this._mmSocket.on('mm:error',       (d) => this._emit('mm:error',      d));
    this._mmSocket.on('mm:requeued',    (d) => this._emit('mm:requeued',   d));
    this._mmSocket.on('disconnect', () => this._emit('mm:disconnected'));
  }

  disconnect() {
    clearInterval(this._pingTimer);
    this._socket?.disconnect();
    this._mmSocket?.disconnect();
    this._connected = false;
    this._entityBuffers.clear();
    this._pendingInputs = [];
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Sending game input
  // ─────────────────────────────────────────────────────────────────────

  sendMove(position, rotation, velocity, stance) {
    if (!this._connected) return;
    const seq = ++this._inputSequence;
    const data = { position, rotation, velocity, stance, seq, t: Date.now() };
    this._socket.emit('player:move', data);
    // Store for reconciliation
    this._pendingInputs.push(data);
    if (this._pendingInputs.length > INPUT_BUFFER_SIZE) this._pendingInputs.shift();
  }

  sendShoot(origin, direction) {
    if (!this._connected) return;
    this._socket.emit('player:shoot', { origin, direction, t: Date.now() });
  }

  sendReload() {
    if (!this._connected) return;
    this._socket.emit('player:reload');
  }

  sendLoot(lootId) {
    if (!this._connected) return;
    this._socket.emit('player:loot', { lootId });
  }

  sendDrop(itemId) {
    if (!this._connected) return;
    this._socket.emit('player:drop', { itemId });
  }

  sendEquip(slot) {
    if (!this._connected) return;
    this._socket.emit('player:equip', { slot });
  }

  sendUseItem(itemId) {
    if (!this._connected) return;
    this._socket.emit('player:use', { itemId });
  }

  sendVehicleEnter(vehicleId, preferredSeat = 0) {
    if (!this._connected) return;
    this._socket.emit('player:vehicle_enter', { vehicleId, preferredSeat });
  }

  sendVehicleExit() {
    if (!this._connected) return;
    this._socket.emit('player:vehicle_exit');
  }

  sendVehicleSteer(throttle, steer, brake) {
    if (!this._connected) return;
    this._socket.emit('player:vehicle_steer', { throttle, steer, brake });
  }

  sendGrenadeThrow(itemId, direction, power) {
    if (!this._connected) return;
    this._socket.emit('player:grenade_throw', { itemId, direction, power });
  }

  sendChat(message, channel = 'team') {
    if (!this._connected) return;
    this._socket.emit('player:chat', { message, channel });
  }

  sendEmote(emoteId) {
    if (!this._connected) return;
    this._socket.emit('player:emote', { emoteId });
  }

  sendPing() {
    if (!this._connected) return;
    this._pingTime = Date.now();
    this._socket.emit('player:ping', { clientTime: this._pingTime });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Matchmaking
  // ─────────────────────────────────────────────────────────────────────

  joinQueue(mode, region) {
    this._mmSocket?.emit('mm:join', { mode, region });
  }

  leaveQueue() {
    this._mmSocket?.emit('mm:leave');
  }

  // ─────────────────────────────────────────────────────────────────────
  //  World state — entity interpolation
  // ─────────────────────────────────────────────────────────────────────

  _onWorldState(data) {
    // Buffer incoming snapshots for interpolation
    for (const p of data.players) {
      if (!this._entityBuffers.has(p.id)) {
        this._entityBuffers.set(p.id, []);
      }
      const buf = this._entityBuffers.get(p.id);
      buf.push({ t: data.t, ...p });
      // Keep only last 20 snapshots
      if (buf.length > 20) buf.shift();
    }

    // Clean up entities that are no longer in the state
    const currentIds = new Set(data.players.map(p => p.id));
    for (const id of this._entityBuffers.keys()) {
      if (!currentIds.has(id)) this._entityBuffers.delete(id);
    }

    this._emit('world:state', data);
  }

  // Returns interpolated state for a given entity at current render time
  getInterpolatedState(entityId) {
    const buf = this._entityBuffers.get(entityId);
    if (!buf || buf.length === 0) return null;

    const renderTime = Date.now() - INTERP_DELAY_MS;

    // Find two frames to interpolate between
    let before = null;
    let after  = null;

    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].t <= renderTime) { before = buf[i]; break; }
      after = buf[i];
    }

    if (!before) return after || buf[0];
    if (!after)  return before;

    // Lerp between before and after
    const t = (renderTime - before.t) / (after.t - before.t);
    return {
      id:    entityId,
      alive: after.alive,
      hp:    after.hp,
      armor: after.armor,
      slot:  after.slot,
      stance: after.stance,
      pos: {
        x: lerp(before.pos.x, after.pos.x, t),
        y: lerp(before.pos.y, after.pos.y, t),
        z: lerp(before.pos.z, after.pos.z, t),
      },
      rot: {
        x: lerpAngle(before.rot.x, after.rot.x, t),
        y: lerpAngle(before.rot.y, after.rot.y, t),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Event system
  // ─────────────────────────────────────────────────────────────────────

  on(event, fn) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    if (!this._handlers[event]) return;
    this._handlers[event] = this._handlers[event].filter(h => h !== fn);
  }

  _emit(event, data) {
    if (!this._handlers[event]) return;
    for (const fn of this._handlers[event]) {
      try { fn(data); } catch (err) { console.error(`[Network] Handler error for ${event}:`, err); }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Internal lifecycle
  // ─────────────────────────────────────────────────────────────────────

  _onConnect() {
    this._connected = true;
    console.log('[Network] Connected to game server');
    this._emit('connected');
    // Start RTT measurement
    this._pingTimer = setInterval(() => this.sendPing(), 2000);
  }

  _onDisconnect(reason) {
    this._connected = false;
    clearInterval(this._pingTimer);
    console.warn('[Network] Disconnected:', reason);
    this._emit('disconnected', { reason });
  }

  _onConnectError(err) {
    console.error('[Network] Connection error:', err.message);
    this._emit('connect_error', { message: err.message });
  }

  isConnected() { return this._connected; }
}

function lerp(a, b, t)      { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI)   diff -= Math.PI * 2;
  while (diff < -Math.PI)  diff += Math.PI * 2;
  return a + diff * t;
}
