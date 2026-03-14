'use strict';

const WeaponRegistry = require('../../src/game/WeaponRegistry');

describe('WeaponRegistry', () => {
  describe('get()', () => {
    it('returns the weapon for a valid id', () => {
      const w = WeaponRegistry.get('ak47');
      expect(w).not.toBeNull();
      expect(w.id).toBe('ak47');
      expect(w.name).toBe('AK-47');
    });

    it('returns null for an unknown id', () => {
      expect(WeaponRegistry.get('nonexistent_weapon_xyz')).toBeNull();
    });

    it('returns the same frozen object on repeated calls', () => {
      const w1 = WeaponRegistry.get('m416');
      const w2 = WeaponRegistry.get('m416');
      expect(w1).toBe(w2);
      expect(Object.isFrozen(w1)).toBe(true);
    });
  });

  describe('getAll()', () => {
    it('returns an array of weapons', () => {
      const all = WeaponRegistry.getAll();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThanOrEqual(20);
    });

    it('all weapons have required fields', () => {
      for (const w of WeaponRegistry.getAll()) {
        expect(w).toHaveProperty('id');
        expect(w).toHaveProperty('name');
        expect(w).toHaveProperty('category');
        expect(w).toHaveProperty('damage');
        expect(w).toHaveProperty('rarity');
        expect(w).toHaveProperty('weight');
        expect(w).toHaveProperty('attachmentSlots');
      }
    });

    it('all weapon ids are unique', () => {
      const all = WeaponRegistry.getAll();
      const ids = all.map(w => w.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  describe('has()', () => {
    it('returns true for known weapons', () => {
      expect(WeaponRegistry.has('awm')).toBe(true);
      expect(WeaponRegistry.has('mp5')).toBe(true);
      expect(WeaponRegistry.has('pan')).toBe(true);
    });

    it('returns false for unknown weapons', () => {
      expect(WeaponRegistry.has('laser_sword')).toBe(false);
    });
  });

  describe('byCategory()', () => {
    it('returns only weapons of the requested category', () => {
      const pistols = WeaponRegistry.byCategory('Pistol');
      expect(pistols.length).toBeGreaterThanOrEqual(2);
      for (const w of pistols) {
        expect(w.category).toBe('Pistol');
      }
    });

    it('returns SMGs', () => {
      const smgs = WeaponRegistry.byCategory('SMG');
      expect(smgs.length).toBeGreaterThanOrEqual(3);
    });

    it('returns ARs', () => {
      const ars = WeaponRegistry.byCategory('AR');
      expect(ars.length).toBeGreaterThanOrEqual(4);
    });

    it('returns Snipers', () => {
      expect(WeaponRegistry.byCategory('Sniper').length).toBeGreaterThanOrEqual(3);
    });

    it('returns Shotguns', () => {
      expect(WeaponRegistry.byCategory('Shotgun').length).toBeGreaterThanOrEqual(2);
    });

    it('returns LMGs', () => {
      expect(WeaponRegistry.byCategory('LMG').length).toBeGreaterThanOrEqual(2);
    });

    it('returns Throwables', () => {
      expect(WeaponRegistry.byCategory('Throwable').length).toBeGreaterThanOrEqual(4);
    });

    it('returns empty array for unknown category', () => {
      expect(WeaponRegistry.byCategory('Rocket')).toEqual([]);
    });
  });

  describe('byRarity()', () => {
    it('returns weapons of requested rarity', () => {
      const legendaries = WeaponRegistry.byRarity('legendary');
      expect(legendaries.length).toBeGreaterThanOrEqual(1);
      for (const w of legendaries) {
        expect(w.rarity).toBe('legendary');
      }
    });

    it('AWM is legendary', () => {
      const awm = WeaponRegistry.get('awm');
      expect(awm.rarity).toBe('legendary');
    });

    it('M416 is common', () => {
      const m416 = WeaponRegistry.get('m416');
      expect(m416.rarity).toBe('common');
    });

    it('returns empty array for unknown rarity', () => {
      expect(WeaponRegistry.byRarity('mythic')).toEqual([]);
    });
  });

  describe('weapon stats integrity', () => {
    it('AWM has highest damage among snipers', () => {
      const snipers = WeaponRegistry.byCategory('Sniper');
      const awm = WeaponRegistry.get('awm');
      const maxDmg = Math.max(...snipers.map(s => s.damage));
      expect(awm.damage).toBe(maxDmg);
    });

    it('all firearms have positive rateOfFire', () => {
      const firearms = WeaponRegistry.getAll().filter(w =>
        ['Pistol', 'SMG', 'AR', 'Sniper', 'Shotgun', 'LMG'].includes(w.category)
      );
      for (const w of firearms) {
        expect(w.rateOfFire).toBeGreaterThan(0);
      }
    });

    it('all firearms have positive magazineSize', () => {
      const firearms = WeaponRegistry.getAll().filter(w =>
        ['Pistol', 'SMG', 'AR', 'Sniper', 'Shotgun', 'LMG'].includes(w.category)
      );
      for (const w of firearms) {
        expect(w.magazineSize).toBeGreaterThan(0);
      }
    });

    it('shotguns have pellet count > 1', () => {
      const shotguns = WeaponRegistry.byCategory('Shotgun');
      for (const w of shotguns) {
        expect(w.pellets).toBeGreaterThan(1);
      }
    });

    it('frag grenade has fuseTime property', () => {
      const frag = WeaponRegistry.get('frag');
      expect(frag).not.toBeNull();
      expect(frag.fuseTime).toBe(4.0);
    });

    it('smoke grenade has smokeDuration property', () => {
      const smoke = WeaponRegistry.get('smoke');
      expect(smoke.smokeDuration).toBe(30_000);
    });

    it('molotov has burnDps property', () => {
      const molotov = WeaponRegistry.get('molotov');
      expect(molotov.burnDps).toBe(8);
    });
  });
});
