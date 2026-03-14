/**
 * RemotePlayer — renders an interpolated remote player entity.
 * Uses interpolated state from NetworkManager for smooth movement.
 */

import * as THREE from 'three';

export default class RemotePlayer {
  constructor(scene, playerData) {
    this.scene    = scene;
    this.id       = playerData.id;
    this.username = playerData.username;
    this.squadId  = playerData.squadId;

    this.alive    = playerData.alive ?? true;
    this.health   = playerData.hp   ?? 100;
    this.armor    = playerData.armor ?? 0;

    // 3D group
    this.group = new THREE.Group();
    this._buildMesh();
    this._buildNameplate();
    this.group.visible = this.alive;
    scene.add(this.group);

    // Speaking indicator
    this._speakingIndicator = null;
    this._buildSpeakingIndicator();
    this._speaking = false;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Build visuals
  // ─────────────────────────────────────────────────────────────────────

  _buildMesh() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xCC3322 });

    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.6, 8);
    const body    = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.9;
    body.castShadow = true;

    const headGeo = new THREE.SphereGeometry(0.28, 8, 8);
    const head    = new THREE.Mesh(headGeo, mat);
    head.position.y = 1.85;
    head.castShadow = true;

    this.group.add(body, head);
    this._bodyMesh = body;
    this._headMesh = head;
  }

  _buildNameplate() {
    // Billboard sprite with player name — rendered via CSS2DRenderer or canvas texture
    const canvas   = document.createElement('canvas');
    canvas.width   = 256;
    canvas.height  = 64;
    const ctx      = canvas.getContext('2d');
    ctx.fillStyle  = 'rgba(0,0,0,0.6)';
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 8);
    ctx.fill();
    ctx.fillStyle  = '#ffffff';
    ctx.font       = 'bold 24px sans-serif';
    ctx.textAlign  = 'center';
    ctx.fillText(this.username, 128, 42);

    const texture  = new THREE.CanvasTexture(canvas);
    const mat      = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    this._nameplate = new THREE.Sprite(mat);
    this._nameplate.scale.set(2.5, 0.6, 1);
    this._nameplate.position.y = 2.4;
    this._nameplate.renderOrder = 999;
    this.group.add(this._nameplate);
  }

  _buildSpeakingIndicator() {
    const geo = new THREE.SphereGeometry(0.12, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00FF88, transparent: true, opacity: 0.9 });
    this._speakingIndicator = new THREE.Mesh(geo, mat);
    this._speakingIndicator.position.set(0.4, 2.0, 0);
    this._speakingIndicator.visible = false;
    this.group.add(this._speakingIndicator);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Update from interpolated state
  // ─────────────────────────────────────────────────────────────────────

  update(state, dt) {
    if (!state) return;

    this.alive  = state.alive;
    this.health = state.hp;
    this.armor  = state.armor;

    this.group.visible = this.alive;
    if (!this.alive) return;

    // Smooth position (lerp remaining from previous interpolation)
    this.group.position.set(state.pos.x, state.pos.y, state.pos.z);
    this.group.rotation.y = state.rot.y;

    // Stance scaling
    const targetScaleY = state.stance === 'prone' ? 0.4 : state.stance === 'crouch' ? 0.7 : 1.0;
    this.group.scale.y += (targetScaleY - this.group.scale.y) * Math.min(1, dt * 8);
  }

  setSpeaking(speaking) {
    this._speaking = speaking;
    if (this._speakingIndicator) {
      this._speakingIndicator.visible = speaking;
    }
  }

  setSkin(color) {
    const mat = new THREE.MeshLambertMaterial({ color });
    this._bodyMesh.material = mat;
    this._headMesh.material = mat;
  }

  setTeamColor(isTeammate) {
    const color = isTeammate ? 0x22AA44 : 0xCC3322;
    this.setSkin(color);
  }

  // ─────────────────────────────────────────────────────────────────────

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(c => {
      c.geometry?.dispose();
      if (c.material) {
        c.material.map?.dispose();
        c.material.dispose();
      }
    });
  }
}
