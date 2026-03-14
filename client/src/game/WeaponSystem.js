/**
 * WeaponSystem — client-side weapon logic:
 *   - Recoil pattern, spread, ADS transition
 *   - Muzzle flash & shell ejection VFX
 *   - Tracer bullets
 *   - Weapon sway
 *   - Reload animation state machine
 */

import * as THREE from 'three';

// Recoil recovery speed (per second)
const RECOIL_RECOVERY = 4.0;
const SWAY_AMOUNT     = 0.002;
const SWAY_SPEED      = 1.5;

export default class WeaponSystem {
  constructor(scene, camera, audio, network) {
    this.scene   = scene;
    this.camera  = camera;
    this.audio   = audio;
    this.network = network;

    // Current weapon data (from WeaponRegistry)
    this.currentWeapon   = null;
    this.currentSlot     = 0;
    this.attachments     = [];
    this.ammoInMag       = 0;
    this.ammoReserve     = 0;

    // State machine
    this.isReloading   = false;
    this.isADS         = false;
    this._reloadTimer  = 0;
    this._fireTimer    = 0;    // time until next shot allowed
    this._triggerHeld  = false;

    // Recoil accumulation
    this._recoilX = 0;   // pitch accumulation
    this._recoilY = 0;   // yaw accumulation

    // Weapon model (3D mesh attached to camera)
    this._weaponPivot   = new THREE.Group();
    this._weaponMesh    = null;
    this._muzzleFlash   = null;
    this._muzzleFlashTimer = 0;

    // Tracers pool
    this._tracers = [];

    // Sway
    this._swayTime = 0;

    // Attach to camera
    camera.camera.add(this._weaponPivot);

    this._initMuzzleFlash();
    this._initTracer();

    // Network events
    this._unsubHitmarker  = network.on('hitmarker',      (d) => this._onHitmarker(d));
    this._unsubShootConf  = network.on('shoot:confirmed',(d) => this._onShootConfirmed(d));
    this._unsubReloadConf = network.on('reload:complete', (d) => this._onReloadComplete(d));
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Equip
  // ─────────────────────────────────────────────────────────────────────

  equip(weaponData, ammoInMag, ammoReserve, attachmentIds = []) {
    this.currentWeapon = weaponData;
    this.attachments   = attachmentIds;
    this.ammoInMag     = ammoInMag;
    this.ammoReserve   = ammoReserve;
    this.isReloading   = false;
    this._recoilX      = 0;
    this._recoilY      = 0;
    this._fireTimer    = 0;

    this._buildWeaponMesh(weaponData);
    this.isADS = false;
    this.camera.setADS(false);
  }

  unequip() {
    this.currentWeapon = null;
    if (this._weaponMesh) {
      this._weaponPivot.remove(this._weaponMesh);
      this._weaponMesh.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
      this._weaponMesh = null;
    }
    this.isADS = false;
    this.camera.setADS(false);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Update (every frame)
  // ─────────────────────────────────────────────────────────────────────

  update(input, playerVelocity, dt) {
    if (!this.currentWeapon) return;

    this._fireTimer   = Math.max(0, this._fireTimer - dt);
    this._swayTime   += dt;

    // ADS toggle
    if (input.wasJustPressed('ads') && !this.isReloading) {
      this.isADS = true;
      this.camera.setADS(true);
      this._weaponPivot.position.set(0, 0, 0);
    }
    if (input.wasJustReleased('ads')) {
      this.isADS = false;
      this.camera.setADS(false);
    }

    // Fire
    if (input.isHeld('fire') && !this.isReloading && this._fireTimer <= 0) {
      this._fire(input);
    } else {
      this._triggerHeld = false;
    }

    // Reload
    if (input.wasJustPressed('reload') && !this.isReloading && this.ammoInMag < this.currentWeapon.magazineSize) {
      if (this.ammoReserve > 0) this._startReload();
    }

    // Weapon sway
    this._applyWeaponSway(playerVelocity, dt);

    // Recover recoil
    this._recoilX *= Math.pow(0.1, dt * RECOIL_RECOVERY);
    this._recoilY *= Math.pow(0.1, dt * RECOIL_RECOVERY);
    this.camera.applyMouseDelta(this._recoilY * dt * 0.3, this._recoilX * dt * 0.3);

    // Muzzle flash timer
    if (this._muzzleFlash && this._muzzleFlashTimer > 0) {
      this._muzzleFlashTimer -= dt;
      if (this._muzzleFlashTimer <= 0) {
        this._muzzleFlash.visible = false;
      }
    }

    // Tracer update
    this._updateTracers(dt);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Firing
  // ─────────────────────────────────────────────────────────────────────

  _fire(input) {
    if (this.ammoInMag <= 0) {
      this.audio.playDryFire();
      return;
    }

    const w = this.currentWeapon;
    this._fireTimer    = 1 / w.rateOfFire;
    this._triggerHeld  = true;

    // Client-side: deduct ammo immediately (prediction)
    this.ammoInMag = Math.max(0, this.ammoInMag - (w.pellets || 1));

    // Apply recoil to camera
    const recoilX = w.recoil.x * (this.isADS ? 0.4 : 1.0);
    const recoilY = w.recoil.y * (this.isADS ? 0.3 : 0.8);
    this._recoilX += recoilX;
    this._recoilY += (Math.random() - 0.5) * recoilY;
    this.camera.applyMouseDelta(-this._recoilY * 0.005, -recoilX * 0.01);

    // Get shot origin & direction from camera
    const origin    = this.camera.getPosition();
    const direction = this.camera.getLookDirection();

    // Add spread
    const spread = w.spread * (this.isADS ? 0.3 : 1.0);
    direction.x  += (Math.random() - 0.5) * spread;
    direction.y  += (Math.random() - 0.5) * spread;
    direction.z  += (Math.random() - 0.5) * spread;
    direction.normalize();

    // VFX
    this._showMuzzleFlash();
    this._spawnTracer(origin.clone(), direction.clone(), w.range || 500);

    // Sound
    const suppressed = this.attachments.some(a => a.startsWith('suppressor'));
    this.audio.playGunshot(w.id, { x: origin.x, y: origin.y, z: origin.z }, suppressed);

    // Send to server
    this.network.sendShoot(
      { x: origin.x,    y: origin.y,    z: origin.z    },
      { x: direction.x, y: direction.y, z: direction.z }
    );

    // UI callback
    window.dispatchEvent(new CustomEvent('hud:ammo', { detail: { ammoInMag: this.ammoInMag, ammoReserve: this.ammoReserve } }));
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Reload
  // ─────────────────────────────────────────────────────────────────────

  _startReload() {
    this.isReloading = true;
    this.camera.setADS(false);
    this.isADS = false;
    this.audio.playReload(this.currentWeapon.id);
    this.network.sendReload();
    // Animation: tilt weapon down
    if (this._weaponMesh) {
      this._weaponMesh.rotation.x = 0.4;
    }
    window.dispatchEvent(new CustomEvent('hud:reloading', { detail: { reloading: true } }));
  }

  _onReloadComplete(data) {
    this.isReloading  = false;
    this.ammoInMag    = data.ammo;
    this.ammoReserve  = data.reserve;
    if (this._weaponMesh) this._weaponMesh.rotation.x = 0;
    window.dispatchEvent(new CustomEvent('hud:ammo', { detail: { ammoInMag: this.ammoInMag, ammoReserve: this.ammoReserve } }));
    window.dispatchEvent(new CustomEvent('hud:reloading', { detail: { reloading: false } }));
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Hit feedback
  // ─────────────────────────────────────────────────────────────────────

  _onHitmarker({ bodyPart }) {
    this.audio.playHitmarker();
    window.dispatchEvent(new CustomEvent('hud:hitmarker', { detail: { bodyPart } }));
  }

  _onShootConfirmed({ hits }) {
    // Additional VFX for confirmed hits (blood, sparks) would go here
  }

  // ─────────────────────────────────────────────────────────────────────
  //  VFX
  // ─────────────────────────────────────────────────────────────────────

  _buildWeaponMesh(weapon) {
    if (this._weaponMesh) {
      this._weaponPivot.remove(this._weaponMesh);
      this._weaponMesh.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
    }

    // Geometric approximation — replace with loaded GLTF in production
    const bodyW = weapon.category === 'sniper' ? 0.06 : 0.055;
    const bodyH = 0.08;
    const bodyL = weapon.category === 'pistol' ? 0.18 : weapon.category === 'sniper' ? 0.8 : 0.5;

    const geo  = new THREE.BoxGeometry(bodyW, bodyH, bodyL);
    const mat  = new THREE.MeshLambertMaterial({ color: 0x222222 });
    this._weaponMesh = new THREE.Mesh(geo, mat);
    this._weaponMesh.castShadow = false;

    // Position in view (right side, slightly down from centre)
    this._weaponMesh.position.set(0.12, -0.12, -0.35);
    this._weaponPivot.add(this._weaponMesh);
  }

  _initMuzzleFlash() {
    const geo = new THREE.SphereGeometry(0.04, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xFFCC44 });
    this._muzzleFlash = new THREE.Mesh(geo, mat);
    this._muzzleFlash.visible = false;
    this._weaponPivot.add(this._muzzleFlash);
  }

  _showMuzzleFlash() {
    if (!this._muzzleFlash || !this._weaponMesh) return;
    const muzzlePos = new THREE.Vector3(0, 0, -this._weaponMesh.geometry.parameters.depth / 2 - 0.02);
    this._muzzleFlash.position.copy(this._weaponMesh.position.clone().add(muzzlePos));
    this._muzzleFlash.visible   = true;
    this._muzzleFlashTimer = 0.04;
  }

  _initTracer() {
    this._tracerPool = [];
    for (let i = 0; i < 20; i++) {
      const geo   = new THREE.CylinderGeometry(0.005, 0.005, 1, 3);
      const mat   = new THREE.MeshBasicMaterial({ color: 0xFFFF88 });
      const mesh  = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this._tracerPool.push({ mesh, active: false, pos: new THREE.Vector3(), dir: new THREE.Vector3(), traveled: 0, maxDist: 100 });
    }
  }

  _spawnTracer(origin, direction, maxDist) {
    const t = this._tracerPool.find(t => !t.active);
    if (!t) return;
    t.active   = true;
    t.pos.copy(origin);
    t.dir.copy(direction);
    t.traveled = 0;
    t.maxDist  = maxDist;
    t.mesh.visible = true;
  }

  _updateTracers(dt) {
    const speed = 300;   // m/s tracer visual speed
    for (const t of this._tracerPool) {
      if (!t.active) continue;
      const step = speed * dt;
      t.pos.addScaledVector(t.dir, step);
      t.traveled += step;
      t.mesh.position.copy(t.pos);
      // Orient along direction
      t.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.dir);
      if (t.traveled >= t.maxDist) {
        t.active = false;
        t.mesh.visible = false;
      }
    }
  }

  _applyWeaponSway(velocity, dt) {
    if (!this._weaponMesh) return;
    const speed  = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    const sway   = speed * SWAY_AMOUNT;
    const swayX  = Math.sin(this._swayTime * SWAY_SPEED) * sway;
    const swayY  = Math.sin(this._swayTime * SWAY_SPEED * 2) * sway * 0.5;
    this._weaponMesh.position.x = 0.12 + swayX;
    this._weaponMesh.position.y = -0.12 + swayY;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Getters for HUD
  // ─────────────────────────────────────────────────────────────────────

  getAmmoInfo()    { return { ammoInMag: this.ammoInMag, ammoReserve: this.ammoReserve }; }
  getWeaponName()  { return this.currentWeapon?.name || ''; }
  isWeaponADS()    { return this.isADS; }

  dispose() {
    this._unsubHitmarker?.();
    this._unsubShootConf?.();
    this._unsubReloadConf?.();
    this.unequip();
    for (const t of this._tracerPool) {
      this.scene.remove(t.mesh);
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
    }
    this.camera.camera.remove(this._weaponPivot);
  }
}
