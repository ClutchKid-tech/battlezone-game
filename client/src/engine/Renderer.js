/**
 * Renderer — Three.js scene management with LOD, occlusion culling,
 * shadow mapping, post-processing, and day/night sky.
 */

import * as THREE from 'three';
import { EffectComposer }     from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }         from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass }           from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass }    from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass }          from 'three/examples/jsm/postprocessing/BokehPass.js';
import { SSAOPass }           from 'three/examples/jsm/postprocessing/SSAOPass.js';

const QUALITY_PRESETS = {
  low:    { shadowMapSize: 512,  shadowType: THREE.BasicShadowMap,     antialias: false, bloom: false, ssao: false, pixelRatio: 0.75 },
  medium: { shadowMapSize: 1024, shadowType: THREE.PCFShadowMap,       antialias: true,  bloom: false, ssao: false, pixelRatio: 1.0  },
  high:   { shadowMapSize: 2048, shadowType: THREE.PCFSoftShadowMap,   antialias: true,  bloom: true,  ssao: false, pixelRatio: 1.0  },
  ultra:  { shadowMapSize: 4096, shadowType: THREE.VSMShadowMap,       antialias: true,  bloom: true,  ssao: true,  pixelRatio: window.devicePixelRatio },
};

export default class Renderer {
  constructor(canvas, quality = 'high') {
    this.canvas  = canvas;
    this.quality = quality;
    this.scene   = new THREE.Scene();
    this.clock   = new THREE.Clock();

    this._initRenderer();
    this._initScene();
    this._initLighting();
    this._initPostProcessing();
    this._initOcclusionCulling();

    this._resizeHandler = this._onResize.bind(this);
    window.addEventListener('resize', this._resizeHandler);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Initialisation
  // ─────────────────────────────────────────────────────────────────────

  _initRenderer() {
    const preset = QUALITY_PRESETS[this.quality];

    this.renderer = new THREE.WebGLRenderer({
      canvas:      this.canvas,
      antialias:   preset.antialias,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,  // eliminates z-fighting at long distances
    });

    this.renderer.setPixelRatio(Math.min(preset.pixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = preset.shadowType;
    this.renderer.outputColorSpace   = THREE.SRGBColorSpace;
    this.renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.physicallyCorrectLights = true;

    this._preset = preset;
  }

  _initScene() {
    // Fog — atmospheric depth + hides pop-in at LOD transition
    this.scene.fog = new THREE.FogExp2(0xC8D5E0, 0.00012);

    // Background handled by Sky shader (see WeatherSystem) but set a fallback
    this.scene.background = new THREE.Color(0x87CEEB);
  }

  _initLighting() {
    // Ambient — fills shadows
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(this.ambientLight);

    // Sun / directional — casts shadows, position updated by day-night cycle
    this.sunLight = new THREE.DirectionalLight(0xfffbe8, 1.8);
    this.sunLight.position.set(500, 800, 300);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(this._preset.shadowMapSize, this._preset.shadowMapSize);
    this.sunLight.shadow.camera.near    = 1;
    this.sunLight.shadow.camera.far     = 3000;
    this.sunLight.shadow.camera.left    = -600;
    this.sunLight.shadow.camera.right   = 600;
    this.sunLight.shadow.camera.top     = 600;
    this.sunLight.shadow.camera.bottom  = -600;
    this.sunLight.shadow.bias           = -0.0003;
    this.sunLight.shadow.normalBias     = 0.02;
    this.scene.add(this.sunLight);

    // Moon (night)
    this.moonLight = new THREE.DirectionalLight(0x6680b0, 0.1);
    this.moonLight.position.set(-500, 400, -200);
    this.scene.add(this.moonLight);

    // Hemisphere — sky / ground ambient colour
    this.hemiLight = new THREE.HemisphereLight(0x8EC5FC, 0x8B7355, 0.4);
    this.scene.add(this.hemiLight);
  }

  _initPostProcessing() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.composer = new EffectComposer(this.renderer);

    // Base render
    this._renderPass = new RenderPass(this.scene, null);  // camera set later
    this.composer.addPass(this._renderPass);

    // SSAO
    if (this._preset.ssao) {
      this._ssaoPass = new SSAOPass(this.scene, null, w, h);
      this._ssaoPass.kernelRadius = 16;
      this._ssaoPass.minDistance  = 0.005;
      this._ssaoPass.maxDistance  = 0.1;
      this.composer.addPass(this._ssaoPass);
    }

    // Bloom
    if (this._preset.bloom) {
      this._bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.4, 0.85);
      this.composer.addPass(this._bloomPass);
    }

    // SMAA anti-aliasing (post-process, works with TAA-unfriendly features)
    if (this._preset.antialias) {
      this._smaaPass = new SMAAPass(w, h);
      this.composer.addPass(this._smaaPass);
    }
  }

  _initOcclusionCulling() {
    // Simple frustum-based culling — objects outside camera frustum are not rendered
    this._frustum          = new THREE.Frustum();
    this._cameraViewMatrix = new THREE.Matrix4();
    this._lodObjects       = [];   // { mesh, lodLevels: [{distance, detail}] }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Camera attachment
  // ─────────────────────────────────────────────────────────────────────

  setCamera(camera) {
    this.camera = camera;
    this._renderPass.camera = camera;
    if (this._ssaoPass)  this._ssaoPass.camera  = camera;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  LOD registration
  // ─────────────────────────────────────────────────────────────────────

  registerLOD(lod) {
    this.scene.add(lod);
    this._lodObjects.push(lod);
  }

  // Create a LOD from multiple meshes at different distances
  createLOD(levels) {
    // levels: [{ mesh: Mesh, distance: Number }]
    const lod = new THREE.LOD();
    for (const { mesh, distance } of levels) {
      lod.addLevel(mesh, distance);
    }
    return lod;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Day / Night cycle
  // ─────────────────────────────────────────────────────────────────────

  updateDayNight(timeOfDay) {
    // timeOfDay: 0–1  (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset)
    const angle  = timeOfDay * Math.PI * 2 - Math.PI / 2;
    const height = Math.sin(angle);
    const horiz  = Math.cos(angle);

    this.sunLight.position.set(horiz * 800, height * 800, 200);
    this.moonLight.position.set(-horiz * 600, -height * 600, -200);

    // Fade between day and night colour temperatures
    const dayIntensity   = Math.max(0, height);
    const nightIntensity = Math.max(0, -height * 0.5);

    this.sunLight.intensity  = dayIntensity   * 1.8;
    this.moonLight.intensity = nightIntensity * 0.4;
    this.ambientLight.intensity = 0.1 + dayIntensity * 0.3;

    // Sky colour
    const skyDay   = new THREE.Color(0x87CEEB);
    const skyDusk  = new THREE.Color(0xFF7F50);
    const skyNight = new THREE.Color(0x0A0A1A);

    let skyColor;
    if (height > 0.2) {
      skyColor = skyDay;
    } else if (height > -0.1) {
      const t = (height - (-0.1)) / 0.3;
      skyColor = skyNight.clone().lerp(skyDusk, t);
    } else {
      skyColor = skyNight;
    }

    this.scene.background = skyColor;
    this.scene.fog.color.copy(skyColor);

    // Hemisphere sky/ground colours
    this.hemiLight.color.setHex(height > 0 ? 0x8EC5FC : 0x1a1a3a);
    this.hemiLight.intensity = 0.2 + dayIntensity * 0.4;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Frame render
  // ─────────────────────────────────────────────────────────────────────

  render() {
    if (!this.camera) return;

    // Update frustum for occlusion culling
    this._cameraViewMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this._frustum.setFromProjectionMatrix(this._cameraViewMatrix);

    // Update LODs based on camera distance
    for (const lod of this._lodObjects) {
      lod.update(this.camera);
    }

    this.composer.render();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Quality / settings
  // ─────────────────────────────────────────────────────────────────────

  setQuality(quality) {
    this.quality = quality;
    const preset = QUALITY_PRESETS[quality];
    this.renderer.setPixelRatio(Math.min(preset.pixelRatio, 2));
    this.renderer.shadowMap.type = preset.shadowType;
    this.sunLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    this.sunLight.shadow.map = null;  // force re-allocate
    this._preset = preset;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────────────────────

  isInFrustum(object) {
    if (!object.geometry?.boundingSphere) return true;
    const sphere = object.geometry.boundingSphere.clone().applyMatrix4(object.matrixWorld);
    return this._frustum.intersectsSphere(sphere);
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  dispose() {
    window.removeEventListener('resize', this._resizeHandler);
    this.renderer.dispose();
    this.composer.dispose();
  }
}
