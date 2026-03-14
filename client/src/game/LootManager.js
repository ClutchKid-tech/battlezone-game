/**
 * LootManager — renders loot items in the 3D world.
 * Shows pickup prompt when player is nearby, handles interaction key.
 */

import * as THREE from 'three';

const PICKUP_RADIUS   = 3.0;   // metres
const FLOAT_AMPLITUDE = 0.12;
const FLOAT_SPEED     = 1.5;
const SPIN_SPEED      = 0.8;

// Colour by rarity
const RARITY_COLORS = {
  common:    0xAAAAAA,
  uncommon:  0x44AA44,
  rare:      0x4488FF,
  epic:      0xAA44FF,
  legendary: 0xFFAA00,
};

export default class LootManager {
  constructor(scene, network, audio) {
    this.scene   = scene;
    this.network = network;
    this.audio   = audio;

    // lootId → { mesh, item, baseY, time }
    this._items  = new Map();
    this._time   = 0;

    // Nearest loot for interaction
    this._nearestLootId   = null;
    this._nearestLootItem = null;

    // Network handlers
    this._unsubSpawn   = network.on('loot:spawned',  (d) => this._onSpawn(d));
    this._unsubRemoved = network.on('loot:removed',  (d) => this._onRemoved(d));

    // Shared geometries / materials per item type
    this._geoCache = {};
    this._matCache = {};
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Bulk initialisation from room:start
  // ─────────────────────────────────────────────────────────────────────

  initialise(lootArray) {
    for (const entry of lootArray) {
      this._spawnItem(entry.id, entry.item, entry.position);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Network handlers
  // ─────────────────────────────────────────────────────────────────────

  _onSpawn({ lootId, item, position }) {
    this._spawnItem(lootId, item, position);
    // Brief spawn flash
    this.audio.play3D('item_spawn', position, { volume: 0.3, maxDistance: 20 });
  }

  _onRemoved({ lootId }) {
    this._removeItem(lootId);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Item management
  // ─────────────────────────────────────────────────────────────────────

  _spawnItem(lootId, item, position) {
    if (this._items.has(lootId)) return;

    const mesh = this._buildMesh(item);
    mesh.position.set(position.x, position.y + 0.3, position.z);
    this.scene.add(mesh);

    this._items.set(lootId, {
      mesh,
      item,
      baseY: position.y + 0.3,
      time:  Math.random() * Math.PI * 2,  // phase offset
    });
  }

  _removeItem(lootId) {
    const entry = this._items.get(lootId);
    if (!entry) return;
    this.scene.remove(entry.mesh);
    entry.mesh.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
    this._items.delete(lootId);
    if (this._nearestLootId === lootId) {
      this._nearestLootId   = null;
      this._nearestLootItem = null;
      window.dispatchEvent(new CustomEvent('hud:loot_prompt', { detail: { show: false } }));
    }
  }

  _buildMesh(item) {
    const color = RARITY_COLORS[item.rarity || 'common'] || 0xFFFFFF;

    let geo;
    switch (item.type) {
      case 'weapon':     geo = this._getGeo('weapon',      () => new THREE.BoxGeometry(0.6, 0.08, 0.12)); break;
      case 'ammo':       geo = this._getGeo('ammo',        () => new THREE.BoxGeometry(0.12, 0.08, 0.08)); break;
      case 'consumable': geo = this._getGeo('consumable',  () => new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8)); break;
      case 'throwable':  geo = this._getGeo('throwable',   () => new THREE.SphereGeometry(0.07, 8, 8)); break;
      default:           geo = this._getGeo('default',     () => new THREE.OctahedronGeometry(0.1)); break;
    }

    const mat  = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.2 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow    = false;
    mesh.receiveShadow = false;
    mesh.userData.lootItem = item;

    // Point light under rare+ items
    if (item.rarity && ['rare', 'epic', 'legendary'].includes(item.rarity)) {
      const light = new THREE.PointLight(color, 0.5, 3);
      light.position.y = -0.1;
      mesh.add(light);
    }

    return mesh;
  }

  _getGeo(key, factory) {
    if (!this._geoCache[key]) this._geoCache[key] = factory();
    return this._geoCache[key];
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Update
  // ─────────────────────────────────────────────────────────────────────

  update(playerPosition, input, dt) {
    this._time += dt;

    let nearestDist = PICKUP_RADIUS;
    let nearestId   = null;
    let nearestItem = null;

    for (const [lootId, entry] of this._items) {
      entry.time += dt;

      // Float and spin animation
      entry.mesh.position.y    = entry.baseY + Math.sin(entry.time * FLOAT_SPEED) * FLOAT_AMPLITUDE;
      entry.mesh.rotation.y   += SPIN_SPEED * dt;

      // Distance check
      const dx   = entry.mesh.position.x - playerPosition.x;
      const dz   = entry.mesh.position.z - playerPosition.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestId   = lootId;
        nearestItem = entry.item;
      }

      // Scale label on/off by distance
      const visible = dist < PICKUP_RADIUS * 3;
      entry.mesh.visible = visible;
    }

    // Show/hide pickup prompt
    if (nearestId !== this._nearestLootId) {
      this._nearestLootId   = nearestId;
      this._nearestLootItem = nearestItem;
      window.dispatchEvent(new CustomEvent('hud:loot_prompt', {
        detail: { show: !!nearestId, item: nearestItem }
      }));
    }

    // Interact key — pick up nearest item
    if (input.wasJustPressed('interact') && this._nearestLootId) {
      this.network.sendLoot(this._nearestLootId);
    }
  }

  dispose() {
    this._unsubSpawn?.();
    this._unsubRemoved?.();
    for (const [, entry] of this._items) {
      this.scene.remove(entry.mesh);
      entry.mesh.traverse(c => { c.material?.dispose(); });
    }
    for (const geo of Object.values(this._geoCache)) geo.dispose();
    this._items.clear();
  }
}
