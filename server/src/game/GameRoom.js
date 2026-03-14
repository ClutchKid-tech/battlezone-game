'use strict';

const { v4: uuidv4 } = require('uuid');
const Player = require('./Player');
const Zone = require('./Zone');
const LootSystem = require('./LootSystem');
const BulletPhysics = require('./BulletPhysics');
const VehicleSystem = require('./VehicleSystem');
const AntiCheat = require('./AntiCheat');
const { saveMatchResult } = require('../db/postgres');

// Game phases
const PHASE = Object.freeze({
  WAITING:    'waiting',
  COUNTDOWN:  'countdown',
  ACTIVE:     'active',
  ENDED:      'ended',
});

// Tick rates
const TICK_RATE = parseInt(process.env.TICK_RATE || '64', 10);  // Hz
const TICK_MS   = Math.floor(1000 / TICK_RATE);
const BROADCAST_DIVISOR = 2;  // Broadcast world state every 2nd tick (32 Hz)

// Map constants
const MAP_SIZE        = 4000;   // 4 km
const MAX_PLAYERS     = 100;
const COUNTDOWN_SECS  = 30;
const MIN_START       = parseInt(process.env.MIN_START_PLAYERS || '2', 10);

class GameRoom {
  constructor(roomId, pendingPlayers, mode, region, io) {
    this.roomId  = roomId;
    this.mode    = mode;     // 'solo' | 'duo' | 'squad'
    this.region  = region;
    this.io      = io;
    this.ns      = io.of('/game');

    // Core game state
    /** @type {Map<string, Player>} */
    this.players   = new Map();
    this.phase     = PHASE.WAITING;
    this.tickCount = 0;
    this.startedAt = null;
    this.endedAt   = null;
    this._tickTimer = null;

    // Subsystems
    this.zone     = new Zone(MAP_SIZE);
    this.loot     = new LootSystem(MAP_SIZE);
    this.bullets  = new BulletPhysics();
    this.vehicles = new VehicleSystem();
    this.antiCheat = new AntiCheat();

    // Kill feed (last 10 events)
    this.killFeed = [];

    // Squad/team assignments
    this.squads = new Map();  // squadId → Set<playerId>

    // Register pending players (from matchmaking)
    for (const p of pendingPlayers) {
      this._registerPendingPlayer(p.userId, p.username, p.squadId);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Lifecycle
  // ─────────────────────────────────────────────────────────────────────

  start() {
    this.loot.spawnInitialLoot();
    this.vehicles.spawnInitialVehicles();
    this._beginCountdown();
  }

  forceEnd(reason) {
    this._endGame(reason);
  }

  dispose() {
    clearTimeout(this._countdownTimer);
    clearInterval(this._tickTimer);
    this.players.clear();
    this.loot.clear();
    this.bullets.clear();
    this.vehicles.clear();
  }

  isFinished() { return this.phase === PHASE.ENDED; }

  // ─────────────────────────────────────────────────────────────────────
  //  Connection management
  // ─────────────────────────────────────────────────────────────────────

  addSocket(socket, userId, username) {
    let player = this.players.get(userId);

    if (!player) {
      // Late-join or spectator — only allow during WAITING/COUNTDOWN
      if (this.phase === PHASE.ACTIVE) {
        socket.emit('error', { code: 'MATCH_IN_PROGRESS' });
        socket.disconnect(true);
        return;
      }
      player = this._registerPendingPlayer(userId, username, null);
    }

    player.socket = socket;
    player.connected = true;
    socket.join(this.roomId);

    this._bindSocketEvents(socket, player);

    // Send current state snapshot
    socket.emit('room:state', this._buildFullStateSnapshot(player));

    console.log(`[Room ${this.roomId}] Player ${username} (${userId}) connected`);

    if (this.phase === PHASE.WAITING && this.players.size >= MIN_START) {
      this._beginCountdown();
    }
  }

  _bindSocketEvents(socket, player) {
    // Player input — high frequency
    socket.on('player:move',  (data) => this._handleMove(socket, player, data));
    socket.on('player:shoot', (data) => this._handleShoot(socket, player, data));
    socket.on('player:reload', ()    => this._handleReload(player));
    socket.on('player:loot',  (data) => this._handleLoot(player, data));
    socket.on('player:drop',  (data) => this._handleDrop(player, data));
    socket.on('player:equip', (data) => this._handleEquip(player, data));
    socket.on('player:use',   (data) => this._handleUseItem(player, data));
    socket.on('player:vehicle_enter',  (data) => this._handleVehicleEnter(player, data));
    socket.on('player:vehicle_exit',   ()     => this._handleVehicleExit(player));
    socket.on('player:vehicle_steer',  (data) => this._handleVehicleSteer(player, data));
    socket.on('player:grenade_throw',  (data) => this._handleGrenadeThrow(player, data));
    socket.on('player:ping',  (data) => this._handlePing(socket, player, data));
    socket.on('player:chat',  (data) => this._handleChat(socket, player, data));
    socket.on('player:emote', (data) => this._handleEmote(player, data));

    socket.on('disconnect', (reason) => {
      player.connected = false;
      player.socket = null;
      console.log(`[Room ${this.roomId}] Player ${player.username} disconnected: ${reason}`);
      // Keep player in game but mark as disconnected — they have 30s to reconnect
      if (this.phase === PHASE.ACTIVE) {
        this._scheduleDisconnectKill(player);
      }
    });
  }

  hasPlayer(userId) { return this.players.has(userId); }

  // ─────────────────────────────────────────────────────────────────────
  //  Game flow
  // ─────────────────────────────────────────────────────────────────────

  _beginCountdown() {
    if (this.phase !== PHASE.WAITING) return;
    this.phase = PHASE.COUNTDOWN;
    this._broadcastToRoom('room:countdown', { seconds: COUNTDOWN_SECS });
    this._countdownTimer = setTimeout(() => this._startMatch(), COUNTDOWN_SECS * 1000);
    console.log(`[Room ${this.roomId}] Countdown started`);
  }

  _startMatch() {
    this.phase     = PHASE.ACTIVE;
    this.startedAt = Date.now();

    // Spawn players at random positions around the map edge (bus drop)
    for (const player of this.players.values()) {
      player.spawn(this._generateSpawnPosition());
    }

    this.zone.start();

    this._tickTimer = setInterval(() => this._tick(), TICK_MS);
    this._broadcastToRoom('room:start', {
      mapSize: MAP_SIZE,
      players: this._buildPlayersSnapshot(),
      vehicles: this.vehicles.getSnapshot(),
      loot: this.loot.getSnapshot(),
      zone: this.zone.getSnapshot(),
    });
    console.log(`[Room ${this.roomId}] Match started with ${this.players.size} players`);
  }

  _tick() {
    if (this.phase !== PHASE.ACTIVE) return;
    this.tickCount++;
    const dt = TICK_MS / 1000;  // delta time in seconds

    // 1. Advance zone
    this.zone.tick(dt);

    // 2. Update vehicle physics
    this.vehicles.tick(dt, this.players);

    // 3. Process bullets in flight (for projectile weapons)
    const bulletHits = this.bullets.tick(dt);
    for (const hit of bulletHits) {
      this._applyBulletHit(hit);
    }

    // 4. Apply zone damage to out-of-zone players
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      if (!this.zone.isInSafeZone(player.position)) {
        const dmg = this.zone.getDamagePerSecond() * dt;
        this._applyDamage(player, dmg, null, 'zone');
      }
      // Vehicle damage pass-through
      if (player.inVehicle) {
        const vehicle = this.vehicles.getVehicle(player.inVehicle);
        if (vehicle && vehicle.health <= 0) {
          this._applyDamage(player, 999, null, 'vehicle_explosion');
        }
      }
    }

    // 5. Check win condition
    const alive = this._getAlivePlayers();
    if (alive.length <= (this.mode === 'solo' ? 1 : 0)) {
      const winner = alive[0] || null;
      this._endGame('elimination', winner);
      return;
    }

    // 6. Broadcast state at 32 Hz (every 2nd tick)
    if (this.tickCount % BROADCAST_DIVISOR === 0) {
      this._broadcastWorldState();
    }
  }

  _endGame(reason, winner = null) {
    if (this.phase === PHASE.ENDED) return;
    clearInterval(this._tickTimer);
    clearTimeout(this._countdownTimer);
    this.phase   = PHASE.ENDED;
    this.endedAt = Date.now();

    const results = this._buildMatchResults(winner);
    this._broadcastToRoom('room:end', { reason, results });

    // Persist results asynchronously
    saveMatchResult(this.roomId, results).catch((err) =>
      console.error(`[Room ${this.roomId}] Failed to save match result:`, err.message)
    );
    console.log(`[Room ${this.roomId}] Ended: ${reason}, winner=${winner?.username || 'none'}`);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Input handlers
  // ─────────────────────────────────────────────────────────────────────

  _handleMove(socket, player, data) {
    if (!player.alive || this.phase !== PHASE.ACTIVE) return;

    const violation = this.antiCheat.validateMove(player, data);
    if (violation) {
      console.warn(`[AntiCheat] ${player.username}: ${violation}`);
      // Snap player back
      socket.emit('player:snap', { position: player.position, rotation: player.rotation });
      return;
    }

    player.position  = data.position;
    player.rotation  = data.rotation;
    player.velocity  = data.velocity;
    player.stance    = data.stance || 'stand';   // 'stand' | 'crouch' | 'prone'
    player.lastInput = Date.now();
  }

  _handleShoot(socket, player, data) {
    if (!player.alive || this.phase !== PHASE.ACTIVE) return;

    const weapon = player.getEquippedWeapon();
    if (!weapon) return;
    if (!player.canShoot()) return;

    const violation = this.antiCheat.validateShot(player, data, weapon);
    if (violation) {
      console.warn(`[AntiCheat] ${player.username} shot violation: ${violation}`);
      return;
    }

    player.recordShot();
    player.ammo[weapon.id] = (player.ammo[weapon.id] || 0) - 1;

    // Perform server-side hit scan
    const hits = this.bullets.fireHitscan(
      data.origin,
      data.direction,
      weapon,
      player.id,
      this.players,
      this.vehicles.getAll()
    );

    for (const hit of hits) {
      if (hit.type === 'player') {
        const target = this.players.get(hit.targetId);
        if (target && target.alive) {
          const dmg = this.bullets.calculateDamage(weapon, hit.distance, hit.bodyPart, target);
          this._applyDamage(target, dmg, player, 'bullet', hit.bodyPart);
        }
      } else if (hit.type === 'vehicle') {
        this.vehicles.applyDamage(hit.targetId, this.bullets.calculateDamage(weapon, hit.distance, 'body', null));
      }
    }

    // Notify the shooter of confirmed shots for VFX
    socket.emit('shoot:confirmed', { hits: hits.map(h => ({ type: h.type, position: h.position })) });

    // Broadcast muzzle flash / sound to nearby players
    this._broadcastToRoom('player:shot', {
      playerId:  player.id,
      origin:    data.origin,
      direction: data.direction,
      weaponId:  weapon.id,
    });
  }

  _handleReload(player) {
    if (!player.alive || this.phase !== PHASE.ACTIVE) return;
    const weapon = player.getEquippedWeapon();
    if (!weapon || player.isReloading) return;

    const ammoInInventory = player.inventory.getAmmo(weapon.ammoType);
    if (ammoInInventory <= 0) return;

    player.startReload(weapon, () => {
      const needed  = weapon.magazineSize - player.currentMag[weapon.id];
      const toLoad  = Math.min(needed, ammoInInventory);
      player.currentMag[weapon.id] = (player.currentMag[weapon.id] || 0) + toLoad;
      player.inventory.consumeAmmo(weapon.ammoType, toLoad);
      if (player.socket) {
        player.socket.emit('reload:complete', {
          weaponId: weapon.id,
          ammo:     player.currentMag[weapon.id],
          reserve:  player.inventory.getAmmo(weapon.ammoType),
        });
      }
    });

    this._broadcastToRoom('player:reloading', { playerId: player.id, weaponId: weapon.id, duration: weapon.reloadTime });
  }

  _handleLoot(player, data) {
    if (!player.alive || this.phase !== PHASE.ACTIVE) return;
    const { lootId } = data;

    const item = this.loot.getItem(lootId);
    if (!item) return;

    // Must be within 3 metres to loot
    const dist = this._distance(player.position, item.position);
    if (dist > 3) {
      player.socket?.emit('loot:out_of_range', { lootId });
      return;
    }

    const added = player.inventory.addItem(item);
    if (!added) {
      player.socket?.emit('loot:inventory_full', { lootId });
      return;
    }

    this.loot.removeItem(lootId);
    this._broadcastToRoom('loot:removed', { lootId, pickedUpBy: player.id });
    player.socket?.emit('inventory:update', player.inventory.serialize());
  }

  _handleDrop(player, data) {
    if (!player.alive || this.phase !== PHASE.ACTIVE) return;
    const { itemId } = data;
    const item = player.inventory.removeItem(itemId);
    if (!item) return;

    const dropPos = { ...player.position, y: player.position.y + 0.1 };
    const lootId  = this.loot.spawnItem(item, dropPos);
    this._broadcastToRoom('loot:spawned', { lootId, item, position: dropPos });
    player.socket?.emit('inventory:update', player.inventory.serialize());
  }

  _handleEquip(player, data) {
    if (!player.alive || this.phase !== PHASE.ACTIVE) return;
    player.equipSlot(data.slot);
    player.socket?.emit('equip:ok', { slot: data.slot });
    this._broadcastToRoom('player:equip', { playerId: player.id, slot: data.slot });
  }

  _handleUseItem(player, data) {
    if (!player.alive || this.phase !== PHASE.ACTIVE) return;
    const { itemId } = data;
    const item = player.inventory.getItem(itemId);
    if (!item || item.type !== 'consumable') return;

    const used = player.useConsumable(item, () => {
      player.inventory.removeItem(itemId);
      player.socket?.emit('inventory:update', player.inventory.serialize());
    });

    if (used) {
      this._broadcastToRoom('player:heal', { playerId: player.id, itemType: item.subtype });
    }
  }

  _handleVehicleEnter(player, data) {
    if (!player.alive || this.phase !== PHASE.ACTIVE) return;
    const vehicle = this.vehicles.getVehicle(data.vehicleId);
    if (!vehicle) return;

    const dist = this._distance(player.position, vehicle.position);
    if (dist > 5) { player.socket?.emit('vehicle:too_far'); return; }

    const seat = this.vehicles.enterVehicle(vehicle.id, player.id, data.preferredSeat);
    if (seat === -1) { player.socket?.emit('vehicle:full'); return; }

    player.inVehicle = vehicle.id;
    player.vehicleSeat = seat;
    this._broadcastToRoom('vehicle:entered', { vehicleId: vehicle.id, playerId: player.id, seat });
  }

  _handleVehicleExit(player) {
    if (!player.inVehicle) return;
    const exitPos = this.vehicles.exitVehicle(player.inVehicle, player.id);
    player.position = exitPos;
    player.inVehicle = null;
    player.vehicleSeat = null;
    this._broadcastToRoom('vehicle:exited', { vehicleId: player.inVehicle, playerId: player.id, position: exitPos });
  }

  _handleVehicleSteer(player, data) {
    if (!player.inVehicle || player.vehicleSeat !== 0) return;  // driver only
    this.vehicles.applyInput(player.inVehicle, data);
  }

  _handleGrenadeThrow(player, data) {
    if (!player.alive || this.phase !== PHASE.ACTIVE) return;
    const { itemId, direction, power } = data;

    const item = player.inventory.getItem(itemId);
    if (!item || item.type !== 'throwable') return;

    player.inventory.removeItem(itemId);
    player.socket?.emit('inventory:update', player.inventory.serialize());

    const grenadeId = uuidv4();
    this.bullets.throwGrenade(grenadeId, item.subtype, player.position, direction, power, player.id, (explosion) => {
      this._applyExplosion(explosion);
      this._broadcastToRoom('grenade:explode', { grenadeId, ...explosion });
    });

    this._broadcastToRoom('grenade:thrown', {
      grenadeId,
      playerId: player.id,
      itemType: item.subtype,
      origin:   player.position,
      direction,
      power,
    });
  }

  _handlePing(socket, player, data) {
    socket.emit('pong', { clientTime: data.clientTime, serverTime: Date.now() });
  }

  _handleChat(socket, player, data) {
    const msg = String(data.message || '').slice(0, 200).trim();
    if (!msg) return;
    const filtered = this._filterProfanity(msg);
    const payload = {
      from:    player.id,
      name:    player.username,
      message: filtered,
      channel: data.channel || 'team',   // 'team' | 'all'
    };
    if (payload.channel === 'team') {
      this._broadcastToSquad(player.squadId, 'chat:message', payload);
    } else {
      this._broadcastToRoom('chat:message', payload);
    }
  }

  _handleEmote(player, data) {
    if (!player.alive) return;
    this._broadcastToRoom('player:emote', { playerId: player.id, emoteId: data.emoteId });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Damage / death
  // ─────────────────────────────────────────────────────────────────────

  _applyDamage(target, damage, attacker, source, bodyPart = 'body') {
    if (!target.alive) return;

    const netDamage = target.applyDamage(damage, bodyPart);

    const payload = {
      targetId:  target.id,
      damage:    netDamage,
      source,
      bodyPart,
      attackerId: attacker?.id || null,
      health:    target.health,
      armor:     target.armor,
    };

    // Notify target
    target.socket?.emit('player:damaged', payload);
    // Notify attacker for hit markers
    if (attacker?.socket) attacker.socket.emit('hitmarker', { targetId: target.id, damage: netDamage, bodyPart });

    if (target.health <= 0) {
      this._killPlayer(target, attacker, source);
    }
  }

  _applyBulletHit(hit) {
    if (hit.type !== 'player') return;
    const target   = this.players.get(hit.targetId);
    const attacker = this.players.get(hit.attackerId);
    if (!target || !target.alive) return;
    const dmg = this.bullets.calculateDamage(hit.weapon, hit.distance, hit.bodyPart, target);
    this._applyDamage(target, dmg, attacker, 'bullet', hit.bodyPart);
  }

  _applyExplosion({ center, radius, maxDamage, ownerId, type }) {
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      const dist = this._distance(player.position, center);
      if (dist > radius) continue;
      const falloff = 1 - (dist / radius);
      const dmg     = maxDamage * falloff;
      const attacker = this.players.get(ownerId);
      this._applyDamage(player, dmg, attacker, `explosion_${type}`);
    }
    // Vehicle explosion damage
    for (const vehicle of this.vehicles.getAll()) {
      const dist = this._distance(vehicle.position, center);
      if (dist < radius) {
        this.vehicles.applyDamage(vehicle.id, maxDamage * (1 - dist / radius));
      }
    }
  }

  _killPlayer(player, killer, source) {
    player.alive  = false;
    player.killedAt = Date.now();
    player.killer = killer?.id || null;
    player.placement = this._getAlivePlayers().length + 1;

    if (player.inVehicle) {
      this.vehicles.exitVehicle(player.inVehicle, player.id);
      player.inVehicle = null;
    }

    // Drop inventory on death
    for (const item of player.inventory.items.values()) {
      const dropPos = {
        x: player.position.x + (Math.random() - 0.5) * 2,
        y: player.position.y,
        z: player.position.z + (Math.random() - 0.5) * 2,
      };
      const lootId = this.loot.spawnItem(item, dropPos);
      this._broadcastToRoom('loot:spawned', { lootId, item, position: dropPos });
    }

    if (killer) {
      killer.kills++;
      killer.socket?.emit('kill:confirmed', {
        targetId:   player.id,
        targetName: player.username,
        kills:      killer.kills,
        totalKills: killer.kills,
      });
    }

    const killEntry = {
      killerId:     killer?.id || null,
      killerName:   killer?.username || null,
      victimId:     player.id,
      victimName:   player.username,
      weapon:       source,
      timestamp:    Date.now(),
    };
    this.killFeed.push(killEntry);
    if (this.killFeed.length > 10) this.killFeed.shift();

    this._broadcastToRoom('player:killed', {
      ...killEntry,
      alivePlayers: this._getAlivePlayers().length,
    });
  }

  _scheduleDisconnectKill(player) {
    player._dcTimer = setTimeout(() => {
      if (!player.connected && player.alive) {
        this._killPlayer(player, null, 'disconnect');
      }
    }, 30_000);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Broadcasting
  // ─────────────────────────────────────────────────────────────────────

  _broadcastWorldState() {
    const state = {
      t:        Date.now(),
      tick:     this.tickCount,
      players:  [],
      vehicles: this.vehicles.getSnapshot(),
      zone:     this.zone.getSnapshot(),
      projectiles: this.bullets.getProjectileSnapshot(),
    };

    for (const p of this.players.values()) {
      if (!p.alive && !p.socket) continue;
      state.players.push({
        id:       p.id,
        pos:      p.position,
        rot:      p.rotation,
        vel:      p.velocity,
        hp:       p.health,
        armor:    p.armor,
        stance:   p.stance,
        alive:    p.alive,
        slot:     p.equippedSlot,
        inVehicle: p.inVehicle,
        vehicleSeat: p.vehicleSeat,
      });
    }

    this.ns.to(this.roomId).emit('world:state', state);
  }

  _broadcastToRoom(event, data) {
    this.ns.to(this.roomId).emit(event, data);
  }

  _broadcastToSquad(squadId, event, data) {
    const squad = this.squads.get(squadId);
    if (!squad) return;
    for (const pid of squad) {
      const p = this.players.get(pid);
      if (p?.socket) p.socket.emit(event, data);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Utilities
  // ─────────────────────────────────────────────────────────────────────

  _registerPendingPlayer(userId, username, squadId) {
    const player = new Player(userId, username, squadId);
    this.players.set(userId, player);

    if (squadId) {
      if (!this.squads.has(squadId)) this.squads.set(squadId, new Set());
      this.squads.get(squadId).add(userId);
    }
    return player;
  }

  _generateSpawnPosition() {
    // Players drop from a flight path across the map
    const t = Math.random();
    const pathY = 150;  // altitude in metres
    return {
      x: MAP_SIZE * 0.1 + MAP_SIZE * 0.8 * t + (Math.random() - 0.5) * 200,
      y: pathY,
      z: MAP_SIZE * 0.1 + (Math.random() - 0.5) * 100,
    };
  }

  _getAlivePlayers() {
    return [...this.players.values()].filter(p => p.alive);
  }

  _distance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  }

  _filterProfanity(text) {
    // Production: use a proper library like `bad-words` or Perspective API
    const blocked = ['spam', 'cheat'];
    let out = text;
    for (const word of blocked) {
      out = out.replace(new RegExp(word, 'gi'), '*'.repeat(word.length));
    }
    return out;
  }

  _buildFullStateSnapshot(forPlayer) {
    return {
      roomId:   this.roomId,
      mode:     this.mode,
      region:   this.region,
      phase:    this.phase,
      mapSize:  MAP_SIZE,
      you:      forPlayer.serialize(),
      players:  this._buildPlayersSnapshot(),
      vehicles: this.vehicles.getSnapshot(),
      loot:     this.loot.getSnapshot(),
      zone:     this.zone.getSnapshot(),
      killFeed: this.killFeed,
    };
  }

  _buildPlayersSnapshot() {
    return [...this.players.values()].map(p => ({
      id:       p.id,
      username: p.username,
      squadId:  p.squadId,
      pos:      p.position,
      rot:      p.rotation,
      hp:       p.health,
      armor:    p.armor,
      alive:    p.alive,
      kills:    p.kills,
    }));
  }

  _buildMatchResults(winner) {
    return {
      roomId:    this.roomId,
      mode:      this.mode,
      startedAt: this.startedAt,
      endedAt:   this.endedAt,
      duration:  this.endedAt - this.startedAt,
      winnerId:  winner?.id || null,
      winnerName: winner?.username || null,
      players:   [...this.players.values()].map(p => ({
        userId:     p.id,
        username:   p.username,
        kills:      p.kills,
        damage:     p.damageDealt,
        placement:  p.placement || (p.alive ? 1 : p.placement),
        survived:   p.alive,
        survivalMs: (p.killedAt || this.endedAt) - this.startedAt,
      })),
    };
  }

  getStats() {
    return {
      phase:        this.phase,
      totalPlayers: this.players.size,
      alivePlayers: this._getAlivePlayers().length,
      tickCount:    this.tickCount,
      uptime:       this.startedAt ? Date.now() - this.startedAt : 0,
    };
  }
}

module.exports = GameRoom;
