'use strict';

const { v4: uuidv4 } = require('uuid');

// Maximum hitscan distance before damage falloff reaches minimum
const MAX_RANGE = 1200;

// Active projectile tick rate (grenades, slow projectiles)
const PROJECTILE_GRAVITY = 9.8;  // m/s²

class BulletPhysics {
  constructor() {
    /** @type {Map<string, object>} grenadeId → grenade state */
    this._projectiles = new Map();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Hitscan (instant-travel bullets)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Fire a hitscan bullet from origin in direction.
   * Returns array of hits sorted by distance ascending.
   */
  fireHitscan(origin, direction, weapon, shooterId, players, vehicles) {
    const hits = [];
    const maxDist = weapon.range * 2;  // test up to 2× effective range

    // Normalise direction
    const len = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2);
    const dir = {
      x: direction.x / len,
      y: direction.y / len,
      z: direction.z / len,
    };

    // Test all players
    for (const [id, player] of players) {
      if (id === shooterId || !player.alive) continue;
      const hit = this._rayCapsuleIntersect(origin, dir, player.position, 0.4, 1.8);
      if (hit && hit.t >= 0 && hit.t <= maxDist) {
        hits.push({
          type:      'player',
          targetId:  id,
          distance:  hit.t,
          position:  this._pointAlongRay(origin, dir, hit.t),
          bodyPart:  this._bodyPartFromHit(player.position, hit.y),
          weapon,
          attackerId: shooterId,
        });
      }
    }

    // Test vehicles (simple AABB)
    for (const vehicle of vehicles) {
      const hit = this._rayBoxIntersect(origin, dir, vehicle.position, vehicle.size || { x: 3, y: 2, z: 5 });
      if (hit && hit.t >= 0 && hit.t <= maxDist) {
        hits.push({
          type:      'vehicle',
          targetId:  vehicle.id,
          distance:  hit.t,
          position:  this._pointAlongRay(origin, dir, hit.t),
          bodyPart:  'body',
          weapon,
          attackerId: shooterId,
        });
      }
    }

    // Sort by distance; closest target first (bullet stops at first solid hit)
    hits.sort((a, b) => a.distance - b.distance);

    // Pellet weapons (shotguns) return all hits from a single hitscan fan
    // For single-pellet weapons, return only the first hit
    if (weapon.pellets === 1) return hits.slice(0, 1);
    return hits;
  }

  /**
   * Fire a shotgun blast: fan weapon.pellets hitscan rays within spread cone
   */
  fireShotgunBlast(origin, direction, weapon, shooterId, players, vehicles) {
    const allHits = [];
    for (let i = 0; i < weapon.pellets; i++) {
      const spread = weapon.adsSpread * 1.5;   // use ADS spread for server authority
      const spreadDir = {
        x: direction.x + (Math.random() - 0.5) * spread,
        y: direction.y + (Math.random() - 0.5) * spread,
        z: direction.z + (Math.random() - 0.5) * spread,
      };
      const hits = this.fireHitscan(origin, spreadDir, weapon, shooterId, players, vehicles);
      for (const h of hits) {
        h.pellet = i;
        allHits.push(h);
      }
    }
    return allHits;
  }

  calculateDamage(weapon, distance, bodyPart, target) {
    let dmg;

    if (distance <= weapon.range) {
      dmg = weapon.damage;
    } else {
      // Linear falloff between effective range and max range
      const falloff = 1 - Math.min(1, (distance - weapon.range) / (MAX_RANGE - weapon.range));
      dmg = weapon.minDamage + (weapon.damage - weapon.minDamage) * falloff;
    }

    // Headshot bonus
    if (bodyPart === 'head') dmg *= weapon.headMultiplier;

    return Math.max(1, Math.round(dmg));
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Projectile grenades
  // ─────────────────────────────────────────────────────────────────────

  throwGrenade(grenadeId, type, origin, direction, power, ownerId, onExplode) {
    const speed = Math.min(power, 1) * 20;  // max 20 m/s
    const len = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2);
    const proj = {
      id:       grenadeId,
      type,
      ownerId,
      position: { ...origin },
      velocity: {
        x: (direction.x / len) * speed,
        y: (direction.y / len) * speed + 5,   // upward arc
        z: (direction.z / len) * speed,
      },
      spawnedAt: Date.now(),
      fuseMs:    this._getFuseMs(type),
      onExplode,
      bounces:   0,
    };
    this._projectiles.set(grenadeId, proj);
  }

  tick(dt) {
    const hits = [];
    const now  = Date.now();

    for (const [id, proj] of this._projectiles) {
      // Update position with gravity
      proj.velocity.y -= PROJECTILE_GRAVITY * dt;
      proj.position.x += proj.velocity.x * dt;
      proj.position.y += proj.velocity.y * dt;
      proj.position.z += proj.velocity.z * dt;

      // Bounce off ground
      if (proj.position.y < 0.2) {
        proj.position.y = 0.2;
        proj.velocity.y = Math.abs(proj.velocity.y) * 0.4;
        proj.velocity.x *= 0.7;
        proj.velocity.z *= 0.7;
        proj.bounces++;
      }

      // Fuse detonation
      if (now - proj.spawnedAt >= proj.fuseMs) {
        const explosion = this._buildExplosion(proj);
        proj.onExplode(explosion);
        this._projectiles.delete(id);
      }
    }

    return hits;
  }

  getProjectileSnapshot() {
    return [...this._projectiles.values()].map(p => ({
      id:       p.id,
      type:     p.type,
      position: p.position,
      velocity: p.velocity,
    }));
  }

  clear() { this._projectiles.clear(); }

  // ─────────────────────────────────────────────────────────────────────
  //  Ray-intersection utilities
  // ─────────────────────────────────────────────────────────────────────

  /** Intersect ray with vertical capsule (player hitbox). Returns {t, y} or null */
  _rayCapsuleIntersect(rayOrigin, rayDir, capsuleBase, radius, height) {
    // Approximate capsule as infinite cylinder capped — test cylinder first
    const oc = {
      x: rayOrigin.x - capsuleBase.x,
      z: rayOrigin.z - capsuleBase.z,
    };
    const a = rayDir.x ** 2 + rayDir.z ** 2;
    const b = 2 * (oc.x * rayDir.x + oc.z * rayDir.z);
    const c = oc.x ** 2 + oc.z ** 2 - radius ** 2;
    const disc = b ** 2 - 4 * a * c;

    if (disc < 0) return null;

    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0) return null;

    const hitY = rayOrigin.y + rayDir.y * t;
    if (hitY < capsuleBase.y || hitY > capsuleBase.y + height) return null;

    return { t, y: hitY - capsuleBase.y };
  }

  /** Intersect ray with AABB (vehicle). Returns {t} or null */
  _rayBoxIntersect(rayOrigin, rayDir, boxCenter, boxSize) {
    const half = { x: boxSize.x / 2, y: boxSize.y / 2, z: boxSize.z / 2 };
    const min  = { x: boxCenter.x - half.x, y: boxCenter.y, z: boxCenter.z - half.z };
    const max  = { x: boxCenter.x + half.x, y: boxCenter.y + boxSize.y, z: boxCenter.z + half.z };

    let tmin = -Infinity, tmax = Infinity;
    for (const axis of ['x', 'y', 'z']) {
      if (Math.abs(rayDir[axis]) < 1e-8) {
        if (rayOrigin[axis] < min[axis] || rayOrigin[axis] > max[axis]) return null;
      } else {
        const t1 = (min[axis] - rayOrigin[axis]) / rayDir[axis];
        const t2 = (max[axis] - rayOrigin[axis]) / rayDir[axis];
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      }
    }
    if (tmax < tmin || tmax < 0) return null;
    return { t: tmin >= 0 ? tmin : tmax };
  }

  _pointAlongRay(origin, dir, t) {
    return { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t };
  }

  _bodyPartFromHit(capsuleBase, relY) {
    const frac = relY / 1.8;
    if (frac > 0.85) return 'head';
    if (frac > 0.55) return 'chest';
    if (frac > 0.30) return 'stomach';
    return 'legs';
  }

  _getFuseMs(type) {
    switch (type) {
      case 'frag':      return 4000;
      case 'smoke':     return 2000;
      case 'flashbang': return 2000;
      case 'molotov':   return 100;   // ignites on impact
      default:          return 4000;
    }
  }

  _buildExplosion(proj) {
    const specs = {
      frag:      { radius: 6,  maxDamage: 180 },
      smoke:     { radius: 8,  maxDamage: 0   },
      flashbang: { radius: 5,  maxDamage: 0   },
      molotov:   { radius: 4,  maxDamage: 10  },
    };
    const spec = specs[proj.type] || specs.frag;
    return {
      center:    { ...proj.position },
      radius:    spec.radius,
      maxDamage: spec.maxDamage,
      ownerId:   proj.ownerId,
      type:      proj.type,
    };
  }
}

module.exports = BulletPhysics;
