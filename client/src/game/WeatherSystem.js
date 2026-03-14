/**
 * WeatherSystem — dynamic weather: clear, cloudy, rain, fog, storm.
 * Affects: visibility (fog), audio (rain), rendering (particles), gameplay.
 */

import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

const WEATHER_TYPES = ['clear', 'cloudy', 'rain', 'fog', 'storm'];

export default class WeatherSystem {
  constructor(scene, renderer, audio) {
    this.scene    = scene;
    this.renderer = renderer;
    this.audio    = audio;

    this.currentWeather = 'clear';
    this.timeOfDay      = 0.35;   // 0–1, starts at early morning
    this._timeSpeed     = 1 / (20 * 60);  // full day in 20 real minutes

    // Sky
    this._sky = new Sky();
    this._sky.scale.setScalar(450000);
    scene.add(this._sky);

    this._sun          = new THREE.Vector3();
    this._sunElevation = 20;

    // Rain particles
    this._rainGeo  = null;
    this._rainMesh = null;
    this._rainRate = 0;

    // Fog
    this._targetFogDensity = 0.00012;

    // Lightning for storm
    this._lightningTimer   = 0;
    this._lightningLight   = new THREE.PointLight(0xaaccff, 0, 500);
    scene.add(this._lightningLight);

    // Audio
    this._rainAudioSrc = null;

    this._initSky();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Sky
  // ─────────────────────────────────────────────────────────────────────

  _initSky() {
    const uniforms = this._sky.material.uniforms;
    uniforms['turbidity'].value     = 10;
    uniforms['rayleigh'].value      = 2;
    uniforms['mieCoefficient'].value = 0.005;
    uniforms['mieDirectionalG'].value = 0.8;
  }

  _updateSky(timeOfDay) {
    const elevation = Math.sin(timeOfDay * Math.PI * 2 - Math.PI / 2) * 90;
    const azimuth   = 180 + timeOfDay * 180;

    const phi   = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    this._sun.setFromSphericalCoords(1, phi, theta);

    const uniforms = this._sky.material.uniforms;
    uniforms['sunPosition'].value.copy(this._sun);

    // Update directional light direction
    this.renderer.sunLight?.position.copy(this._sun.clone().multiplyScalar(800));
    this.renderer.updateDayNight(timeOfDay);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Weather change
  // ─────────────────────────────────────────────────────────────────────

  setWeather(type) {
    if (!WEATHER_TYPES.includes(type)) return;
    this.currentWeather = type;

    switch (type) {
      case 'clear':
        this._targetFogDensity = 0.00008;
        this._setRainRate(0);
        this._stopRainAudio();
        break;
      case 'cloudy':
        this._targetFogDensity = 0.00015;
        this._setRainRate(0);
        this._sky.material.uniforms['turbidity'].value = 20;
        this._stopRainAudio();
        break;
      case 'rain':
        this._targetFogDensity = 0.0004;
        this._setRainRate(8000);
        this._startRainAudio(0.4);
        break;
      case 'fog':
        this._targetFogDensity = 0.003;
        this._setRainRate(0);
        this._stopRainAudio();
        break;
      case 'storm':
        this._targetFogDensity = 0.0008;
        this._setRainRate(15000);
        this._startRainAudio(0.9);
        this._lightningTimer = Math.random() * 5 + 2;
        break;
    }

    // Notify HUD of visibility change
    window.dispatchEvent(new CustomEvent('weather:changed', {
      detail: { type, fogDensity: this._targetFogDensity }
    }));
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Rain particles
  // ─────────────────────────────────────────────────────────────────────

  _setRainRate(particleCount) {
    this._rainRate = particleCount;

    if (this._rainMesh) {
      this.scene.remove(this._rainMesh);
      this._rainGeo.dispose();
      this._rainMesh.material.dispose();
      this._rainMesh = null;
      this._rainGeo  = null;
    }

    if (particleCount === 0) return;

    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 300;
      positions[i * 3 + 1] = Math.random() * 80;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 300;
    }

    this._rainGeo = new THREE.BufferGeometry();
    this._rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color:       0xAACCEE,
      size:        0.1,
      transparent: true,
      opacity:     0.5,
    });

    this._rainMesh = new THREE.Points(this._rainGeo, mat);
    this.scene.add(this._rainMesh);
  }

  _startRainAudio(volume) {
    if (this._rainAudioSrc) return;
    // this._rainAudioSrc = this.audio.play2D('rain_loop', { loop: true, volume, channel: 'sfx' });
  }

  _stopRainAudio() {
    if (this._rainAudioSrc) {
      this.audio.stopSource(this._rainAudioSrc);
      this._rainAudioSrc = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Update
  // ─────────────────────────────────────────────────────────────────────

  update(playerPosition, dt) {
    // Advance time of day
    this.timeOfDay = (this.timeOfDay + this._timeSpeed * dt) % 1;
    this._updateSky(this.timeOfDay);

    // Lerp fog density
    const fog = this.scene.fog;
    if (fog) {
      fog.density += (this._targetFogDensity - fog.density) * Math.min(1, dt * 0.5);
    }

    // Move rain to follow player
    if (this._rainMesh && playerPosition) {
      this._rainMesh.position.set(playerPosition.x, playerPosition.y, playerPosition.z);

      // Animate rain fall
      const pos = this._rainGeo.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 1] -= 30 * dt;
        if (pos[i + 1] < -10) pos[i + 1] = 80;
      }
      this._rainGeo.attributes.position.needsUpdate = true;
    }

    // Lightning
    if (this.currentWeather === 'storm') {
      this._lightningTimer -= dt;
      if (this._lightningTimer <= 0) {
        this._triggerLightning();
        this._lightningTimer = Math.random() * 8 + 3;
      }
      this._lightningLight.intensity *= 0.85;
    }
  }

  _triggerLightning() {
    this._lightningLight.position.set(
      (Math.random() - 0.5) * 1000,
      200,
      (Math.random() - 0.5) * 1000
    );
    this._lightningLight.intensity = 5;
    // this.audio.play3D('thunder', this._lightningLight.position, { volume: 0.8, maxDistance: 800 });
  }

  // ─────────────────────────────────────────────────────────────────────

  getVisibilityMultiplier() {
    switch (this.currentWeather) {
      case 'fog':   return 0.3;
      case 'storm': return 0.5;
      case 'rain':  return 0.7;
      default:      return 1.0;
    }
  }

  dispose() {
    this.scene.remove(this._sky);
    this._stopRainAudio();
    if (this._rainMesh) {
      this.scene.remove(this._rainMesh);
      this._rainGeo.dispose();
      this._rainMesh.material.dispose();
    }
    this.scene.remove(this._lightningLight);
  }
}
