/**
 * ZoneRenderer — renders the shrinking safe zone:
 *   - Outer wall (red animated cylinder)
 *   - Ground indicator ring
 *   - Inner safe zone tint
 *   - Damage flash overlay when outside zone
 */

import * as THREE from 'three';

export default class ZoneRenderer {
  constructor(scene) {
    this.scene     = scene;
    this._zone     = null;

    // Zone wall mesh
    this._wallMesh    = null;
    this._ringMesh    = null;
    this._safeOverlay = null;

    this._time = 0;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Build zone meshes
  // ─────────────────────────────────────────────────────────────────────

  _buildMeshes(radius) {
    this._clearMeshes();

    // Outer wall cylinder — open top/bottom, transparent
    const wallGeo = new THREE.CylinderGeometry(radius, radius, 500, 64, 1, true);
    const wallMat = new THREE.MeshBasicMaterial({
      color:       0x4488FF,
      transparent: true,
      opacity:     0.18,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });
    this._wallMesh = new THREE.Mesh(wallGeo, wallMat);
    this._wallMesh.renderOrder = 10;
    this.scene.add(this._wallMesh);

    // Ground ring (toroid at ground level)
    const ringGeo = new THREE.TorusGeometry(radius, 1.2, 8, 128);
    const ringMat = new THREE.MeshBasicMaterial({
      color:       0x00AAFF,
      transparent: true,
      opacity:     0.7,
    });
    this._ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this._ringMesh.rotation.x = Math.PI / 2;
    this.scene.add(this._ringMesh);
  }

  _clearMeshes() {
    if (this._wallMesh)    { this.scene.remove(this._wallMesh);    this._wallMesh.geometry.dispose();    this._wallMesh.material.dispose();    this._wallMesh = null; }
    if (this._ringMesh)    { this.scene.remove(this._ringMesh);    this._ringMesh.geometry.dispose();    this._ringMesh.material.dispose();    this._ringMesh = null; }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Update
  // ─────────────────────────────────────────────────────────────────────

  update(zoneData, playerPosition, dt) {
    if (!zoneData) return;
    this._time += dt;

    const { currentCenter, currentRadius, nextCenter, nextRadius, phase, phaseTimeMs, phaseDurationMs } = zoneData;

    // Rebuild if radius changed significantly
    if (!this._zone || Math.abs(this._zone.radius - currentRadius) > 1) {
      this._buildMeshes(currentRadius);
      this._zone = { radius: currentRadius };
    } else {
      // Update existing geometry radius
      this._resizeWall(currentRadius);
    }

    // Position walls at zone centre
    if (this._wallMesh) this._wallMesh.position.set(currentCenter.x, 100, currentCenter.z);
    if (this._ringMesh) this._ringMesh.position.set(currentCenter.x, 1,   currentCenter.z);

    // Animated pulse on wall
    if (this._wallMesh) {
      const pulse = 0.15 + Math.sin(this._time * 3) * 0.03;
      this._wallMesh.material.opacity = pulse;
    }

    // Show next zone indicator if shrinking
    if (phase === 'shrink') {
      this._showNextZone(nextCenter, nextRadius);
    }

    // Check if player is outside zone
    const dx = playerPosition.x - currentCenter.x;
    const dz = playerPosition.z - currentCenter.z;
    const distFromCenter = Math.sqrt(dx * dx + dz * dz);
    const isOutside = distFromCenter > currentRadius;

    // Red screen tint when outside
    window.dispatchEvent(new CustomEvent('hud:zone', {
      detail: {
        isOutside,
        distToZone:     Math.max(0, distFromCenter - currentRadius),
        shrinkProgress: phase === 'shrink' ? phaseTimeMs / phaseDurationMs : 0,
        phase,
      }
    }));

    this._zone.radius = currentRadius;
  }

  _resizeWall(radius) {
    // Recreate geometry for new radius (cheapest reliable approach)
    if (!this._wallMesh) return;
    const geo = new THREE.CylinderGeometry(radius, radius, 500, 64, 1, true);
    this._wallMesh.geometry.dispose();
    this._wallMesh.geometry = geo;

    if (this._ringMesh) {
      const ringGeo = new THREE.TorusGeometry(radius, 1.2, 8, 128);
      this._ringMesh.geometry.dispose();
      this._ringMesh.geometry = ringGeo;
    }
  }

  _nextZoneMarker = null;
  _showNextZone(center, radius) {
    if (!this._nextZoneMarker) {
      const geo = new THREE.TorusGeometry(radius, 0.5, 6, 64);
      const mat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.4 });
      this._nextZoneMarker = new THREE.Mesh(geo, mat);
      this._nextZoneMarker.rotation.x = Math.PI / 2;
      this.scene.add(this._nextZoneMarker);
    }
    this._nextZoneMarker.position.set(center.x, 0.5, center.z);
    // Update ring radius if needed
    const currentR = this._nextZoneMarker.geometry.parameters.radius;
    if (Math.abs(currentR - radius) > 1) {
      const geo = new THREE.TorusGeometry(radius, 0.5, 6, 64);
      this._nextZoneMarker.geometry.dispose();
      this._nextZoneMarker.geometry = geo;
    }
  }

  dispose() {
    this._clearMeshes();
    if (this._nextZoneMarker) {
      this.scene.remove(this._nextZoneMarker);
      this._nextZoneMarker.geometry.dispose();
      this._nextZoneMarker.material.dispose();
      this._nextZoneMarker = null;
    }
  }
}
