/**
 * AudioManager — Web Audio API 3D spatial audio.
 * Handles: gunshots, footsteps, ambience, music, voice, UI sounds.
 * All positional audio uses PannerNode with HRTF for binaural effect.
 */

const MASTER_VOLUME  = 0.8;
const MUSIC_VOLUME   = 0.3;
const SFX_VOLUME     = 0.9;
const VOICE_VOLUME   = 1.0;
const MAX_DISTANCE   = 400;   // metres — max audible distance for gunshots

export default class AudioManager {
  constructor() {
    this.ctx    = new (window.AudioContext || window.webkitAudioContext)();
    this.paused = false;

    // Master gain chain
    this._masterGain = this.ctx.createGain();
    this._masterGain.gain.value = MASTER_VOLUME;
    this._masterGain.connect(this.ctx.destination);

    // Channel gains
    this._musicGain  = this._createGain(MUSIC_VOLUME);
    this._sfxGain    = this._createGain(SFX_VOLUME);
    this._voiceGain  = this._createGain(VOICE_VOLUME);
    this._uiGain     = this._createGain(SFX_VOLUME);

    // Listener (player's ears) — updated every frame
    this._listener = this.ctx.listener;

    // Buffer cache
    this._buffers = new Map();

    // Active sources (for cleanup)
    this._activeSources = new Set();

    // Reverb for outdoors
    this._reverb = null;
    this._loadReverb();

    // Load core sounds
    this._loadCoreSounds();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Listener (player position/orientation)
  // ─────────────────────────────────────────────────────────────────────

  updateListener(position, forward, up) {
    if (this._listener.positionX) {
      this._listener.positionX.setValueAtTime(position.x, this.ctx.currentTime);
      this._listener.positionY.setValueAtTime(position.y, this.ctx.currentTime);
      this._listener.positionZ.setValueAtTime(position.z, this.ctx.currentTime);
      this._listener.forwardX.setValueAtTime(forward.x, this.ctx.currentTime);
      this._listener.forwardY.setValueAtTime(forward.y, this.ctx.currentTime);
      this._listener.forwardZ.setValueAtTime(forward.z, this.ctx.currentTime);
      this._listener.upX.setValueAtTime(up.x, this.ctx.currentTime);
      this._listener.upY.setValueAtTime(up.y, this.ctx.currentTime);
      this._listener.upZ.setValueAtTime(up.z, this.ctx.currentTime);
    } else {
      // Older API
      this._listener.setPosition(position.x, position.y, position.z);
      this._listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Playback
  // ─────────────────────────────────────────────────────────────────────

  // Play a 2D (non-positional) sound — UI, music etc.
  play2D(soundId, { loop = false, volume = 1, channel = 'sfx' } = {}) {
    const buffer = this._buffers.get(soundId);
    if (!buffer) { this._queuePlay2D(soundId, { loop, volume, channel }); return null; }

    this.ctx.resume();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop   = loop;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this._getChannelGain(channel));

    source.start();
    this._activeSources.add(source);
    source.onended = () => this._activeSources.delete(source);
    return source;
  }

  // Play a 3D positional sound at worldPosition
  play3D(soundId, worldPosition, { volume = 1, maxDistance = MAX_DISTANCE, rolloff = 1.5 } = {}) {
    const buffer = this._buffers.get(soundId);
    if (!buffer) return null;

    this.ctx.resume();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Randomise pitch slightly for variation
    source.playbackRate.value = 0.95 + Math.random() * 0.1;

    const panner = this.ctx.createPanner();
    panner.panningModel     = 'HRTF';
    panner.distanceModel    = 'exponential';
    panner.rolloffFactor    = rolloff;
    panner.refDistance      = 1;
    panner.maxDistance      = maxDistance;
    panner.coneOuterGain    = 0.3;

    if (panner.positionX) {
      panner.positionX.setValueAtTime(worldPosition.x, this.ctx.currentTime);
      panner.positionY.setValueAtTime(worldPosition.y, this.ctx.currentTime);
      panner.positionZ.setValueAtTime(worldPosition.z, this.ctx.currentTime);
    } else {
      panner.setPosition(worldPosition.x, worldPosition.y, worldPosition.z);
    }

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(panner);
    panner.connect(this._sfxGain);
    if (this._reverb) panner.connect(this._reverb);

    source.start();
    this._activeSources.add(source);
    source.onended = () => this._activeSources.delete(source);
    return { source, panner };
  }

  // Update position of a playing 3D sound (for moving objects like vehicles)
  updatePosition(pannerRef, position) {
    if (!pannerRef?.panner) return;
    const p = pannerRef.panner;
    if (p.positionX) {
      p.positionX.linearRampToValueAtTime(position.x, this.ctx.currentTime + 0.05);
      p.positionY.linearRampToValueAtTime(position.y, this.ctx.currentTime + 0.05);
      p.positionZ.linearRampToValueAtTime(position.z, this.ctx.currentTime + 0.05);
    } else {
      p.setPosition(position.x, position.y, position.z);
    }
  }

  stopSource(source) {
    if (!source) return;
    try {
      source.stop();
      source.disconnect();
    } catch (_) { /* already stopped */ }
    this._activeSources.delete(source);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Weapon sounds
  // ─────────────────────────────────────────────────────────────────────

  playGunshot(weaponId, position, isSuppressed) {
    const soundId = isSuppressed ? `${weaponId}_suppressed` : `${weaponId}_fire`;
    const fallback = isSuppressed ? 'pistol_suppressed_fire' : 'generic_gunshot';
    this.play3D(this._buffers.has(soundId) ? soundId : fallback, position, {
      volume: isSuppressed ? 0.4 : 1.0,
      maxDistance: isSuppressed ? 80 : MAX_DISTANCE,
    });
  }

  playReload(weaponId) {
    const soundId = `${weaponId}_reload`;
    this.play2D(this._buffers.has(soundId) ? soundId : 'generic_reload', { volume: 0.8 });
  }

  playDryFire() {
    this.play2D('dry_fire', { volume: 0.5 });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Footsteps
  // ─────────────────────────────────────────────────────────────────────

  playFootstep(surface, isRunning) {
    const suffix    = isRunning ? '_run' : '_walk';
    const idx       = Math.floor(Math.random() * 4) + 1;
    const soundId   = `footstep_${surface}${suffix}_${idx}`;
    const fallbackId = `footstep_grass${suffix}_1`;
    this.play2D(this._buffers.has(soundId) ? soundId : fallbackId, {
      volume: isRunning ? 0.7 : 0.4,
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  UI / misc
  // ─────────────────────────────────────────────────────────────────────

  playUI(id)       { this.play2D(id, { channel: 'ui', volume: 0.6 }); }
  playHitmarker()  { this.play2D('hitmarker', { channel: 'ui', volume: 0.4 }); }
  playKillSound()  { this.play2D('kill_sound', { channel: 'ui', volume: 0.8 }); }
  playMenuMusic()  { return this.play2D('menu_music', { channel: 'music', loop: true }); }
  stopMusic(src)   { this.stopSource(src); }
  playZoneBeep()   { this.play2D('zone_beep', { channel: 'ui', volume: 0.5 }); }
  playHeartbeat()  { this.play2D('heartbeat', { channel: 'sfx', volume: 0.7 }); }

  // ─────────────────────────────────────────────────────────────────────
  //  Volume controls
  // ─────────────────────────────────────────────────────────────────────

  setMasterVolume(v)  { this._masterGain.gain.value = Math.max(0, Math.min(1, v)); }
  setMusicVolume(v)   { this._musicGain.gain.value  = Math.max(0, Math.min(1, v)); }
  setSFXVolume(v)     { this._sfxGain.gain.value    = Math.max(0, Math.min(1, v)); }
  setVoiceVolume(v)   { this._voiceGain.gain.value  = Math.max(0, Math.min(1, v)); }

  // ─────────────────────────────────────────────────────────────────────
  //  Loading
  // ─────────────────────────────────────────────────────────────────────

  async loadSound(id, url) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this._buffers.set(id, audioBuffer);
    } catch (err) {
      console.warn(`[Audio] Failed to load ${id} from ${url}:`, err.message);
    }
  }

  async loadSounds(manifest) {
    // manifest: { [id]: url }
    await Promise.all(Object.entries(manifest).map(([id, url]) => this.loadSound(id, url)));
  }

  _loadCoreSounds() {
    // These are loaded lazily — actual URLs point to /assets/sounds/
    const manifest = {
      generic_gunshot:         '/assets/sounds/weapons/generic_gunshot.ogg',
      pistol_suppressed_fire:  '/assets/sounds/weapons/pistol_suppressed.ogg',
      generic_reload:          '/assets/sounds/weapons/generic_reload.ogg',
      dry_fire:                '/assets/sounds/weapons/dry_fire.ogg',
      hitmarker:               '/assets/sounds/ui/hitmarker.ogg',
      kill_sound:              '/assets/sounds/ui/kill_sound.ogg',
      menu_music:              '/assets/sounds/music/menu_theme.ogg',
      zone_beep:               '/assets/sounds/ui/zone_beep.ogg',
      heartbeat:               '/assets/sounds/ui/heartbeat.ogg',
      footstep_grass_walk_1:   '/assets/sounds/footsteps/grass_walk_1.ogg',
      footstep_grass_run_1:    '/assets/sounds/footsteps/grass_run_1.ogg',
      explosion_frag:          '/assets/sounds/weapons/explosion_frag.ogg',
      explosion_vehicle:       '/assets/sounds/world/explosion_vehicle.ogg',
      vehicle_engine_car:      '/assets/sounds/vehicles/car_engine.ogg',
      vehicle_engine_boat:     '/assets/sounds/vehicles/boat_engine.ogg',
      water_splash:            '/assets/sounds/world/water_splash.ogg',
      parachute:               '/assets/sounds/world/parachute_open.ogg',
      land_hard:               '/assets/sounds/world/land_hard.ogg',
    };
    this.loadSounds(manifest);
  }

  async _loadReverb() {
    try {
      const response   = await fetch('/assets/sounds/impulse/outdoor_large.wav');
      const arrayBuf   = await response.arrayBuffer();
      const irBuffer   = await this.ctx.decodeAudioData(arrayBuf);
      const convolver  = this.ctx.createConvolver();
      convolver.buffer = irBuffer;
      const reverbGain = this._createGain(0.15);
      convolver.connect(reverbGain);
      reverbGain.connect(this._sfxGain);
      this._reverb = convolver;
    } catch (_) {
      this._reverb = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────────────────────

  _createGain(value) {
    const gain = this.ctx.createGain();
    gain.gain.value = value;
    gain.connect(this._masterGain);
    return gain;
  }

  _getChannelGain(channel) {
    switch (channel) {
      case 'music':  return this._musicGain;
      case 'voice':  return this._voiceGain;
      case 'ui':     return this._uiGain;
      default:       return this._sfxGain;
    }
  }

  _queuePlay2D(soundId, opts) {
    // Retry once the buffer is loaded
    const check = setInterval(() => {
      if (this._buffers.has(soundId)) {
        clearInterval(check);
        this.play2D(soundId, opts);
      }
    }, 100);
    setTimeout(() => clearInterval(check), 5000);
  }

  dispose() {
    for (const src of this._activeSources) {
      try { src.stop(); src.disconnect(); } catch (_) {}
    }
    this._activeSources.clear();
    this.ctx.close();
  }
}
