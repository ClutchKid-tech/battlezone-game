'use strict';

const Inventory = require('../../src/game/Inventory');

function makeWeaponItem(overrides = {}) {
  return {
    id: 'item-ak47',
    type: 'weapon',
    weaponId: 'ak47',
    weight: 6,
    ...overrides,
  };
}

function makeConsumableItem(overrides = {}) {
  return {
    id: 'item-bandage-1',
    type: 'consumable',
    subtype: 'bandage',
    weight: 0.3,
    ...overrides,
  };
}

describe('Inventory', () => {
  let inv;

  beforeEach(() => {
    inv = new Inventory();
  });

  describe('constructor', () => {
    it('starts empty with 0 weight', () => {
      expect(inv.weight).toBe(0);
      expect(inv.items.size).toBe(0);
      expect(inv.slots).toEqual([null, null, null, null]);
      expect(inv.ammoReserves).toEqual({});
    });
  });

  describe('addItem()', () => {
    it('adds a weapon and updates weight', () => {
      const result = inv.addItem(makeWeaponItem());
      expect(result).toBe(true);
      expect(inv.weight).toBe(6);
      expect(inv.items.has('item-ak47')).toBe(true);
    });

    it('auto-equips first weapon to slot 0', () => {
      inv.addItem(makeWeaponItem());
      expect(inv.slots[0]).toMatchObject({ type: 'weapon', weaponId: 'ak47' });
    });

    it('auto-equips second weapon to slot 1', () => {
      inv.addItem(makeWeaponItem({ id: 'item-m416', weaponId: 'm416', weight: 5 }));
      inv.addItem(makeWeaponItem({ id: 'item-ak47', weaponId: 'ak47', weight: 6 }));
      expect(inv.slots[0]).toMatchObject({ weaponId: 'm416' });
      expect(inv.slots[1]).toMatchObject({ weaponId: 'ak47' });
    });

    it('does not auto-equip third weapon (slots 0 and 1 full)', () => {
      inv.addItem(makeWeaponItem({ id: 'w1', weaponId: 'm416', weight: 5 }));
      inv.addItem(makeWeaponItem({ id: 'w2', weaponId: 'ak47', weight: 6 }));
      const result = inv.addItem(makeWeaponItem({ id: 'w3', weaponId: 'scar_l', weight: 5 }));
      expect(result).toBe(true); // added to items but not to a slot
      expect(inv.slots[0]).toMatchObject({ weaponId: 'm416' });
      expect(inv.slots[1]).toMatchObject({ weaponId: 'ak47' });
    });

    it('auto-equips melee to slot 2', () => {
      inv.addItem({ id: 'item-pan', type: 'melee', weaponId: 'pan', weight: 3 });
      expect(inv.slots[2]).toMatchObject({ type: 'weapon', weaponId: 'pan' });
    });

    it('auto-equips throwable to slot 3', () => {
      inv.addItem({ id: 'item-frag', type: 'throwable', subtype: 'frag', weight: 1 });
      expect(inv.slots[3]).toMatchObject({ type: 'throwable', subtype: 'frag' });
    });

    it('returns false when weight limit exceeded', () => {
      // Fill close to limit
      for (let i = 0; i < 6; i++) {
        inv.addItem({ id: `heavy-${i}`, type: 'consumable', weight: 9 });
      }
      // 54kg used, 60kg limit
      const result = inv.addItem({ id: 'too-heavy', type: 'consumable', weight: 7 });
      expect(result).toBe(false);
    });

    it('stacks ammo without occupying an inventory slot', () => {
      inv.addItem({ id: 'ammo1', type: 'ammo', ammoType: '5.56mm', quantity: 90, weight: 0 });
      inv.addItem({ id: 'ammo2', type: 'ammo', ammoType: '5.56mm', quantity: 60, weight: 0 });
      expect(inv.ammoReserves['5.56mm']).toBe(150);
      expect(inv.items.has('ammo1')).toBe(false); // ammo doesn't go into items map
    });

    it('stacks different ammo types separately', () => {
      inv.addItem({ id: 'a1', type: 'ammo', ammoType: '9mm', quantity: 90, weight: 0 });
      inv.addItem({ id: 'a2', type: 'ammo', ammoType: '7.62mm', quantity: 60, weight: 0 });
      expect(inv.ammoReserves['9mm']).toBe(90);
      expect(inv.ammoReserves['7.62mm']).toBe(60);
    });
  });

  describe('removeItem()', () => {
    it('removes an item and updates weight', () => {
      inv.addItem(makeWeaponItem());
      const removed = inv.removeItem('item-ak47');
      expect(removed).toMatchObject({ id: 'item-ak47' });
      expect(inv.weight).toBe(0);
      expect(inv.items.has('item-ak47')).toBe(false);
    });

    it('returns null for non-existent item', () => {
      expect(inv.removeItem('ghost-item')).toBeNull();
    });

    it('clears equipped slot when item is removed', () => {
      inv.addItem(makeWeaponItem());
      expect(inv.slots[0]).not.toBeNull();
      inv.removeItem('item-ak47');
      expect(inv.slots[0]).toBeNull();
    });
  });

  describe('getItem()', () => {
    it('returns the item for a valid id', () => {
      inv.addItem(makeConsumableItem());
      expect(inv.getItem('item-bandage-1')).toMatchObject({ id: 'item-bandage-1' });
    });

    it('returns null for missing item', () => {
      expect(inv.getItem('nope')).toBeNull();
    });
  });

  describe('getSlot()', () => {
    it('returns null for empty slot', () => {
      expect(inv.getSlot(0)).toBeNull();
    });

    it('returns equipped item', () => {
      inv.addItem(makeWeaponItem());
      expect(inv.getSlot(0)).toMatchObject({ type: 'weapon', weaponId: 'ak47' });
    });
  });

  describe('getAmmo() / consumeAmmo()', () => {
    it('returns 0 for unknown ammo type', () => {
      expect(inv.getAmmo('9mm')).toBe(0);
    });

    it('returns correct ammo count after add', () => {
      inv.addItem({ id: 'a1', type: 'ammo', ammoType: '9mm', quantity: 60, weight: 0 });
      expect(inv.getAmmo('9mm')).toBe(60);
    });

    it('consumeAmmo reduces reserve', () => {
      inv.addItem({ id: 'a1', type: 'ammo', ammoType: '9mm', quantity: 60, weight: 0 });
      inv.consumeAmmo('9mm', 30);
      expect(inv.getAmmo('9mm')).toBe(30);
    });

    it('consumeAmmo does not go below 0', () => {
      inv.addItem({ id: 'a1', type: 'ammo', ammoType: '9mm', quantity: 10, weight: 0 });
      inv.consumeAmmo('9mm', 50);
      expect(inv.getAmmo('9mm')).toBe(0);
    });
  });

  describe('serialize()', () => {
    it('returns all expected fields', () => {
      const s = inv.serialize();
      expect(s).toHaveProperty('items');
      expect(s).toHaveProperty('slots');
      expect(s).toHaveProperty('ammo');
      expect(s).toHaveProperty('weight');
    });

    it('items is an array', () => {
      inv.addItem(makeConsumableItem());
      const s = inv.serialize();
      expect(Array.isArray(s.items)).toBe(true);
      expect(s.items.length).toBe(1);
    });
  });
});
