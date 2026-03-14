'use strict';

// Maximum allowed movement per server tick (64Hz → 15.6 ms)
// At max sprint speed ~8 m/s → 8 * 0.0625 = 0.5 m per tick
const MAX_MOVE_PER_TICK_M   = 1.2;   // generous buffer for latency
const MAX_MOVE_PER_TICK_SQ  = MAX_MOVE_PER_TICK_M ** 2;

// Maximum shot rate: engine allows firing up to 1.5× declared RPM (lag buffer)
const SHOT_RATE_TOLERANCE   = 1.5;

// Maximum bullet origin distance from player (lag / interpolation buffer)
const MAX_SHOT_ORIGIN_DIST  = 10;

class AntiCheat {
  constructor() {
    // Per-player violation counters
    this._violations = new Map();  // playerId → { speedhack, aimbot, shots }
  }

  /**
   * Validate a movement packet.
   * Returns a violation description string, or null if valid.
   */
  validateMove(player, data) {
    if (!data || !data.position) return 'missing_position';

    const dx = data.position.x - player.position.x;
    const dy = data.position.y - player.position.y;
    const dz = data.position.z - player.position.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    // Skip check for very small movements
    if (distSq < 0.01) return null;

    // Vertical teleport — allow large Y delta for jumping off vehicles / falling
    // but horizontal must be bounded
    const hDistSq = dx * dx + dz * dz;
    if (hDistSq > MAX_MOVE_PER_TICK_SQ * 400) {
      // Factor of 400 = ~(20 ticks of movement in one packet) — catches teleports
      this._recordViolation(player.id, 'speedhack');
      return `speedhack: moved ${Math.sqrt(hDistSq).toFixed(2)}m horizontally`;
    }

    return null;
  }

  /**
   * Validate a shoot packet.
   * Returns violation string or null.
   */
  validateShot(player, data, weapon) {
    if (!data || !data.origin || !data.direction) return 'missing_shot_data';

    // Origin must be near player position
    const dist = this._distance(data.origin, player.position);
    if (dist > MAX_SHOT_ORIGIN_DIST) {
      this._recordViolation(player.id, 'shot_origin');
      return `shot origin ${dist.toFixed(2)}m from player`;
    }

    // Rate-of-fire check
    const minIntervalMs = (1000 / weapon.rateOfFire) / SHOT_RATE_TOLERANCE;
    if (player._lastShotAt && Date.now() - player._lastShotAt < minIntervalMs) {
      this._recordViolation(player.id, 'rapid_fire');
      return `rapid_fire: ${Date.now() - player._lastShotAt}ms < ${minIntervalMs.toFixed(0)}ms`;
    }

    // Direction must be a unit vector (within tolerance)
    const len = Math.sqrt(data.direction.x ** 2 + data.direction.y ** 2 + data.direction.z ** 2);
    if (Math.abs(len - 1) > 0.1) {
      return 'invalid_direction_vector';
    }

    return null;
  }

  getViolations(playerId) {
    return this._violations.get(playerId) || { speedhack: 0, shot_origin: 0, rapid_fire: 0 };
  }

  isBanned(playerId) {
    const v = this.getViolations(playerId);
    return (v.speedhack > 5) || (v.shot_origin > 10) || (v.rapid_fire > 20);
  }

  _recordViolation(playerId, type) {
    if (!this._violations.has(playerId)) {
      this._violations.set(playerId, { speedhack: 0, shot_origin: 0, rapid_fire: 0 });
    }
    const v = this._violations.get(playerId);
    v[type] = (v[type] || 0) + 1;
    console.warn(`[AntiCheat] Player ${playerId} violation #${v[type]} type=${type}`);
  }

  _distance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  }
}

module.exports = AntiCheat;
