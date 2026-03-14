'use strict';

const MAX_WEIGHT = 60;  // kg-equivalent weight limit

class Inventory {
  constructor() {
    /** @type {Map<string, object>} itemId → item */
    this.items = new Map();
    this.weight = 0;

    // Equipment slots: 0=primary, 1=secondary, 2=melee, 3=throwable
    this.slots = [null, null, null, null];

    // Ammo reserves: ammoType → count
    this.ammoReserves = {};
  }

  addItem(item) {
    const w = item.weight || 0;
    if (this.weight + w > MAX_WEIGHT) return false;

    // Ammo stacks instead of occupying inventory slots
    if (item.type === 'ammo') {
      this.ammoReserves[item.ammoType] = (this.ammoReserves[item.ammoType] || 0) + item.quantity;
      return true;
    }

    this.items.set(item.id, item);
    this.weight += w;

    // Auto-equip weapons to first free slot
    if (item.type === 'weapon') {
      for (let s = 0; s < 2; s++) {
        if (!this.slots[s]) { this.slots[s] = { type: 'weapon', weaponId: item.weaponId, itemId: item.id }; break; }
      }
    }
    if (item.type === 'melee') {
      if (!this.slots[2]) this.slots[2] = { type: 'weapon', weaponId: item.weaponId, itemId: item.id };
    }
    if (item.type === 'throwable' && !this.slots[3]) {
      this.slots[3] = { type: 'throwable', subtype: item.subtype, itemId: item.id };
    }

    return true;
  }

  removeItem(itemId) {
    const item = this.items.get(itemId);
    if (!item) return null;
    this.items.delete(itemId);
    this.weight -= item.weight || 0;
    // Remove from slot if equipped
    for (let s = 0; s < this.slots.length; s++) {
      if (this.slots[s]?.itemId === itemId) this.slots[s] = null;
    }
    return item;
  }

  getItem(itemId) { return this.items.get(itemId) || null; }

  getSlot(slotIndex) { return this.slots[slotIndex] || null; }

  getAmmo(ammoType) { return this.ammoReserves[ammoType] || 0; }

  consumeAmmo(ammoType, count) {
    this.ammoReserves[ammoType] = Math.max(0, (this.ammoReserves[ammoType] || 0) - count);
  }

  serialize() {
    return {
      items:   [...this.items.values()],
      slots:   this.slots,
      ammo:    this.ammoReserves,
      weight:  this.weight,
    };
  }
}

module.exports = Inventory;
