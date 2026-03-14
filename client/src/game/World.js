/**
 * World — 4 km² procedurally generated terrain with:
 *   - Heightmap-based terrain using SimplexNoise
 *   - Biomes: grasslands, hills, forest, coastal, town
 *   - Buildings & cover objects
 *   - Water plane
 *   - LOD for terrain chunks
 *   - Static collision mesh
 */

import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

// Patch Three.js mesh raycast for BVH acceleration
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const MAP_SIZE        = 4000;
const CHUNK_SIZE      = 200;
const CHUNKS_PER_SIDE = MAP_SIZE / CHUNK_SIZE;   // 20x20 = 400 chunks
const TERRAIN_SEGS    = 64;     // segments per chunk at full LOD
const TERRAIN_SEGS_MED = 32;
const TERRAIN_SEGS_LOW = 16;
const WATER_LEVEL     = 0;
const MAX_HEIGHT      = 120;

export default class World {
  constructor(renderer, camera) {
    this.renderer = renderer;
    this.camera   = camera;
    this.scene    = renderer.scene;

    this._noise     = new SimplexNoise();
    this._chunks    = new Map();   // `${cx}:${cz}` → THREE.LOD
    this._colMeshes = [];          // collision meshes for camera & player
    this._buildings = [];          // spawned structures
    this._trees     = [];          // instanced trees

    this._buildingInstances = null;
    this._treeInstances     = null;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Build world
  // ─────────────────────────────────────────────────────────────────────

  async build(onProgress) {
    const total = CHUNKS_PER_SIDE * CHUNKS_PER_SIDE;
    let done = 0;

    // Build terrain chunks
    for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) {
      for (let cz = 0; cz < CHUNKS_PER_SIDE; cz++) {
        this._buildChunk(cx, cz);
        done++;
        if (onProgress) onProgress(done / total * 0.7);
        // Yield to UI every 10 chunks to prevent freeze
        if (done % 10 === 0) await _yield();
      }
    }

    this._buildWater();
    if (onProgress) onProgress(0.8);
    await _yield();

    this._buildBuildingLayout();
    if (onProgress) onProgress(0.9);
    await _yield();

    this._buildInstancedFoliage();
    if (onProgress) onProgress(1.0);

    // Register collision meshes with camera
    this.camera.setCollisionMeshes(this._colMeshes);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Terrain
  // ─────────────────────────────────────────────────────────────────────

  _buildChunk(cx, cz) {
    const worldX = cx * CHUNK_SIZE;
    const worldZ = cz * CHUNK_SIZE;

    const makeMesh = (segs, mat) => {
      const geo  = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, segs, segs);
      const verts = geo.attributes.position.array;
      // Apply heightmap to vertices
      for (let i = 0; i < verts.length; i += 3) {
        const wx = worldX + verts[i]    + CHUNK_SIZE / 2;
        const wz = worldZ + verts[i + 2] + CHUNK_SIZE / 2;
        verts[i + 1] = this._heightAt(wx, wz);
      }
      geo.rotateX(-Math.PI / 2);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.castShadow    = false;
      return mesh;
    };

    const mat = this._getTerrainMaterial(cx, cz);

    const lod = new THREE.LOD();
    lod.addLevel(makeMesh(TERRAIN_SEGS,     mat), 0);
    lod.addLevel(makeMesh(TERRAIN_SEGS_MED, mat), 300);
    lod.addLevel(makeMesh(TERRAIN_SEGS_LOW, mat), 600);

    lod.position.set(worldX + CHUNK_SIZE / 2, 0, worldZ + CHUNK_SIZE / 2);
    this.scene.add(lod);
    this._chunks.set(`${cx}:${cz}`, lod);

    // Build full-res collision mesh for this chunk
    const colGeo  = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, TERRAIN_SEGS, TERRAIN_SEGS);
    const colVerts = colGeo.attributes.position.array;
    for (let i = 0; i < colVerts.length; i += 3) {
      const wx = worldX + colVerts[i]     + CHUNK_SIZE / 2;
      const wz = worldZ + colVerts[i + 2] + CHUNK_SIZE / 2;
      colVerts[i + 1] = this._heightAt(wx, wz);
    }
    colGeo.rotateX(-Math.PI / 2);
    colGeo.computeVertexNormals();
    const colMesh = new THREE.Mesh(colGeo, new THREE.MeshBasicMaterial({ visible: false }));
    colMesh.position.copy(lod.position);
    colMesh.geometry.boundsTree = new MeshBVH(colGeo);  // BVH for fast raycasting
    colMesh.updateMatrixWorld(true);
    this.scene.add(colMesh);
    this._colMeshes.push(colMesh);
  }

  _heightAt(worldX, worldZ) {
    // Multi-octave simplex noise for natural-looking terrain
    const nx = worldX / MAP_SIZE;
    const nz = worldZ / MAP_SIZE;

    let h = 0;
    h += this._noise.noise(nx * 2,   nz * 2)   * 0.500;
    h += this._noise.noise(nx * 4,   nz * 4)   * 0.250;
    h += this._noise.noise(nx * 8,   nz * 8)   * 0.125;
    h += this._noise.noise(nx * 16,  nz * 16)  * 0.0625;
    h += this._noise.noise(nx * 32,  nz * 32)  * 0.03125;

    h = (h + 1) / 2;  // normalise 0–1

    // Island mask — force edges to sea level
    const mx = Math.abs(nx - 0.5) * 2;
    const mz = Math.abs(nz - 0.5) * 2;
    const mask = 1 - Math.pow(Math.max(mx, mz), 2.5);
    h *= Math.max(0, mask);

    return h * MAX_HEIGHT - 2;
  }

  _getTerrainMaterial(cx, cz) {
    // Blended terrain texture based on biome
    // In production: use a shader that samples 4 textures by weight
    const h = this._heightAt(
      cx * CHUNK_SIZE + CHUNK_SIZE / 2,
      cz * CHUNK_SIZE + CHUNK_SIZE / 2
    );

    if (h < 2)   return new THREE.MeshLambertMaterial({ color: 0x8B9D77 });   // sandy coast
    if (h < 30)  return new THREE.MeshLambertMaterial({ color: 0x5A7A3A });   // grass
    if (h < 70)  return new THREE.MeshLambertMaterial({ color: 0x7B8C6B });   // highland
    return       new THREE.MeshLambertMaterial({ color: 0x999999 });           // rock / peak
  }

  _buildWater() {
    const waterGeo = new THREE.PlaneGeometry(MAP_SIZE * 2, MAP_SIZE * 2);
    const waterMat = new THREE.MeshLambertMaterial({
      color: 0x006994,
      transparent: true,
      opacity: 0.8,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(MAP_SIZE / 2, WATER_LEVEL, MAP_SIZE / 2);
    water.receiveShadow = true;
    this.scene.add(water);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Buildings
  // ─────────────────────────────────────────────────────────────────────

  _buildBuildingLayout() {
    // Predefined town centres (in world space)
    const towns = [
      { x: 800,  z: 800,  density: 30 },
      { x: 3200, z: 800,  density: 20 },
      { x: 800,  z: 3200, density: 20 },
      { x: 3200, z: 3200, density: 25 },
      { x: 2000, z: 2000, density: 40 },  // central city
    ];

    const buildingMat = new THREE.MeshLambertMaterial({ color: 0xBDB09A });
    const roofMat     = new THREE.MeshLambertMaterial({ color: 0x8B7355 });

    for (const town of towns) {
      for (let i = 0; i < town.density; i++) {
        const ox  = (Math.random() - 0.5) * 400;
        const oz  = (Math.random() - 0.5) * 400;
        const bx  = town.x + ox;
        const bz  = town.z + oz;
        const by  = this._heightAt(bx, bz);
        const w   = 6  + Math.random() * 14;
        const d   = 6  + Math.random() * 14;
        const h   = 3  + Math.random() * 12;

        // Walls
        const wallGeo  = new THREE.BoxGeometry(w, h, d);
        const wallMesh = new THREE.Mesh(wallGeo, buildingMat);
        wallMesh.position.set(bx, by + h / 2, bz);
        wallMesh.castShadow    = true;
        wallMesh.receiveShadow = true;
        this.scene.add(wallMesh);

        // Roof
        const roofGeo  = new THREE.ConeGeometry(Math.max(w, d) * 0.72, 3, 4);
        const roofMesh = new THREE.Mesh(roofGeo, roofMat);
        roofMesh.position.set(bx, by + h + 1.5, bz);
        roofMesh.rotation.y = Math.PI / 4;
        this.scene.add(roofMesh);

        // Register as collision mesh
        wallGeo.computeBoundingBox();
        wallMesh.geometry.boundsTree = new MeshBVH(wallGeo);
        wallMesh.updateMatrixWorld(true);
        this._colMeshes.push(wallMesh);

        this._buildings.push({ position: { x: bx, y: by, z: bz }, width: w, height: h, depth: d });
      }
    }

    // Scatter rocks and barriers as cover
    for (let i = 0; i < 800; i++) {
      const rx = Math.random() * MAP_SIZE;
      const rz = Math.random() * MAP_SIZE;
      const ry = this._heightAt(rx, rz);
      if (ry < 0) continue;

      const scale = 0.5 + Math.random() * 2.5;
      const rockGeo  = new THREE.DodecahedronGeometry(scale, 0);
      const rockMat  = new THREE.MeshLambertMaterial({ color: 0x777777 });
      const rock     = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(rx, ry + scale * 0.5, rz);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow    = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
      rockGeo.boundsTree = new MeshBVH(rockGeo);
      rock.updateMatrixWorld(true);
      this._colMeshes.push(rock);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Foliage (instanced for performance)
  // ─────────────────────────────────────────────────────────────────────

  _buildInstancedFoliage() {
    const TREE_COUNT = 15_000;
    const treeTrunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 4, 5);
    const treeTopGeo   = new THREE.ConeGeometry(1.5, 5, 6);
    const trunkMat     = new THREE.MeshLambertMaterial({ color: 0x5C3D1E });
    const topMat       = new THREE.MeshLambertMaterial({ color: 0x2D5A1B });

    const trunkInst = new THREE.InstancedMesh(treeTrunkGeo, trunkMat, TREE_COUNT);
    const topInst   = new THREE.InstancedMesh(treeTopGeo,   topMat,   TREE_COUNT);
    trunkInst.castShadow = topInst.castShadow = true;

    const dummy = new THREE.Object3D();
    let   count = 0;

    for (let i = 0; i < TREE_COUNT * 3 && count < TREE_COUNT; i++) {
      const tx = Math.random() * MAP_SIZE;
      const tz = Math.random() * MAP_SIZE;
      const ty = this._heightAt(tx, tz);
      if (ty < 2 || ty > 80) continue;

      const scale = 0.7 + Math.random() * 0.6;
      dummy.position.set(tx, ty + 2 * scale, tz);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(count, dummy.matrix);

      dummy.position.y = ty + 4 * scale + 2.5 * scale;
      dummy.updateMatrix();
      topInst.setMatrixAt(count, dummy.matrix);

      count++;
    }

    trunkInst.instanceMatrix.needsUpdate = true;
    topInst.instanceMatrix.needsUpdate   = true;
    this.scene.add(trunkInst, topInst);
    this._treeInstances = { trunkInst, topInst };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────────────────────────────

  getHeightAt(x, z) {
    return this._heightAt(x, z);
  }

  getCollisionMeshes() {
    return this._colMeshes;
  }

  getBuildingPositions() {
    return this._buildings;
  }

  // Returns loot spawn candidate positions (indoors/outdoors mix)
  getLootSpawnPoints(count = 2000) {
    const points = [];
    // From buildings
    for (const b of this._buildings) {
      points.push({ x: b.position.x, y: b.position.y + 1, z: b.position.z });
      if (points.length >= count * 0.4) break;
    }
    // Random outdoor positions
    while (points.length < count) {
      const x = Math.random() * MAP_SIZE;
      const z = Math.random() * MAP_SIZE;
      const y = this._heightAt(x, z);
      if (y >= 0) points.push({ x, y: y + 0.5, z });
    }
    return points;
  }

  update(dt) {
    // Water shader animation would update here
    // Animate instanced tree swaying (simplified — just update shader uniforms)
  }

  dispose() {
    for (const lod of this._chunks.values()) {
      this.scene.remove(lod);
      lod.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
    }
    this._chunks.clear();
    this._colMeshes.forEach(m => { m.geometry?.dispose(); m.material?.dispose(); });
  }
}

function _yield() {
  return new Promise(resolve => setTimeout(resolve, 0));
}
