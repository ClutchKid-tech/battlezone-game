'use strict';

const { v4: uuidv4 } = require('uuid');
const WeaponRegistry = require('./WeaponRegistry');

// Spawn density: items per km²
const ITEMS_PER_KM2 = 40;

// Loot table: [itemSpec, relativeWeight]
const LOOT_TABLE = [
  // Weapons
  { type: 'weapon', weaponId: 'm416',      rarity: 'common',    weight: 8  },
  { type: 'weapon', weaponId: 'ak47',      rarity: 'common',    weight: 8  },
  { type: 'weapon', weaponId: 'p2000',     rarity: 'common',    weight: 10 },
  { type: 'weapon', weaponId: 'mp5',       rarity: 'common',    weight: 8  },
  { type: 'weapon', weaponId: 'dpump',     rarity: 'common',    weight: 6  },
  { type: 'weapon', weaponId: 'pp19',      rarity: 'uncommon',  weight: 5  },
  { type: 'weapon', weaponId: 'scar_l',    rarity: 'uncommon',  weight: 5  },
  { type: 'weapon', weaponId: 'vector',    rarity: 'uncommon',  weight: 5  },
  { type: 'weapon', weaponId: 'kar98',     rarity: 'uncommon',  weight: 4  },
  { type: 'weapon', weaponId: 'dp28',      rarity: 'uncommon',  weight: 4  },
  { type: 'weapon', weaponId: 's12k',      rarity: 'uncommon',  weight: 4  },
  { type: 'weapon', weaponId: 'aug',       rarity: 'rare',      weight: 3  },
  { type: 'weapon', weaponId: 'mk14',      rarity: 'rare',      weight: 2  },
  { type: 'weapon', weaponId: 'deagle',    rarity: 'rare',      weight: 2  },
  { type: 'weapon', weaponId: 'origin_12', rarity: 'rare',      weight: 2  },
  { type: 'weapon', weaponId: 'm249',      rarity: 'epic',      weight: 1  },
  { type: 'weapon', weaponId: 'awm',       rarity: 'legendary', weight: 0.3},

  // Ammo
  { type: 'ammo', ammoType: '9mm',     quantity: 60,  weight: 15 },
  { type: 'ammo', ammoType: '5.56mm',  quantity: 30,  weight: 15 },
  { type: 'ammo', ammoType: '7.62mm',  quantity: 20,  weight: 10 },
  { type: 'ammo', ammoType: '12gauge', quantity: 20,  weight: 8  },
  { type: 'ammo', ammoType: '.45acp',  quantity: 50,  weight: 10 },
  { type: 'ammo', ammoType: '.50ae',   quantity: 14,  weight: 5  },
  { type: 'ammo', ammoType: '.300mag', quantity: 10,  weight: 2  },

  // Armour
  { type: 'consumable', subtype: 'armor_shard', healAmount: 25, useTime: 2.5, weight: 6 },
  { type: 'consumable', subtype: 'armor_vest',  healAmount: 100, useTime: 5.0, weight: 5 },

  // Healing
  { type: 'consumable', subtype: 'bandage',      healAmount: 15, useTime: 4.0,  weight: 18 },
  { type: 'consumable', subtype: 'medkit',        healAmount: 100,useTime: 8.0,  weight: 6  },
  { type: 'consumable', subtype: 'energy_drink',  healAmount: 25, useTime: 3.0,  weight: 8  },
  { type: 'consumable', subtype: 'adrenaline',    healAmount: 999,useTime: 10.0, weight: 2  },

  // Throwables
  { type: 'throwable', subtype: 'frag',      weight: 6  },
  { type: 'throwable', subtype: 'smoke',     weight: 8  },
  { type: 'throwable', subtype: 'flashbang', weight: 5  },
  { type: 'throwable', subtype: 'molotov',   weight: 4  },

  // Melee
  { type: 'melee', weaponId: 'pan', weight: 3 },

  // Attachments
  { type: 'attachment', subtype: 'red_dot',     slot: 'scope',      weight: 10 },
  { type: 'attachment', subtype: 'holo',        slot: 'scope',      weight: 8  },
  { type: 'attachment', subtype: 'acog_4x',     slot: 'scope',      weight: 6  },
  { type: 'attachment', subtype: 'scope_8x',    slot: 'scope',      weight: 3  },
  { type: 'attachment', subtype: 'scope_15x',   slot: 'scope',      weight: 1  },
  { type: 'attachment', subtype: 'suppressor',  slot: 'suppressor', weight: 8  },
  { type: 'attachment', subtype: 'vertical_grip',slot: 'grip',      weight: 8  },
  { type: 'attachment', subtype: 'angled_grip', slot: 'grip',       weight: 6  },
  { type: 'attachment', subtype: 'ext_mag',     slot: 'mag',        weight: 8  },
  { type: 'attachment', subtype: 'cheek_pad',   slot: 'stock',      weight: 6  },
];

const TOTAL_WEIGHT = LOOT_TABLE.reduce((s, e) => s + e.weight, 0);

class LootSystem {
  constructor(mapSize) {
    this.mapSize = mapSize;
    /** @type {Map<string, object>} lootId → { id, ...item, position } */
    this.items = new Map();
  }

  spawnInitialLoot() {
    const mapKm2 = (this.mapSize / 1000) ** 2;
    const count  = Math.floor(ITEMS_PER_KM2 * mapKm2);
    for (let i = 0; i < count; i++) {
      const template = this._rollLootTable();
      const item     = this._buildItem(template);
      const pos      = this._randomMapPosition();
      this.spawnItem(item, pos);
    }
    console.log(`[LootSystem] Spawned ${this.items.size} initial items`);
  }

  spawnItem(item, position) {
    const lootId = item.lootId || uuidv4();
    this.items.set(lootId, { ...item, id: item.id || uuidv4(), lootId, position });
    return lootId;
  }

  removeItem(lootId) {
    return this.items.delete(lootId);
  }

  getItem(lootId) { return this.items.get(lootId) || null; }

  getSnapshot() {
    return [...this.items.values()].map(({ lootId, position, type, subtype, weaponId, ammoType, quantity, rarity }) => ({
      lootId, position, type, subtype, weaponId, ammoType, quantity, rarity,
    }));
  }

  clear() { this.items.clear(); }

  _rollLootTable() {
    let roll = Math.random() * TOTAL_WEIGHT;
    for (const entry of LOOT_TABLE) {
      roll -= entry.weight;
      if (roll <= 0) return entry;
    }
    return LOOT_TABLE[0];
  }

  _buildItem(template) {
    const base = {
      id:     uuidv4(),
      type:   template.type,
      rarity: template.rarity || 'common',
      weight: this._itemWeight(template),
    };

    switch (template.type) {
      case 'weapon': {
        const def = WeaponRegistry.get(template.weaponId);
        return { ...base, type: 'weapon', weaponId: template.weaponId, name: def.name, category: def.category };
      }
      case 'ammo':
        return { ...base, type: 'ammo', ammoType: template.ammoType, quantity: template.quantity };
      case 'consumable':
        return { ...base, type: 'consumable', subtype: template.subtype, healAmount: template.healAmount, useTime: template.useTime };
      case 'throwable':
        return { ...base, type: 'throwable', subtype: template.subtype };
      case 'melee':
        return { ...base, type: 'melee', weaponId: template.weaponId };
      case 'attachment':
        return { ...base, type: 'attachment', subtype: template.subtype, slot: template.slot };
      default:
        return base;
    }
  }

  _itemWeight(template) {
    if (template.type === 'ammo') return 0.5;
    if (template.type === 'attachment') return 0.2;
    if (template.type === 'throwable') return 1;
    if (template.type === 'consumable') return 0.5;
    if (template.type === 'weapon') {
      const def = WeaponRegistry.get(template.weaponId);
      return def ? def.weight : 5;
    }
    return 1;
  }

  _randomMapPosition() {
    return {
      x: Math.random() * this.mapSize,
      y: 1,   // ground level; server uses flat world for spawn distribution
      z: Math.random() * this.mapSize,
    };
  }
}

module.exports = LootSystem;
