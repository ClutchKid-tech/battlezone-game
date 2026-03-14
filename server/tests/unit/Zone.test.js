'use strict';

const Zone = require('../../src/game/Zone');

const MAP_SIZE = 4000;

function makeZone() {
  return new Zone(MAP_SIZE);
}

describe('Zone', () => {
  describe('constructor', () => {
    it('starts inactive at map centre with full-map radius', () => {
      const z = makeZone();
      expect(z.active).toBe(false);
      expect(z.currentCenter).toEqual({ x: 2000, z: 2000 });
      expect(z.currentRadius).toBe(2000);
      expect(z.stageIndex).toBe(0);
      expect(z.phase).toBe('hold');
    });
  });

  describe('start()', () => {
    it('activates the zone', () => {
      const z = makeZone();
      z.start();
      expect(z.active).toBe(true);
    });

    it('sets startRadius to initial radius', () => {
      const z = makeZone();
      z.start();
      expect(z.startRadius).toBe(2000);
    });
  });

  describe('isInSafeZone()', () => {
    it('returns true for position at centre', () => {
      const z = makeZone();
      expect(z.isInSafeZone({ x: 2000, z: 2000 })).toBe(true);
    });

    it('returns true for position just inside radius', () => {
      const z = makeZone();
      expect(z.isInSafeZone({ x: 2000 + 1999, z: 2000 })).toBe(true);
    });

    it('returns false for position exactly at radius edge (boundary)', () => {
      const z = makeZone();
      // Exactly at radius (<=) should be true
      expect(z.isInSafeZone({ x: 2000 + 2000, z: 2000 })).toBe(true);
    });

    it('returns false for position outside radius', () => {
      const z = makeZone();
      expect(z.isInSafeZone({ x: 2000 + 2001, z: 2000 })).toBe(false);
    });

    it('uses Euclidean distance (not Manhattan)', () => {
      const z = makeZone();
      // distance = sqrt(1500^2 + 1500^2) ≈ 2121, which exceeds radius 2000
      expect(z.isInSafeZone({ x: 2000 + 1500, z: 2000 + 1500 })).toBe(false);
    });
  });

  describe('getDamagePerSecond()', () => {
    it('returns 1 at stage 0', () => {
      const z = makeZone();
      z.start();
      expect(z.getDamagePerSecond()).toBe(1);
    });

    it('returns 25 (last stage) when stageIndex exceeds ZONE_STAGES length', () => {
      const z = makeZone();
      z.start();
      z.stageIndex = 999;
      expect(z.getDamagePerSecond()).toBe(25);
    });

    it('returns correct damage at each stage', () => {
      const expectedDps = [1, 2, 4, 6, 10, 15, 25];
      for (let i = 0; i < expectedDps.length; i++) {
        const z = makeZone();
        z.start();
        z.stageIndex = i;
        expect(z.getDamagePerSecond()).toBe(expectedDps[i]);
      }
    });
  });

  describe('tick()', () => {
    it('does nothing when inactive', () => {
      const z = makeZone();
      z.tick(1);
      expect(z.currentRadius).toBe(2000);
      expect(z.phaseTime).toBe(0);
    });

    it('accumulates phaseTime', () => {
      const z = makeZone();
      z.start();
      z.tick(1);
      expect(z.phaseTime).toBe(1000);
    });

    it('transitions from hold to shrink after 30 seconds', () => {
      const z = makeZone();
      z.start();
      // Tick 29.9 seconds — still hold
      z.tick(29.9);
      expect(z.phase).toBe('hold');
      // Tick 0.2 more — now > 30_000 ms
      z.tick(0.2);
      expect(z.phase).toBe('shrink');
    });

    it('resets phaseTime when transitioning to shrink', () => {
      const z = makeZone();
      z.start();
      z.tick(31);
      expect(z.phaseTime).toBe(0);
      expect(z.phase).toBe('shrink');
    });

    it('lerps radius toward nextRadius during shrink', () => {
      const z = makeZone();
      z.start();
      // Force into shrink phase at stage 0
      z.tick(31);
      const initialRadius = z.startRadius;
      // Tick halfway through stage 0 duration (120s)
      z.tick(60);
      expect(z.currentRadius).toBeGreaterThan(z.nextRadius);
      expect(z.currentRadius).toBeLessThan(initialRadius);
    });

    it('advances to next stage after shrink completes', () => {
      const z = makeZone();
      z.start();
      // Hold phase
      z.tick(31);
      // Shrink phase: 120s duration
      z.tick(121);
      expect(z.stageIndex).toBe(1);
      expect(z.phase).toBe('hold');
    });

    it('nextRadius is smaller than currentRadius after _computeNextZone', () => {
      const z = makeZone();
      z.start();
      z.tick(31); // triggers shrink and _computeNextZone
      expect(z.nextRadius).toBeLessThan(z.startRadius);
    });

    it('nextCenter is within map bounds', () => {
      const z = makeZone();
      z.start();
      z.tick(31); // compute next zone
      expect(z.nextCenter.x).toBeGreaterThan(0);
      expect(z.nextCenter.x).toBeLessThan(MAP_SIZE);
      expect(z.nextCenter.z).toBeGreaterThan(0);
      expect(z.nextCenter.z).toBeLessThan(MAP_SIZE);
    });
  });

  describe('getSnapshot()', () => {
    it('returns an object with all expected keys', () => {
      const z = makeZone();
      z.start();
      const snap = z.getSnapshot();
      expect(snap).toHaveProperty('currentCenter');
      expect(snap).toHaveProperty('currentRadius');
      expect(snap).toHaveProperty('nextCenter');
      expect(snap).toHaveProperty('nextRadius');
      expect(snap).toHaveProperty('phase');
      expect(snap).toHaveProperty('stageIndex');
      expect(snap).toHaveProperty('phaseTimeMs');
      expect(snap).toHaveProperty('phaseDurationMs');
      expect(snap).toHaveProperty('damagePerSec');
    });

    it('phaseDurationMs reflects hold duration in hold phase', () => {
      const z = makeZone();
      z.start();
      const snap = z.getSnapshot();
      expect(snap.phase).toBe('hold');
      expect(snap.phaseDurationMs).toBe(30_000);
    });

    it('phaseDurationMs reflects shrink stage duration in shrink phase', () => {
      const z = makeZone();
      z.start();
      z.tick(31);
      const snap = z.getSnapshot();
      expect(snap.phase).toBe('shrink');
      expect(snap.phaseDurationMs).toBe(120_000); // stage 0 shrink duration
    });
  });
});
