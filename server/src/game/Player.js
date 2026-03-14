'use strict';

const Inventory = require('./Inventory');
const WeaponRegistry = require('./WeaponRegistry');

const MAX_HEALTH = 100;
const MAX_ARMOR  = 100;

class Player {
  constructor(userId, username, squadId) {
    this.id       = userId;
    this.username = username;
    this.squadId  = squadId || null;

    // Network
    this.socket    = null;
    this.connected = false;

    // Position & movement
    this.position  = { x: 0, y: 0, z: 0 };
    this.rotation  = { x: 0, y: 0 };
    this.velocity  = { x: 0, y: 0, z: 0 };
    this.stance    = 'stand';   // 'stand' | 'crouch' | 'prone'
    this.lastInput = 0;

    // Vital stats
    this.health = MAX_HEALTH;
    this.armor  = 0;
    this.alive  = false;    // false until spawned

    // Combat
    this.kills      = 0;
    this.damageDealt = 0;
    this.shots      = 0;
    this.hits       = 0;

    // Loadout
    this.inventory    = new Inventory();
    this.equippedSlot = 0;   // 0=primary, 1=secondary, 2=melee, 3=throwable
    this.currentMag   = {};  // weaponId → rounds in mag
    this.ammo         = {};  // ammoType → reserve count

    // Vehicle state
    this.inVehicle   = null;
    this.vehicleSeat = null;

    // Timers
    this.isReloading  = false;
    this._reloadTimer = null;
    this._healTimer   = null;
    this._useTimer    = null;
    this._dcTimer     = null;

    // Match metadata
    this.spawnedAt  = null;
    this.killedAt   = null;
    this.killer     = null;
    this.placement  = null;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Lifecycle
  // ─────────────────────────────────────────────────────────────────────

  spawn(position) {
    this.alive     = true;
    this.health    = MAX_HEALTH;
    this.armor     = 0;
    this.position  = { ...position };
    this.spawnedAt = Date.now();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Combat
  // ─────────────────────────────────────────────────────────────────────

  applyDamage(rawDamage, bodyPart) {
    if (!this.alive) return 0;

    let damage = rawDamage;

    // Headshots ignore armour
    if (bodyPart === 'head') {
      damage *= 1.5;
    } else {
      // Armour absorbs up to 50% of body damage
      if (this.armor > 0) {
        const absorbed = Math.min(damage * 0.5, this.armor);
        this.armor    -= absorbed;
        damage        -= absorbed;
      }
    }

    damage = Math.min(damage, this.health);
    this.health     -= damage;
    this.damageDealt = 0;  // reset — attacker's stat tracked in GameRoom

    return damage;
  }

  canShoot() {
    const weapon = this.getEquippedWeapon();
    if (!weapon) return false;
    if (this.isReloading) return false;
    const mag = this.currentMag[weapon.id] ?? weapon.magazineSize;
    if (mag <= 0) return false;
    if (!this._lastShotAt) return true;
    return Date.now() - this._lastShotAt >= (1000 / weapon.rateOfFire);
  }

  recordShot() {
    this._lastShotAt = Date.now();
    this.shots++;
    const weapon = this.getEquippedWeapon();
    if (weapon) {
      this.currentMag[weapon.id] = (this.currentMag[weapon.id] ?? weapon.magazineSize) - 1;
    }
  }

  startReload(weapon, onComplete) {
    if (this.isReloading) return;
    this.isReloading = true;
    this._reloadTimer = setTimeout(() => {
      this.isReloading = false;
      onComplete();
    }, weapon.reloadTime * 1000);
  }

  cancelReload() {
    if (!this.isReloading) return;
    clearTimeout(this._reloadTimer);
    this.isReloading = false;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Inventory / loadout
  // ─────────────────────────────────────────────────────────────────────

  getEquippedWeapon() {
    const slotItems = this.inventory.getSlot(this.equippedSlot);
    if (!slotItems || slotItems.type !== 'weapon') return null;
    return WeaponRegistry.get(slotItems.weaponId);
  }

  equipSlot(slot) {
    this.cancelReload();
    this.equippedSlot = slot;
  }

  useConsumable(item, onComplete) {
    if (this._useTimer) return false;
    const durationMs = item.useTime * 1000;

    this._useTimer = setTimeout(() => {
      this._useTimer = null;
      switch (item.subtype) {
        case 'bandage':       this.health = Math.min(MAX_HEALTH, this.health + 15);  break;
        case 'medkit':        this.health = MAX_HEALTH;                               break;
        case 'energy_drink':  this.health = Math.min(MAX_HEALTH, this.health + 25);  break;
        case 'adrenaline':    this.health = MAX_HEALTH; this.armor = MAX_ARMOR;       break;
        case 'armor_shard':   this.armor  = Math.min(MAX_ARMOR,  this.armor  + 25);  break;
        case 'armor_vest':    this.armor  = MAX_ARMOR;                                break;
      }
      if (this.socket) {
        this.socket.emit('stats:update', { health: this.health, armor: this.armor });
      }
      onComplete();
    }, durationMs);

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Serialisation
  // ─────────────────────────────────────────────────────────────────────

  serialize() {
    return {
      id:          this.id,
      username:    this.username,
      squadId:     this.squadId,
      position:    this.position,
      rotation:    this.rotation,
      velocity:    this.velocity,
      stance:      this.stance,
      health:      this.health,
      armor:       this.armor,
      alive:       this.alive,
      kills:       this.kills,
      equippedSlot: this.equippedSlot,
      currentMag:  this.currentMag,
      inventory:   this.inventory.serialize(),
    };
  }
}

module.exports = Player;
