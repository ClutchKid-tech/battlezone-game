'use strict';

const { v4: uuidv4 } = require('uuid');

// Vehicle definitions
const VEHICLE_DEFS = {
  car: {
    type: 'car', name: 'UAZ', seats: 4,
    maxHealth: 1000, maxSpeed: 28, acceleration: 12,
    turnRate: 1.8, mass: 1800,
    size: { x: 2.2, y: 1.8, z: 4.5 },
    brakeForce: 20, drag: 0.4,
  },
  motorcycle: {
    type: 'motorcycle', name: 'Motorcycle', seats: 2,
    maxHealth: 400, maxSpeed: 40, acceleration: 20,
    turnRate: 2.5, mass: 280,
    size: { x: 1.0, y: 1.2, z: 2.2 },
    brakeForce: 30, drag: 0.3,
  },
  boat: {
    type: 'boat', name: 'Speed Boat', seats: 4,
    maxHealth: 600, maxSpeed: 22, acceleration: 8,
    turnRate: 1.0, mass: 1200,
    size: { x: 2.5, y: 1.5, z: 6.0 },
    brakeForce: 5, drag: 0.6,
    waterOnly: true,
  },
  buggy: {
    type: 'buggy', name: 'Dune Buggy', seats: 2,
    maxHealth: 500, maxSpeed: 35, acceleration: 18,
    turnRate: 2.2, mass: 600,
    size: { x: 1.8, y: 1.5, z: 3.0 },
    brakeForce: 25, drag: 0.35,
  },
};

// How many of each type spawn initially
const SPAWN_COUNTS = { car: 20, motorcycle: 15, boat: 8, buggy: 12 };

class Vehicle {
  constructor(type, position, rotation) {
    const def = VEHICLE_DEFS[type];
    if (!def) throw new Error(`Unknown vehicle type: ${type}`);

    this.id       = uuidv4();
    this.type     = type;
    this.name     = def.name;
    this.position = { ...position };
    this.rotation = rotation || 0;    // Y-axis rotation in radians
    this.velocity = { x: 0, y: 0, z: 0 };
    this.health   = def.maxHealth;
    this.maxHealth = def.maxHealth;
    this.maxSpeed = def.maxSpeed;
    this.acceleration = def.acceleration;
    this.turnRate = def.turnRate;
    this.mass     = def.mass;
    this.size     = { ...def.size };
    this.brakeForce = def.brakeForce;
    this.drag     = def.drag;
    this.seats    = def.seats;
    this.waterOnly = def.waterOnly || false;

    // seat index → playerId
    this.occupants = new Array(def.seats).fill(null);

    // Driver input
    this.throttle = 0;    // -1 to 1
    this.steering = 0;    // -1 to 1
    this.braking  = false;
    this.handbrake = false;

    this.destroyed = false;
    this.onFire    = false;
    this._fireTimer = null;
  }

  get speed() {
    return Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
  }

  get driverSeat() { return this.occupants[0]; }

  tick(dt) {
    if (this.destroyed) return;

    const def = VEHICLE_DEFS[this.type];

    // Apply engine force
    const fwdX = Math.sin(this.rotation);
    const fwdZ = Math.cos(this.rotation);
    const engineForce = this.throttle * def.acceleration * (this.braking ? 0 : 1);

    this.velocity.x += fwdX * engineForce * dt;
    this.velocity.z += fwdZ * engineForce * dt;

    // Braking
    if (this.braking || this.throttle === 0) {
      const brakeFactor = this.braking ? def.brakeForce : def.drag;
      const spd = this.speed;
      if (spd > 0.01) {
        const decel = Math.min(spd, brakeFactor * dt);
        this.velocity.x -= (this.velocity.x / spd) * decel;
        this.velocity.z -= (this.velocity.z / spd) * decel;
      } else {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
    }

    // Speed cap
    const spd = this.speed;
    if (spd > def.maxSpeed) {
      const scale = def.maxSpeed / spd;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    // Steering — only effective when moving
    if (spd > 0.5) {
      this.rotation += this.steering * def.turnRate * dt * Math.sign(this.throttle || 1);
    }

    // Drag
    this.velocity.x *= Math.max(0, 1 - def.drag * dt);
    this.velocity.z *= Math.max(0, 1 - def.drag * dt);

    // Move
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // On-fire damage tick
    if (this.onFire) {
      this.health -= 10 * dt;
      if (this.health <= 0) this._explode();
    }
  }

  applyInput(input) {
    this.throttle  = Math.max(-1, Math.min(1, input.throttle ?? 0));
    this.steering  = Math.max(-1, Math.min(1, input.steering ?? 0));
    this.braking   = Boolean(input.braking);
    this.handbrake = Boolean(input.handbrake);
  }

  applyDamage(dmg) {
    if (this.destroyed) return;
    this.health -= dmg;
    if (this.health <= 200 && !this.onFire) {
      this.onFire = true;
    }
    if (this.health <= 0) {
      this._explode();
    }
  }

  _explode() {
    this.destroyed = true;
    this.onFire    = false;
    this.health    = 0;
    this.velocity  = { x: 0, y: 0, z: 0 };
  }

  getSnapshot() {
    return {
      id:        this.id,
      type:      this.type,
      position:  this.position,
      rotation:  this.rotation,
      velocity:  this.velocity,
      health:    this.health,
      maxHealth: this.maxHealth,
      occupants: this.occupants,
      onFire:    this.onFire,
      destroyed: this.destroyed,
    };
  }
}

class VehicleSystem {
  constructor() {
    /** @type {Map<string, Vehicle>} */
    this.vehicles = new Map();
  }

  spawnInitialVehicles() {
    const mapSize = 4000;
    for (const [type, count] of Object.entries(SPAWN_COUNTS)) {
      for (let i = 0; i < count; i++) {
        const pos = {
          x: Math.random() * mapSize,
          y: 0,
          z: Math.random() * mapSize,
        };
        const rot = Math.random() * Math.PI * 2;
        const v = new Vehicle(type, pos, rot);
        this.vehicles.set(v.id, v);
      }
    }
    console.log(`[VehicleSystem] Spawned ${this.vehicles.size} vehicles`);
  }

  tick(dt, players) {
    for (const vehicle of this.vehicles.values()) {
      vehicle.tick(dt);

      // Move seated passengers with vehicle
      for (let s = 0; s < vehicle.occupants.length; s++) {
        const pid = vehicle.occupants[s];
        if (!pid) continue;
        const player = players.get(pid);
        if (player) {
          player.position = { ...vehicle.position };
          // Offset each seat slightly
          player.position.x += (s % 2 === 0 ? -0.6 : 0.6);
          player.position.z += (s < 2 ? -0.5 : 0.5);
        }
      }
    }
  }

  enterVehicle(vehicleId, playerId, preferredSeat) {
    const v = this.vehicles.get(vehicleId);
    if (!v || v.destroyed) return -1;

    // Driver seat first, else requested seat, else any free seat
    const priority = [0, preferredSeat, ...Array.from({ length: v.seats }, (_, i) => i)];
    for (const seat of priority) {
      if (seat >= 0 && seat < v.seats && v.occupants[seat] === null) {
        v.occupants[seat] = playerId;
        return seat;
      }
    }
    return -1;  // full
  }

  exitVehicle(vehicleId, playerId) {
    const v = this.vehicles.get(vehicleId);
    if (!v) return { x: 0, y: 0, z: 0 };

    for (let s = 0; s < v.occupants.length; s++) {
      if (v.occupants[s] === playerId) {
        v.occupants[s] = null;
        break;
      }
    }

    // Exit position slightly to the side of the vehicle
    return {
      x: v.position.x + Math.sin(v.rotation + Math.PI / 2) * 3,
      y: v.position.y + 0.5,
      z: v.position.z + Math.cos(v.rotation + Math.PI / 2) * 3,
    };
  }

  applyInput(vehicleId, input) {
    const v = this.vehicles.get(vehicleId);
    if (v) v.applyInput(input);
  }

  applyDamage(vehicleId, damage) {
    const v = this.vehicles.get(vehicleId);
    if (v) v.applyDamage(damage);
  }

  getVehicle(vehicleId) { return this.vehicles.get(vehicleId) || null; }

  getAll() { return [...this.vehicles.values()]; }

  getSnapshot() { return this.getAll().map(v => v.getSnapshot()); }

  clear() { this.vehicles.clear(); }
}

module.exports = VehicleSystem;
