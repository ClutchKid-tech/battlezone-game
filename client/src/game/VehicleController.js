/**
 * VehicleController — client-side vehicle rendering + input.
 * Server drives physics; client interpolates and sends driver input.
 */

import * as THREE from 'three';

const VEHICLE_DEFS = {
  car:        { color: 0x885522, width: 2.0, height: 1.4, length: 4.2, wheelR: 0.38, seats: 4 },
  motorcycle: { color: 0x222244, width: 0.6, height: 1.1, length: 2.2, wheelR: 0.3,  seats: 2 },
  boat:       { color: 0x334455, width: 2.5, height: 0.8, length: 5.5, wheelR: 0,    seats: 4, floats: true },
};

export default class VehicleController {
  constructor(scene, network, audio, camera) {
    this.scene   = scene;
    this.network = network;
    this.audio   = audio;
    this.camera  = camera;

    // vehicleId → { mesh, data, engineAudio }
    this._vehicles = new Map();

    // Which vehicle the local player occupies
    this._occupiedVehicleId  = null;
    this._occupiedSeat       = null;

    // Engine audio sources per vehicle
    this._engineSources = new Map();

    // Network events
    this._unsubEnter   = network.on('vehicle:entered', (d) => this._onEntered(d));
    this._unsubExited  = network.on('vehicle:exited',  (d) => this._onExited(d));
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Initialise vehicles from room:start
  // ─────────────────────────────────────────────────────────────────────

  initialise(vehicleArray) {
    for (const v of vehicleArray) {
      this._spawnVehicle(v);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Spawn
  // ─────────────────────────────────────────────────────────────────────

  _spawnVehicle(vehicleData) {
    if (this._vehicles.has(vehicleData.id)) return;

    const def  = VEHICLE_DEFS[vehicleData.type] || VEHICLE_DEFS.car;
    const mesh = this._buildMesh(vehicleData.type, def);

    mesh.position.set(vehicleData.position.x, vehicleData.position.y, vehicleData.position.z);
    mesh.rotation.y = vehicleData.rotation || 0;
    this.scene.add(mesh);

    this._vehicles.set(vehicleData.id, {
      mesh,
      def,
      data:   vehicleData,
      health: vehicleData.health || 100,
      fuel:   vehicleData.fuel   || 100,
    });
  }

  _buildMesh(type, def) {
    const group = new THREE.Group();
    const mat   = new THREE.MeshLambertMaterial({ color: def.color });

    // Body
    const bodyGeo  = new THREE.BoxGeometry(def.width, def.height * 0.6, def.length);
    const body     = new THREE.Mesh(bodyGeo, mat);
    body.position.y = def.wheelR + def.height * 0.3;
    body.castShadow = true;
    group.add(body);

    if (type !== 'boat') {
      // Cabin
      const cabinMat = new THREE.MeshLambertMaterial({ color: 0x335566, transparent: true, opacity: 0.6 });
      const cabinGeo = new THREE.BoxGeometry(def.width * 0.8, def.height * 0.5, def.length * 0.4);
      const cabin    = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.set(0, def.wheelR + def.height * 0.85, -def.length * 0.05);
      group.add(cabin);

      // Wheels (4 for car, 2 for motorcycle)
      const wheelCount = type === 'motorcycle' ? 2 : 4;
      const wheelMat   = new THREE.MeshLambertMaterial({ color: 0x111111 });
      const wheelGeo   = new THREE.CylinderGeometry(def.wheelR, def.wheelR, def.width * 0.2, 12);

      const positions = type === 'motorcycle'
        ? [[-def.length * 0.4, 0], [def.length * 0.4, 0]]
        : [
            [-def.width / 2 - 0.05, -def.length * 0.35],
            [ def.width / 2 + 0.05, -def.length * 0.35],
            [-def.width / 2 - 0.05,  def.length * 0.35],
            [ def.width / 2 + 0.05,  def.length * 0.35],
          ];

      for (const [wx, wz] of positions) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, def.wheelR, wz);
        wheel.castShadow = true;
        group.add(wheel);
      }
    }

    return group;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Update
  // ─────────────────────────────────────────────────────────────────────

  update(vehicleStates, input, localPlayerId, dt) {
    if (!vehicleStates) return;

    // Update all vehicle positions from server state
    for (const vs of vehicleStates) {
      let entry = this._vehicles.get(vs.id);
      if (!entry) {
        this._spawnVehicle(vs);
        entry = this._vehicles.get(vs.id);
      }

      const mesh = entry.mesh;

      // Smooth interpolate position and rotation
      mesh.position.x += (vs.position.x - mesh.position.x) * Math.min(1, dt * 12);
      mesh.position.y += (vs.position.y - mesh.position.y) * Math.min(1, dt * 12);
      mesh.position.z += (vs.position.z - mesh.position.z) * Math.min(1, dt * 12);

      const dr = _angleDiff(vs.rotation, mesh.rotation.y);
      mesh.rotation.y += dr * Math.min(1, dt * 12);

      entry.health = vs.health;

      // Low health — show damage tint
      const mat = mesh.children[0]?.material;
      if (mat && entry.health < 30) {
        mat.color.setHex(0x552211);
      }
    }

    // Driver input
    if (this._occupiedVehicleId && this._occupiedSeat === 0) {
      const throttle = (input.isHeld('moveForward') ? 1 : 0) - (input.isHeld('moveBackward') ? 1 : 0);
      const steer    = (input.isHeld('strafeRight') ? 1 : 0) - (input.isHeld('strafeLeft')   ? 1 : 0);
      const brake    = input.isHeld('crouch') ? 1 : 0;
      this.network.sendVehicleSteer(throttle, steer, brake);
    }

    // Exit vehicle
    if (input.wasJustPressed('vehicleExit') && this._occupiedVehicleId) {
      this.network.sendVehicleExit();
    }

    // Enter vehicle (proximity check done in LootManager style)
    if (input.wasJustPressed('vehicleEnter') && !this._occupiedVehicleId) {
      const nearest = this._findNearestVehicle(input._playerPos);
      if (nearest) this.network.sendVehicleEnter(nearest);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Network events
  // ─────────────────────────────────────────────────────────────────────

  _onEntered({ vehicleId, playerId, seat }) {
    const entry = this._vehicles.get(vehicleId);
    if (!entry) return;

    // Check if it's the local player
    if (playerId === this._localPlayerId) {
      this._occupiedVehicleId = vehicleId;
      this._occupiedSeat      = seat;
      this.camera.setMode('tps');

      // Start engine audio
      const soundId = entry.def.floats ? 'vehicle_engine_boat' : 'vehicle_engine_car';
      // const src = this.audio.play3D(soundId, entry.mesh.position, { loop: true });
      // this._engineSources.set(vehicleId, src);
    }
  }

  _onExited({ vehicleId, playerId, position }) {
    if (playerId === this._localPlayerId) {
      this._occupiedVehicleId = null;
      this._occupiedSeat      = null;
      this.camera.setMode('fps');

      const src = this._engineSources.get(vehicleId);
      if (src) { this.audio.stopSource(src.source); this._engineSources.delete(vehicleId); }
    }
  }

  _findNearestVehicle(playerPos, maxDist = 5) {
    if (!playerPos) return null;
    let nearest = null;
    let nearestDist = maxDist;
    for (const [id, entry] of this._vehicles) {
      const dx = entry.mesh.position.x - playerPos.x;
      const dz = entry.mesh.position.z - playerPos.z;
      const d  = Math.sqrt(dx * dx + dz * dz);
      if (d < nearestDist) { nearestDist = d; nearest = id; }
    }
    return nearest;
  }

  setLocalPlayerId(id) { this._localPlayerId = id; }

  dispose() {
    this._unsubEnter?.();
    this._unsubExited?.();
    for (const [, entry] of this._vehicles) {
      this.scene.remove(entry.mesh);
      entry.mesh.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
    }
    this._vehicles.clear();
  }
}

function _angleDiff(target, current) {
  let d = target - current;
  while (d > Math.PI)  d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
