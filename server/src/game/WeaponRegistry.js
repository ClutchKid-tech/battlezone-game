'use strict';

// Comprehensive weapon registry — 24 unique weapons across 7 categories.
// All values are tuned for a ~4 km² map with 100 players.
//
// Fields:
//   id            — unique string identifier
//   name          — display name
//   category      — Pistol | SMG | AR | Sniper | Shotgun | LMG | Melee
//   ammoType      — links to Inventory ammo reserves
//   damage        — base body damage per hit
//   headMultiplier — headshot multiplier (applied on top of base damage × 1.5 in Player)
//   rateOfFire    — rounds per second
//   magazineSize  — rounds per mag
//   reloadTime    — seconds for full reload
//   velocity      — projectile m/s (9999 = hitscan)
//   range         — effective range in metres; damage falls off beyond this
//   minDamage     — minimum damage at max falloff range
//   spread        — base hip-fire spread (radians)
//   adsSpread     — ADS spread (radians)
//   recoilX, recoilY — per-shot recoil
//   pellets       — for shotguns: rounds per shot
//   weight        — inventory weight units
//   rarity        — common | uncommon | rare | epic | legendary
//   attachmentSlots — array of supported attachment types

const WEAPONS = [
  // ── PISTOLS ──────────────────────────────────────────────────────────
  {
    id: 'p2000',        name: 'P2000',           category: 'Pistol',
    ammoType: '9mm',    damage: 28,              headMultiplier: 2.0,
    rateOfFire: 4,      magazineSize: 15,         reloadTime: 1.6,
    velocity: 9999,     range: 50,                minDamage: 18,
    spread: 0.03,       adsSpread: 0.008,
    recoilX: 1.2,       recoilY: 2.5,
    pellets: 1,         weight: 1,               rarity: 'common',
    attachmentSlots: ['scope', 'suppressor'],
  },
  {
    id: 'deagle',       name: 'Desert Eagle',    category: 'Pistol',
    ammoType: '.50ae',  damage: 62,              headMultiplier: 2.5,
    rateOfFire: 2,      magazineSize: 7,          reloadTime: 1.9,
    velocity: 9999,     range: 70,                minDamage: 40,
    spread: 0.05,       adsSpread: 0.015,
    recoilX: 3.0,       recoilY: 5.0,
    pellets: 1,         weight: 2,               rarity: 'rare',
    attachmentSlots: ['scope'],
  },

  // ── SMGs ─────────────────────────────────────────────────────────────
  {
    id: 'mp5',          name: 'MP5',             category: 'SMG',
    ammoType: '9mm',    damage: 22,              headMultiplier: 1.8,
    rateOfFire: 13,     magazineSize: 30,         reloadTime: 2.1,
    velocity: 9999,     range: 40,                minDamage: 12,
    spread: 0.04,       adsSpread: 0.012,
    recoilX: 0.8,       recoilY: 1.5,
    pellets: 1,         weight: 3,               rarity: 'common',
    attachmentSlots: ['scope', 'suppressor', 'grip', 'stock', 'mag'],
  },
  {
    id: 'vector',       name: 'Vector',          category: 'SMG',
    ammoType: '.45acp', damage: 18,              headMultiplier: 1.8,
    rateOfFire: 18,     magazineSize: 25,         reloadTime: 2.0,
    velocity: 9999,     range: 35,                minDamage: 10,
    spread: 0.06,       adsSpread: 0.018,
    recoilX: 0.6,       recoilY: 1.2,
    pellets: 1,         weight: 3,               rarity: 'uncommon',
    attachmentSlots: ['scope', 'suppressor', 'grip', 'mag'],
  },
  {
    id: 'pp19',         name: 'PP-19 Bizon',     category: 'SMG',
    ammoType: '9mm',    damage: 21,              headMultiplier: 1.8,
    rateOfFire: 11,     magazineSize: 53,         reloadTime: 2.8,
    velocity: 9999,     range: 38,                minDamage: 11,
    spread: 0.05,       adsSpread: 0.014,
    recoilX: 0.9,       recoilY: 1.6,
    pellets: 1,         weight: 4,               rarity: 'uncommon',
    attachmentSlots: ['scope', 'suppressor'],
  },

  // ── ASSAULT RIFLES ───────────────────────────────────────────────────
  {
    id: 'm416',         name: 'M416',            category: 'AR',
    ammoType: '5.56mm', damage: 41,              headMultiplier: 2.0,
    rateOfFire: 11,     magazineSize: 30,         reloadTime: 2.4,
    velocity: 9999,     range: 150,               minDamage: 22,
    spread: 0.03,       adsSpread: 0.008,
    recoilX: 1.0,       recoilY: 2.0,
    pellets: 1,         weight: 5,               rarity: 'common',
    attachmentSlots: ['scope', 'suppressor', 'grip', 'stock', 'mag'],
  },
  {
    id: 'ak47',         name: 'AK-47',           category: 'AR',
    ammoType: '7.62mm', damage: 48,              headMultiplier: 2.0,
    rateOfFire: 10,     magazineSize: 30,         reloadTime: 2.6,
    velocity: 9999,     range: 120,               minDamage: 25,
    spread: 0.04,       adsSpread: 0.012,
    recoilX: 2.0,       recoilY: 3.5,
    pellets: 1,         weight: 6,               rarity: 'common',
    attachmentSlots: ['scope', 'suppressor', 'grip', 'mag'],
  },
  {
    id: 'scar_l',       name: 'SCAR-L',          category: 'AR',
    ammoType: '5.56mm', damage: 43,              headMultiplier: 2.0,
    rateOfFire: 11,     magazineSize: 30,         reloadTime: 2.3,
    velocity: 9999,     range: 160,               minDamage: 23,
    spread: 0.03,       adsSpread: 0.007,
    recoilX: 0.9,       recoilY: 1.8,
    pellets: 1,         weight: 5,               rarity: 'uncommon',
    attachmentSlots: ['scope', 'suppressor', 'grip', 'stock', 'mag'],
  },
  {
    id: 'aug',          name: 'AUG A3',          category: 'AR',
    ammoType: '5.56mm', damage: 40,              headMultiplier: 2.0,
    rateOfFire: 12,     magazineSize: 30,         reloadTime: 2.3,
    velocity: 9999,     range: 140,               minDamage: 21,
    spread: 0.025,      adsSpread: 0.006,
    recoilX: 0.7,       recoilY: 1.5,
    pellets: 1,         weight: 5,               rarity: 'rare',
    attachmentSlots: ['scope', 'suppressor', 'grip', 'mag'],
  },

  // ── SNIPERS ──────────────────────────────────────────────────────────
  {
    id: 'kar98',        name: 'Kar98k',          category: 'Sniper',
    ammoType: '7.62mm', damage: 79,              headMultiplier: 2.5,
    rateOfFire: 1.0,    magazineSize: 5,          reloadTime: 4.5,
    velocity: 760,      range: 600,               minDamage: 50,
    spread: 0.001,      adsSpread: 0.0002,
    recoilX: 3.0,       recoilY: 7.0,
    pellets: 1,         weight: 7,               rarity: 'uncommon',
    attachmentSlots: ['scope', 'suppressor', 'stock'],
  },
  {
    id: 'awm',          name: 'AWM',             category: 'Sniper',
    ammoType: '.300mag', damage: 105,            headMultiplier: 3.0,
    rateOfFire: 0.8,    magazineSize: 5,          reloadTime: 5.0,
    velocity: 945,      range: 1000,              minDamage: 75,
    spread: 0.001,      adsSpread: 0.00015,
    recoilX: 4.0,       recoilY: 9.0,
    pellets: 1,         weight: 9,               rarity: 'legendary',
    attachmentSlots: ['scope', 'suppressor', 'stock'],
  },
  {
    id: 'mk14',         name: 'Mk14 EBR',        category: 'Sniper',
    ammoType: '7.62mm', damage: 61,              headMultiplier: 2.0,
    rateOfFire: 4,      magazineSize: 10,         reloadTime: 3.5,
    velocity: 9999,     range: 400,               minDamage: 40,
    spread: 0.005,      adsSpread: 0.001,
    recoilX: 2.0,       recoilY: 4.5,
    pellets: 1,         weight: 8,               rarity: 'rare',
    attachmentSlots: ['scope', 'suppressor', 'grip', 'stock', 'mag'],
  },

  // ── SHOTGUNS ─────────────────────────────────────────────────────────
  {
    id: 's12k',         name: 'S12K',            category: 'Shotgun',
    ammoType: '12gauge', damage: 22,             headMultiplier: 1.5,
    rateOfFire: 3,      magazineSize: 10,         reloadTime: 3.0,
    velocity: 9999,     range: 20,                minDamage: 5,
    spread: 0.10,       adsSpread: 0.06,
    recoilX: 2.0,       recoilY: 4.0,
    pellets: 9,         weight: 6,               rarity: 'uncommon',
    attachmentSlots: ['scope', 'suppressor', 'mag'],
  },
  {
    id: 'dpump',        name: 'Double Pump',     category: 'Shotgun',
    ammoType: '12gauge', damage: 35,             headMultiplier: 1.5,
    rateOfFire: 1.5,    magazineSize: 5,          reloadTime: 0.4,  // shells
    velocity: 9999,     range: 15,                minDamage: 5,
    spread: 0.12,       adsSpread: 0.08,
    recoilX: 3.5,       recoilY: 6.0,
    pellets: 8,         weight: 5,               rarity: 'common',
    attachmentSlots: ['suppressor'],
  },
  {
    id: 'origin_12',    name: 'Origin-12',       category: 'Shotgun',
    ammoType: '12gauge', damage: 20,             headMultiplier: 1.5,
    rateOfFire: 5,      magazineSize: 15,         reloadTime: 2.8,
    velocity: 9999,     range: 18,                minDamage: 4,
    spread: 0.12,       adsSpread: 0.07,
    recoilX: 1.8,       recoilY: 3.5,
    pellets: 9,         weight: 7,               rarity: 'rare',
    attachmentSlots: ['scope', 'suppressor', 'mag'],
  },

  // ── LMGs ─────────────────────────────────────────────────────────────
  {
    id: 'dp28',         name: 'DP-28',           category: 'LMG',
    ammoType: '7.62mm', damage: 51,              headMultiplier: 2.0,
    rateOfFire: 9,      magazineSize: 47,         reloadTime: 5.5,
    velocity: 9999,     range: 130,               minDamage: 28,
    spread: 0.05,       adsSpread: 0.015,
    recoilX: 1.5,       recoilY: 3.0,
    pellets: 1,         weight: 9,               rarity: 'uncommon',
    attachmentSlots: ['scope'],
  },
  {
    id: 'm249',         name: 'M249',            category: 'LMG',
    ammoType: '5.56mm', damage: 45,              headMultiplier: 2.0,
    rateOfFire: 12,     magazineSize: 100,        reloadTime: 8.0,
    velocity: 9999,     range: 120,               minDamage: 24,
    spread: 0.04,       adsSpread: 0.012,
    recoilX: 1.2,       recoilY: 2.5,
    pellets: 1,         weight: 11,              rarity: 'epic',
    attachmentSlots: ['scope', 'grip'],
  },

  // ── THROWABLES ───────────────────────────────────────────────────────
  {
    id: 'frag',         name: 'Frag Grenade',    category: 'Throwable',
    ammoType: null,     damage: 180,             headMultiplier: 1.0,
    rateOfFire: null,   magazineSize: null,       reloadTime: null,
    velocity: null,     range: 6,                 minDamage: 10,
    spread: 0,          adsSpread: 0,
    recoilX: 0,         recoilY: 0,
    pellets: 0,         weight: 1,               rarity: 'common',
    attachmentSlots: [],
    fuseTime: 4.0,
  },
  {
    id: 'smoke',        name: 'Smoke Grenade',   category: 'Throwable',
    ammoType: null,     damage: 0,               headMultiplier: 1.0,
    rateOfFire: null,   magazineSize: null,       reloadTime: null,
    velocity: null,     range: 8,                 minDamage: 0,
    spread: 0,          adsSpread: 0,
    recoilX: 0,         recoilY: 0,
    pellets: 0,         weight: 0.5,             rarity: 'common',
    attachmentSlots: [],
    smokeDuration: 30_000,
  },
  {
    id: 'flashbang',    name: 'Flashbang',       category: 'Throwable',
    ammoType: null,     damage: 0,               headMultiplier: 1.0,
    rateOfFire: null,   magazineSize: null,       reloadTime: null,
    velocity: null,     range: 5,                 minDamage: 0,
    spread: 0,          adsSpread: 0,
    recoilX: 0,         recoilY: 0,
    pellets: 0,         weight: 0.4,             rarity: 'uncommon',
    attachmentSlots: [],
    blindDuration: 3000,
  },
  {
    id: 'molotov',      name: 'Molotov Cocktail', category: 'Throwable',
    ammoType: null,     damage: 10,              headMultiplier: 1.0,
    rateOfFire: null,   magazineSize: null,       reloadTime: null,
    velocity: null,     range: 4,                 minDamage: 8,
    spread: 0,          adsSpread: 0,
    recoilX: 0,         recoilY: 0,
    pellets: 0,         weight: 1,               rarity: 'uncommon',
    attachmentSlots: [],
    burnDuration: 8000,
    burnDps: 8,
  },

  // ── MELEE ─────────────────────────────────────────────────────────────
  {
    id: 'pan',          name: 'Frying Pan',      category: 'Melee',
    ammoType: null,     damage: 80,              headMultiplier: 2.0,
    rateOfFire: 1.5,    magazineSize: null,       reloadTime: null,
    velocity: 9999,     range: 2,                 minDamage: 80,
    spread: 0,          adsSpread: 0,
    recoilX: 0,         recoilY: 0,
    pellets: 0,         weight: 3,               rarity: 'common',
    attachmentSlots: [],
  },
];

const _registry = new Map(WEAPONS.map(w => [w.id, Object.freeze(w)]));

const WeaponRegistry = {
  get(id)      { return _registry.get(id) || null; },
  getAll()     { return [..._registry.values()]; },
  has(id)      { return _registry.has(id); },
  byCategory(cat) { return [..._registry.values()].filter(w => w.category === cat); },
  byRarity(r)  { return [..._registry.values()].filter(w => w.rarity === r); },
};

module.exports = WeaponRegistry;
