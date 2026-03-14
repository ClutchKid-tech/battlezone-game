/**
 * Camera — handles FPS (first-person) and TPS (third-person over-shoulder) modes,
 * with collision detection against the world, smooth lerp, and ADS zoom.
 */

import * as THREE from 'three';

const DEFAULT_FOV    = 75;
const ADS_FOV        = 45;
const TPS_DISTANCE   = 3.5;    // metres behind player
const TPS_HEIGHT     = 1.4;    // metres above player pivot
const FPS_EYE_HEIGHT = 1.7;    // metres above player feet (standing)
const CROUCH_HEIGHT  = 1.1;
const PRONE_HEIGHT   = 0.4;
const MOUSE_SENSITIVITY_DEFAULT = 0.002;
const LERP_SPEED     = 12;      // smooth follow for TPS

export default class Camera {
  constructor(renderer) {
    this.renderer   = renderer;
    this.fov        = DEFAULT_FOV;
    this.targetFov  = DEFAULT_FOV;
    this.sensitivity = MOUSE_SENSITIVITY_DEFAULT;
    this.mode       = 'fps';    // 'fps' | 'tps'
    this.isADS      = false;
    this.stance     = 'stand';  // stand | crouch | prone

    // Euler angles for look direction
    this.yaw    = 0;
    this.pitch  = 0;

    this.camera = new THREE.PerspectiveCamera(DEFAULT_FOV, window.innerWidth / window.innerHeight, 0.05, 5000);
    this.camera.rotation.order = 'YXZ';  // yaw first, then pitch

    // TPS arm — child of a pivot that follows the player
    this._pivot    = new THREE.Object3D();
    this._tpsArm   = new THREE.Object3D();
    this._pivot.add(this._tpsArm);
    renderer.scene.add(this._pivot);

    // Raycaster for camera collision
    this._raycaster   = new THREE.Raycaster();
    this._collisionMeshes = [];

    // Register camera with renderer
    renderer.setCamera(this.camera);

    this._prevPos = new THREE.Vector3();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Mouse input
  // ─────────────────────────────────────────────────────────────────────

  applyMouseDelta(dx, dy) {
    this.yaw   -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity;
    // Clamp pitch: -85° to +85°
    this.pitch  = Math.max(-Math.PI * 0.47, Math.min(Math.PI * 0.47, this.pitch));
  }

  setFOV(fov) {
    this.fov = fov;
    if (!this.isADS) this.targetFov = fov;
  }

  setSensitivity(s) {
    this.sensitivity = s;
  }

  setMode(mode) {
    this.mode = mode;
  }

  setADS(ads) {
    this.isADS     = ads;
    this.targetFov = ads ? ADS_FOV : this.fov;
  }

  setStance(stance) {
    this.stance = stance;
  }

  setCollisionMeshes(meshes) {
    this._collisionMeshes = meshes;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Update (called every frame)
  // ─────────────────────────────────────────────────────────────────────

  update(playerPosition, dt) {
    // Smooth FOV transition
    const currentFov = this.camera.fov;
    if (Math.abs(currentFov - this.targetFov) > 0.05) {
      this.camera.fov += (this.targetFov - currentFov) * Math.min(1, dt * 15);
      this.camera.updateProjectionMatrix();
    }

    const eyeOffset = this._getEyeHeight();

    if (this.mode === 'fps') {
      this._updateFPS(playerPosition, eyeOffset);
    } else {
      this._updateTPS(playerPosition, eyeOffset, dt);
    }
  }

  _updateFPS(playerPosition, eyeOffset) {
    this.camera.position.set(
      playerPosition.x,
      playerPosition.y + eyeOffset,
      playerPosition.z
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  _updateTPS(playerPosition, eyeOffset, dt) {
    // Pivot follows player
    const targetPivot = new THREE.Vector3(
      playerPosition.x,
      playerPosition.y + eyeOffset,
      playerPosition.z
    );
    this._pivot.position.lerp(targetPivot, Math.min(1, dt * LERP_SPEED));
    this._pivot.rotation.y = this.yaw;

    // Desired camera offset behind and above player
    const desiredOffset = new THREE.Vector3(
      Math.sin(0.3) * TPS_DISTANCE,    // slight right offset for over-shoulder
      TPS_HEIGHT,
      TPS_DISTANCE
    );
    // Apply pitch to offset
    desiredOffset.applyEuler(new THREE.Euler(this.pitch, 0, 0));

    // Check for camera–world collision
    const worldPivot = this._pivot.position.clone();
    const desiredWorld = worldPivot.clone().add(desiredOffset.clone().applyEuler(new THREE.Euler(0, this.yaw, 0)));

    const dir    = desiredWorld.clone().sub(worldPivot).normalize();
    const dist   = worldPivot.distanceTo(desiredWorld);
    let   actualDist = dist;

    if (this._collisionMeshes.length > 0) {
      this._raycaster.set(worldPivot, dir);
      const hits = this._raycaster.intersectObjects(this._collisionMeshes, true);
      if (hits.length > 0 && hits[0].distance < dist) {
        actualDist = hits[0].distance - 0.1;
      }
    }

    const finalPos = worldPivot.clone().add(dir.multiplyScalar(actualDist));
    this.camera.position.copy(finalPos);
    this.camera.lookAt(worldPivot);
  }

  _getEyeHeight() {
    switch (this.stance) {
      case 'crouch': return CROUCH_HEIGHT;
      case 'prone':  return PRONE_HEIGHT;
      default:       return FPS_EYE_HEIGHT;
    }
  }

  // Returns world-space direction the camera is looking
  getLookDirection() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return dir;
  }

  // Returns world-space position of the camera eye
  getPosition() {
    return this.camera.position.clone();
  }

  // Converts screen-space position to world ray
  screenToWorldRay(screenX, screenY) {
    const ndc = new THREE.Vector2(
      (screenX / window.innerWidth) * 2 - 1,
      -(screenY / window.innerHeight) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    return ray;
  }

  dispose() {
    this.renderer.scene.remove(this._pivot);
  }
}
