/**
 * PlayerController — handles local player movement, physics, animations.
 * Uses client-side prediction: moves instantly, reconciles with server snaps.
 */

import * as THREE from 'three';

const WALK_SPEED    = 4.0;    // m/s
const RUN_SPEED     = 7.5;
const CROUCH_SPEED  = 2.0;
const PRONE_SPEED   = 1.0;
const JUMP_IMPULSE  = 5.5;
const GRAVITY       = -18;
const GROUND_CHECK  = 0.15;   // ray length below feet

export default class PlayerController {
  constructor(scene, world, camera, network, audio) {
    this.scene   = scene;
    this.world   = world;
    this.camera  = camera;
    this.network = network;
    this.audio   = audio;

    // Visual mesh (capsule)
    this.mesh   = this._buildMesh();
    this.shadow = null;
    scene.add(this.mesh);

    // Physics state
    this.position  = new THREE.Vector3();
    this.velocity  = new THREE.Vector3();
    this.onGround  = true;
    this.stance    = 'stand';
    this.isSprinting = false;

    // Footstep timer
    this._stepTimer   = 0;
    this._stepInterval = 0.5;

    // Last sent position (to avoid redundant packets)
    this._lastSentPos = new THREE.Vector3(-9999, 0, 0);
    this._sendThrottle = 0;
    this._sendInterval = 1 / 30;  // 30 Hz input send rate

    // Reconciliation — server-authoritative snaps
    this._pendingSnap = null;

    // Network listener
    this._unsubSnap = network.on('player:snap', (d) => {
      this._pendingSnap = d;
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Update (every frame)
  // ─────────────────────────────────────────────────────────────────────

  update(input, dt) {
    // Apply server reconciliation snap if needed
    if (this._pendingSnap) {
      this.position.set(
        this._pendingSnap.position.x,
        this._pendingSnap.position.y,
        this._pendingSnap.position.z
      );
      this.velocity.set(0, 0, 0);
      this._pendingSnap = null;
    }

    this._processInput(input, dt);
    this._applyGravity(dt);
    this._resolveGround(dt);
    this._resolveCollisions();
    this._updateMesh();
    this._updateFootsteps(input, dt);

    // Send to server at 30 Hz (client-side prediction result)
    this._sendThrottle -= dt;
    if (this._sendThrottle <= 0) {
      this._sendThrottle = this._sendInterval;
      if (this.position.distanceTo(this._lastSentPos) > 0.01) {
        this.network.sendMove(
          { x: this.position.x, y: this.position.y, z: this.position.z },
          { x: this.camera.pitch, y: this.camera.yaw },
          { x: this.velocity.x,  y: this.velocity.y, z: this.velocity.z },
          this.stance
        );
        this._lastSentPos.copy(this.position);
      }
    }

    // Update camera to follow player
    this.camera.update({ x: this.position.x, y: this.position.y, z: this.position.z }, dt);
    this.camera.setStance(this.stance);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Movement processing
  // ─────────────────────────────────────────────────────────────────────

  _processInput(input, dt) {
    const move = input.getMoveVector();
    this.isSprinting = input.isHeld('sprint') && move.z < 0 && this.stance === 'stand';

    // Stance changes
    if (input.wasJustPressed('crouch')) {
      this.stance = this.stance === 'crouch' ? 'stand' : 'crouch';
    }
    if (input.wasJustPressed('prone')) {
      this.stance = this.stance === 'prone' ? 'stand' : 'prone';
    }

    // Speed based on stance + sprint
    let speed;
    switch (this.stance) {
      case 'crouch': speed = CROUCH_SPEED; break;
      case 'prone':  speed = PRONE_SPEED;  break;
      default:       speed = this.isSprinting ? RUN_SPEED : WALK_SPEED;
    }

    // Apply input direction relative to camera yaw
    const yaw    = this.camera.yaw;
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);

    const wx = move.x * cosYaw - move.z * sinYaw;
    const wz = move.x * sinYaw + move.z * cosYaw;

    const len = Math.sqrt(wx * wx + wz * wz);
    if (len > 0) {
      this.velocity.x = (wx / len) * speed;
      this.velocity.z = (wz / len) * speed;
    } else {
      // Friction deceleration
      this.velocity.x *= 0.82;
      this.velocity.z *= 0.82;
      if (Math.abs(this.velocity.x) < 0.01) this.velocity.x = 0;
      if (Math.abs(this.velocity.z) < 0.01) this.velocity.z = 0;
    }

    // Jump
    if (input.wasJustPressed('jump') && this.onGround && this.stance === 'stand') {
      this.velocity.y    = JUMP_IMPULSE;
      this.onGround      = false;
      this.audio.play2D('land_hard', { volume: 0.2 });
    }
  }

  _applyGravity(dt) {
    if (!this.onGround) {
      this.velocity.y += GRAVITY * dt;
    }
  }

  _resolveGround(dt) {
    // Move
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // Terrain height
    const groundY = this.world.getHeightAt(this.position.x, this.position.z);

    if (this.position.y <= groundY) {
      this.position.y = groundY;
      if (this.velocity.y < -5) {
        // Hard landing
        this.audio.play2D('land_hard', { volume: Math.min(1, -this.velocity.y / 15) });
      }
      this.velocity.y = 0;
      this.onGround   = true;
    } else if (this.position.y > groundY + GROUND_CHECK) {
      this.onGround = false;
    }

    // Map boundary clamp
    this.position.x = Math.max(0, Math.min(4000, this.position.x));
    this.position.z = Math.max(0, Math.min(4000, this.position.z));
  }

  _resolveCollisions() {
    // Simple AABB collision against world objects is handled via BVH raycasting
    // against collision meshes registered in World.js — used for camera only.
    // Player pushback against buildings uses server authoritative positions.
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Visuals
  // ─────────────────────────────────────────────────────────────────────

  _buildMesh() {
    // Capsule approximation: cylinder + two spheres
    const group = new THREE.Group();

    const bodyGeo  = new THREE.CylinderGeometry(0.3, 0.3, 1.6, 8);
    const bodyMat  = new THREE.MeshLambertMaterial({ color: 0x2244AA });
    const body     = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9;
    body.castShadow = true;
    group.add(body);

    const headGeo  = new THREE.SphereGeometry(0.28, 8, 8);
    const head     = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 1.85;
    head.castShadow = true;
    group.add(head);

    group.visible = false;  // FPS mode — own model hidden by default
    return group;
  }

  _updateMesh() {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.camera.yaw;

    const targetScaleY = this.stance === 'prone' ? 0.4 : this.stance === 'crouch' ? 0.7 : 1.0;
    this.mesh.scale.y += (targetScaleY - this.mesh.scale.y) * 0.2;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Footsteps
  // ─────────────────────────────────────────────────────────────────────

  _updateFootsteps(input, dt) {
    const isMoving = Math.abs(this.velocity.x) > 0.5 || Math.abs(this.velocity.z) > 0.5;
    if (!isMoving || !this.onGround) { this._stepTimer = 0; return; }

    const interval = this.isSprinting ? 0.3 : 0.5;
    this._stepTimer += dt;
    if (this._stepTimer >= interval) {
      this._stepTimer = 0;
      const surface = this._getSurface();
      this.audio.playFootstep(surface, this.isSprinting);
    }
  }

  _getSurface() {
    const h = this.world.getHeightAt(this.position.x, this.position.z);
    if (h < 1)  return 'sand';
    if (h < 50) return 'grass';
    return 'rock';
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Public
  // ─────────────────────────────────────────────────────────────────────

  getPosition()    { return this.position; }
  getVelocity()    { return this.velocity; }

  showMesh(visible) { this.mesh.visible = visible; }

  dispose() {
    this._unsubSnap && this._unsubSnap();
    this.scene.remove(this.mesh);
    this.mesh.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
  }
}
