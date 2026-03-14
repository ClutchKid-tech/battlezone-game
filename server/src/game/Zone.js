'use strict';

// Safe zone shrinks through distinct stages.
// Each stage defines: duration (ms), final radius fraction, damage/sec
const ZONE_STAGES = [
  { duration: 120_000, radiusFraction: 0.80, damagePerSec: 1  },   // Stage 1
  { duration: 90_000,  radiusFraction: 0.55, damagePerSec: 2  },   // Stage 2
  { duration: 75_000,  radiusFraction: 0.35, damagePerSec: 4  },   // Stage 3
  { duration: 60_000,  radiusFraction: 0.20, damagePerSec: 6  },   // Stage 4
  { duration: 45_000,  radiusFraction: 0.10, damagePerSec: 10 },   // Stage 5
  { duration: 30_000,  radiusFraction: 0.04, damagePerSec: 15 },   // Stage 6
  { duration: 20_000,  radiusFraction: 0.01, damagePerSec: 25 },   // Stage 7
];

// Time before zone starts shrinking at each stage (hold period before shrink)
const STAGE_HOLD_MS = 30_000;

class Zone {
  constructor(mapSize) {
    this.mapSize = mapSize;

    const half = mapSize / 2;
    this.currentCenter = { x: half, z: half };
    this.currentRadius = mapSize * 0.5;     // starts covering entire map

    this.nextCenter   = this.currentCenter;
    this.nextRadius   = this.currentRadius;

    this.stageIndex   = 0;
    this.phaseTime    = 0;        // elapsed ms in current phase
    this.phase        = 'hold';   // 'hold' | 'shrink'
    this.active       = false;
  }

  start() {
    this.active = true;
    this._advanceStage();
  }

  tick(dt) {
    if (!this.active) return;
    this.phaseTime += dt * 1000;

    const stage = ZONE_STAGES[this.stageIndex];
    if (!stage) return;

    if (this.phase === 'hold') {
      if (this.phaseTime >= STAGE_HOLD_MS) {
        this.phaseTime = 0;
        this.phase = 'shrink';
        // Compute next zone position
        this._computeNextZone(stage);
      }
    } else {
      // Lerp current → next
      const t = Math.min(1, this.phaseTime / stage.duration);
      this.currentCenter.x = lerp(this.currentCenter.x, this.nextCenter.x, t);
      this.currentCenter.z = lerp(this.currentCenter.z, this.nextCenter.z, t);
      this.currentRadius   = lerp(this.startRadius, this.nextRadius, t);

      if (t >= 1) {
        this.currentCenter = { ...this.nextCenter };
        this.currentRadius = this.nextRadius;
        this.stageIndex++;
        this.phaseTime = 0;
        this.phase = 'hold';
        if (this.stageIndex < ZONE_STAGES.length) {
          this._advanceStage();
        }
      }
    }
  }

  isInSafeZone(pos) {
    const dx = pos.x - this.currentCenter.x;
    const dz = pos.z - this.currentCenter.z;
    return Math.sqrt(dx * dx + dz * dz) <= this.currentRadius;
  }

  getDamagePerSecond() {
    const stage = ZONE_STAGES[Math.min(this.stageIndex, ZONE_STAGES.length - 1)];
    return stage ? stage.damagePerSec : 25;
  }

  getSnapshot() {
    const stage = ZONE_STAGES[this.stageIndex] || ZONE_STAGES[ZONE_STAGES.length - 1];
    return {
      currentCenter:  this.currentCenter,
      currentRadius:  this.currentRadius,
      nextCenter:     this.nextCenter,
      nextRadius:     this.nextRadius,
      phase:          this.phase,
      stageIndex:     this.stageIndex,
      phaseTimeMs:    this.phaseTime,
      phaseDurationMs: this.phase === 'hold' ? STAGE_HOLD_MS : stage.duration,
      damagePerSec:   this.getDamagePerSecond(),
    };
  }

  _advanceStage() {
    this.startRadius = this.currentRadius;
  }

  _computeNextZone(stage) {
    const nextR = (this.mapSize / 2) * stage.radiusFraction;
    // Pick a random point inside the current circle where the new smaller circle fits
    const maxOffset = Math.max(0, this.currentRadius - nextR);
    const angle  = Math.random() * Math.PI * 2;
    const offset = Math.random() * maxOffset;
    this.nextCenter = {
      x: this.currentCenter.x + Math.cos(angle) * offset,
      z: this.currentCenter.z + Math.sin(angle) * offset,
    };
    // Clamp to map bounds
    this.nextCenter.x = Math.max(nextR, Math.min(this.mapSize - nextR, this.nextCenter.x));
    this.nextCenter.z = Math.max(nextR, Math.min(this.mapSize - nextR, this.nextCenter.z));
    this.nextRadius   = nextR;
    this.startRadius  = this.currentRadius;
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }

module.exports = Zone;
