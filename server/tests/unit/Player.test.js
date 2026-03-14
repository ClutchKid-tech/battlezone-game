'use strict';

jest.mock('../../src/game/WeaponRegistry', () => ({
  get: jest.fn(),
}));

const Player = require('../../src/game/Player');
const WeaponRegistry = require('../../src/game/WeaponRegistry');

function makePlayer(id = 'u1', username = 'TestUser') {
  const p = new Player(id, username, null);
  p.spawn({ x: 100, z: 100, y: 0 });
  return p;
}

const MOCK_WEAPON = {
  id: 'ak47',
  weaponId: 'ak47',
  rateOfFire: 10,
  magazineSize: 30,
  reloadTime: 2.6,
  damage: 48,
};

describe('Player', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('starts with full health, 0 armor, not alive', () => {
      const p = new Player('u1', 'Alice', null);
      expect(p.health).toBe(100);
      expect(p.armor).toBe(0);
      expect(p.alive).toBe(false);
    });

    it('assigns squadId', () => {
      const p = new Player('u1', 'Alice', 'squad-1');
      expect(p.squadId).toBe('squad-1');
    });
  });

  describe('spawn()', () => {
    it('sets alive to true and restores health', () => {
      const p = new Player('u1', 'Alice', null);
      p.spawn({ x: 50, y: 0, z: 50 });
      expect(p.alive).toBe(true);
      expect(p.health).toBe(100);
    });

    it('copies position', () => {
      const p = new Player('u1', 'Alice', null);
      p.spawn({ x: 10, y: 5, z: 20 });
      expect(p.position).toEqual({ x: 10, y: 5, z: 20 });
    });
  });

  describe('applyDamage()', () => {
    it('returns 0 if player is not alive', () => {
      const p = new Player('u1', 'Alice', null);
      expect(p.applyDamage(50, 'body')).toBe(0);
    });

    it('deals full damage to body when no armor', () => {
      const p = makePlayer();
      const dmg = p.applyDamage(30, 'body');
      expect(dmg).toBe(30);
      expect(p.health).toBe(70);
    });

    it('armor absorbs up to 50% of body damage', () => {
      const p = makePlayer();
      p.armor = 100;
      const dmg = p.applyDamage(40, 'body');
      // absorbed = min(40*0.5, 100) = 20, effective = 20
      expect(dmg).toBe(20);
      expect(p.health).toBe(80);
      expect(p.armor).toBe(80);
    });

    it('armor cannot absorb more than it has', () => {
      const p = makePlayer();
      p.armor = 10;
      const dmg = p.applyDamage(40, 'body');
      // absorbed = min(40*0.5=20, 10) = 10, effective = 30
      expect(dmg).toBe(30);
      expect(p.armor).toBe(0);
      expect(p.health).toBe(70);
    });

    it('headshots multiply damage by 1.5 and ignore armor', () => {
      const p = makePlayer();
      p.armor = 100;
      const dmg = p.applyDamage(40, 'head');
      // 40 * 1.5 = 60, armor not involved
      expect(dmg).toBe(60);
      expect(p.health).toBe(40);
      expect(p.armor).toBe(100); // unchanged
    });

    it('damage is capped at remaining health', () => {
      const p = makePlayer();
      p.health = 20;
      const dmg = p.applyDamage(100, 'body');
      expect(dmg).toBe(20);
      expect(p.health).toBe(0);
    });

    it('does not reduce health below 0', () => {
      const p = makePlayer();
      p.applyDamage(200, 'body');
      expect(p.health).toBeGreaterThanOrEqual(0);
    });
  });

  describe('canShoot()', () => {
    it('returns false when no equipped weapon', () => {
      WeaponRegistry.get.mockReturnValue(null);
      const p = makePlayer();
      // inventory slot 0 has no item by default
      expect(p.canShoot()).toBe(false);
    });

    it('returns false when reloading', () => {
      WeaponRegistry.get.mockReturnValue(MOCK_WEAPON);
      const p = makePlayer();
      p.isReloading = true;
      // Give a weapon in slot 0
      p.inventory.slots[0] = { type: 'weapon', weaponId: 'ak47', itemId: 'item1' };
      expect(p.canShoot()).toBe(false);
    });

    it('returns false when magazine is empty', () => {
      WeaponRegistry.get.mockReturnValue(MOCK_WEAPON);
      const p = makePlayer();
      p.inventory.slots[0] = { type: 'weapon', weaponId: 'ak47', itemId: 'item1' };
      p.currentMag['ak47'] = 0;
      expect(p.canShoot()).toBe(false);
    });

    it('returns true when no previous shot', () => {
      WeaponRegistry.get.mockReturnValue(MOCK_WEAPON);
      const p = makePlayer();
      p.inventory.slots[0] = { type: 'weapon', weaponId: 'ak47', itemId: 'item1' };
      p.currentMag['ak47'] = 30;
      expect(p.canShoot()).toBe(true);
    });

    it('returns false when shooting too fast (rate-of-fire cooldown)', () => {
      WeaponRegistry.get.mockReturnValue(MOCK_WEAPON);
      const p = makePlayer();
      p.inventory.slots[0] = { type: 'weapon', weaponId: 'ak47', itemId: 'item1' };
      p.currentMag['ak47'] = 30;
      p._lastShotAt = Date.now(); // just shot
      expect(p.canShoot()).toBe(false);
    });

    it('returns true after cooldown elapsed', () => {
      WeaponRegistry.get.mockReturnValue(MOCK_WEAPON);
      const p = makePlayer();
      p.inventory.slots[0] = { type: 'weapon', weaponId: 'ak47', itemId: 'item1' };
      p.currentMag['ak47'] = 30;
      p._lastShotAt = Date.now() - 200; // 200ms ago, cooldown = 1000/10 = 100ms
      expect(p.canShoot()).toBe(true);
    });
  });

  describe('recordShot()', () => {
    it('increments shots counter', () => {
      WeaponRegistry.get.mockReturnValue(MOCK_WEAPON);
      const p = makePlayer();
      p.inventory.slots[0] = { type: 'weapon', weaponId: 'ak47', itemId: 'item1' };
      p.currentMag['ak47'] = 30;
      p.recordShot();
      expect(p.shots).toBe(1);
    });

    it('decrements magazine', () => {
      WeaponRegistry.get.mockReturnValue(MOCK_WEAPON);
      const p = makePlayer();
      p.inventory.slots[0] = { type: 'weapon', weaponId: 'ak47', itemId: 'item1' };
      p.currentMag['ak47'] = 30;
      p.recordShot();
      expect(p.currentMag['ak47']).toBe(29);
    });
  });

  describe('startReload() / cancelReload()', () => {
    it('sets isReloading to true and calls onComplete after reloadTime', async () => {
      const p = makePlayer();
      const onComplete = jest.fn();
      p.startReload({ reloadTime: 0.01 }, onComplete);
      expect(p.isReloading).toBe(true);
      await new Promise(r => setTimeout(r, 20));
      expect(onComplete).toHaveBeenCalled();
      expect(p.isReloading).toBe(false);
    });

    it('does not start a second reload if already reloading', () => {
      const p = makePlayer();
      const onComplete = jest.fn();
      p.startReload({ reloadTime: 10 }, onComplete);
      p.startReload({ reloadTime: 10 }, onComplete); // second call ignored
      clearTimeout(p._reloadTimer);
      p.isReloading = false;
    });

    it('cancelReload clears the timer and sets isReloading to false', () => {
      const p = makePlayer();
      const onComplete = jest.fn();
      p.startReload({ reloadTime: 10 }, onComplete);
      p.cancelReload();
      expect(p.isReloading).toBe(false);
    });
  });

  describe('useConsumable()', () => {
    it('returns false if already using an item', () => {
      const p = makePlayer();
      p._useTimer = setTimeout(() => {}, 10000);
      const result = p.useConsumable({ useTime: 1, subtype: 'bandage' }, jest.fn());
      expect(result).toBe(false);
      clearTimeout(p._useTimer);
    });

    it('bandage restores 15 HP after useTime', async () => {
      const p = makePlayer();
      p.health = 50;
      await new Promise(resolve => {
        p.useConsumable({ useTime: 0.01, subtype: 'bandage' }, resolve);
      });
      expect(p.health).toBe(65);
    });

    it('medkit restores to full health', async () => {
      const p = makePlayer();
      p.health = 20;
      await new Promise(resolve => {
        p.useConsumable({ useTime: 0.01, subtype: 'medkit' }, resolve);
      });
      expect(p.health).toBe(100);
    });

    it('energy_drink restores 25 HP', async () => {
      const p = makePlayer();
      p.health = 50;
      await new Promise(resolve => {
        p.useConsumable({ useTime: 0.01, subtype: 'energy_drink' }, resolve);
      });
      expect(p.health).toBe(75);
    });

    it('adrenaline restores full HP and full armor', async () => {
      const p = makePlayer();
      p.health = 30;
      p.armor = 10;
      await new Promise(resolve => {
        p.useConsumable({ useTime: 0.01, subtype: 'adrenaline' }, resolve);
      });
      expect(p.health).toBe(100);
      expect(p.armor).toBe(100);
    });

    it('armor_shard adds 25 armor (capped at 100)', async () => {
      const p = makePlayer();
      p.armor = 80;
      await new Promise(resolve => {
        p.useConsumable({ useTime: 0.01, subtype: 'armor_shard' }, resolve);
      });
      expect(p.armor).toBe(100);
    });

    it('armor_vest restores full armor', async () => {
      const p = makePlayer();
      p.armor = 0;
      await new Promise(resolve => {
        p.useConsumable({ useTime: 0.01, subtype: 'armor_vest' }, resolve);
      });
      expect(p.armor).toBe(100);
    });

    it('bandage does not exceed 100 HP', async () => {
      const p = makePlayer();
      p.health = 95;
      await new Promise(resolve => {
        p.useConsumable({ useTime: 0.01, subtype: 'bandage' }, resolve);
      });
      expect(p.health).toBe(100);
    });

    it('calls onComplete callback', async () => {
      const p = makePlayer();
      const onComplete = jest.fn();
      await new Promise(resolve => {
        p.useConsumable({ useTime: 0.01, subtype: 'bandage' }, () => {
          onComplete();
          resolve();
        });
      });
      expect(onComplete).toHaveBeenCalled();
    });
  });

  describe('serialize()', () => {
    it('returns expected keys', () => {
      WeaponRegistry.get.mockReturnValue(null);
      const p = makePlayer();
      const s = p.serialize();
      expect(s).toHaveProperty('id');
      expect(s).toHaveProperty('username');
      expect(s).toHaveProperty('position');
      expect(s).toHaveProperty('health');
      expect(s).toHaveProperty('armor');
      expect(s).toHaveProperty('alive');
      expect(s).toHaveProperty('kills');
      expect(s).toHaveProperty('inventory');
    });
  });
});
