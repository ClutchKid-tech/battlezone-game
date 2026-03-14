'use strict';

const AntiCheat = require('../../src/game/AntiCheat');

function makePlayer(id = 'p1') {
  return {
    id,
    position: { x: 100, y: 0, z: 100 },
    _lastShotAt: null,
  };
}

const MOCK_WEAPON = {
  id: 'ak47',
  rateOfFire: 10, // 100ms interval
};

describe('AntiCheat', () => {
  let ac;

  beforeEach(() => {
    ac = new AntiCheat();
  });

  describe('validateMove()', () => {
    it('returns missing_position if data is null', () => {
      const p = makePlayer();
      expect(ac.validateMove(p, null)).toBe('missing_position');
    });

    it('returns missing_position if position field is absent', () => {
      const p = makePlayer();
      expect(ac.validateMove(p, {})).toBe('missing_position');
    });

    it('returns null for valid small movement', () => {
      const p = makePlayer();
      const data = { position: { x: 100.5, y: 0, z: 100.5 } };
      expect(ac.validateMove(p, data)).toBeNull();
    });

    it('returns null for very small movement (below threshold)', () => {
      const p = makePlayer();
      const data = { position: { x: 100.05, y: 0, z: 100.05 } };
      expect(ac.validateMove(p, data)).toBeNull();
    });

    it('detects speedhack for large horizontal movement', () => {
      const p = makePlayer();
      // MAX_MOVE_PER_TICK_SQ * 400 = (1.2^2) * 400 = 576, sqrt ≈ 24m threshold
      const data = { position: { x: 100 + 200, y: 0, z: 100 } }; // 200m horizontal jump
      const result = ac.validateMove(p, data);
      expect(result).toMatch(/speedhack/);
    });

    it('records violation on speedhack', () => {
      const p = makePlayer();
      const data = { position: { x: 100 + 200, y: 0, z: 100 } };
      ac.validateMove(p, data);
      const v = ac.getViolations(p.id);
      expect(v.speedhack).toBe(1);
    });

    it('allows large Y movement (vertical fall)', () => {
      const p = makePlayer();
      // Large Y delta (falling from tall building) but no horizontal movement
      const data = { position: { x: 100, y: -50, z: 100 } };
      expect(ac.validateMove(p, data)).toBeNull();
    });
  });

  describe('validateShot()', () => {
    it('returns missing_shot_data if data is null', () => {
      const p = makePlayer();
      expect(ac.validateShot(p, null, MOCK_WEAPON)).toBe('missing_shot_data');
    });

    it('returns missing_shot_data if origin is absent', () => {
      const p = makePlayer();
      expect(ac.validateShot(p, { direction: { x: 0, y: 0, z: 1 } }, MOCK_WEAPON))
        .toBe('missing_shot_data');
    });

    it('returns null for a valid shot', () => {
      const p = makePlayer();
      const data = {
        origin: { x: 101, y: 1.7, z: 100 },
        direction: { x: 0, y: 0, z: 1 },
      };
      expect(ac.validateShot(p, data, MOCK_WEAPON)).toBeNull();
    });

    it('detects shot origin too far from player', () => {
      const p = makePlayer();
      const data = {
        origin: { x: 200, y: 0, z: 200 }, // 141m away
        direction: { x: 0, y: 0, z: 1 },
      };
      const result = ac.validateShot(p, data, MOCK_WEAPON);
      expect(result).toMatch(/shot origin/);
    });

    it('records shot_origin violation', () => {
      const p = makePlayer();
      const data = {
        origin: { x: 200, y: 0, z: 200 },
        direction: { x: 0, y: 0, z: 1 },
      };
      ac.validateShot(p, data, MOCK_WEAPON);
      expect(ac.getViolations(p.id).shot_origin).toBe(1);
    });

    it('detects rapid fire', () => {
      const p = makePlayer();
      p._lastShotAt = Date.now() - 10; // 10ms ago, min interval = 100ms/1.5 ≈ 67ms
      const data = {
        origin: { x: 100, y: 0, z: 100 },
        direction: { x: 0, y: 0, z: 1 },
      };
      const result = ac.validateShot(p, data, MOCK_WEAPON);
      expect(result).toMatch(/rapid_fire/);
    });

    it('records rapid_fire violation', () => {
      const p = makePlayer();
      p._lastShotAt = Date.now() - 10;
      const data = {
        origin: { x: 100, y: 0, z: 100 },
        direction: { x: 0, y: 0, z: 1 },
      };
      ac.validateShot(p, data, MOCK_WEAPON);
      expect(ac.getViolations(p.id).rapid_fire).toBe(1);
    });

    it('rejects non-unit direction vector', () => {
      const p = makePlayer();
      const data = {
        origin: { x: 100, y: 0, z: 100 },
        direction: { x: 5, y: 5, z: 5 }, // magnitude >> 1
      };
      const result = ac.validateShot(p, data, MOCK_WEAPON);
      expect(result).toBe('invalid_direction_vector');
    });

    it('accepts direction vector within 0.1 tolerance', () => {
      const p = makePlayer();
      const data = {
        origin: { x: 100, y: 0, z: 100 },
        direction: { x: 0.05, y: 0, z: 0.999 }, // nearly unit
      };
      // magnitude ≈ 1.0012, within 0.1 tolerance
      expect(ac.validateShot(p, data, MOCK_WEAPON)).toBeNull();
    });
  });

  describe('getViolations()', () => {
    it('returns zero violations for new player', () => {
      const v = ac.getViolations('unknown-player');
      expect(v).toEqual({ speedhack: 0, shot_origin: 0, rapid_fire: 0 });
    });

    it('accumulates violations correctly', () => {
      const p = makePlayer();
      // Trigger 3 speedhacks
      for (let i = 0; i < 3; i++) {
        ac.validateMove(p, { position: { x: 100 + 500, y: 0, z: 100 } });
      }
      expect(ac.getViolations(p.id).speedhack).toBe(3);
    });
  });

  describe('isBanned()', () => {
    it('returns false for clean player', () => {
      expect(ac.isBanned('p1')).toBe(false);
    });

    it('bans player after 6+ speedhack violations', () => {
      const p = makePlayer();
      for (let i = 0; i < 6; i++) {
        ac.validateMove(p, { position: { x: 100 + 500, y: 0, z: 100 } });
      }
      expect(ac.isBanned(p.id)).toBe(true);
    });

    it('bans player after 11+ shot_origin violations', () => {
      const p = makePlayer();
      for (let i = 0; i < 11; i++) {
        ac.validateShot(p, { origin: { x: 500, y: 0, z: 500 }, direction: { x: 0, y: 0, z: 1 } }, MOCK_WEAPON);
      }
      expect(ac.isBanned(p.id)).toBe(true);
    });

    it('bans player after 21+ rapid_fire violations', () => {
      const p = makePlayer();
      for (let i = 0; i < 21; i++) {
        p._lastShotAt = Date.now() - 10;
        ac.validateShot(p, { origin: { x: 100, y: 0, z: 100 }, direction: { x: 0, y: 0, z: 1 } }, MOCK_WEAPON);
      }
      expect(ac.isBanned(p.id)).toBe(true);
    });

    it('does not ban at threshold (5 speedhacks)', () => {
      const p = makePlayer();
      for (let i = 0; i < 5; i++) {
        ac.validateMove(p, { position: { x: 100 + 500, y: 0, z: 100 } });
      }
      expect(ac.isBanned(p.id)).toBe(false);
    });
  });
});
