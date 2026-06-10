import type { TowerDef, UnitDef, UnitKind, TowerKind, Vec } from './types';

// ---------------- match ----------------
export const ROUNDS = 12;
export const START_LIVES = 20;
export const SPAWN_INTERVAL = 0.25; // minimum s between units; real gap scales with unit size/speed
export const SELL_RATIO = 0.7;

// World logical size (scaled to fit screen)
export const WORLD_W = 1280;
export const WORLD_H = 800;
export const PATH_WIDTH = 58;

// ---------------- economy ----------------
// Swarm economy: units are cheap and numerous. The defender compensates with a
// big starting bank, doubled income, free between-round repairs, and bounties
// that stay at full value while unit costs were halved.
// Attacker bricks bank between rounds; saving for a giant wave is a legit
// strategy, countered by the defender's compounding tower investment.
export function attackerBudget(round: number): number {
  return 280 + 105 * (round - 1) + 6 * (round - 1) * (round - 1);
}
export const LEAK_REWARD = 10; // bricks per life dealt, paid next round
export const SHUTOUT_PITY = 80; // attacker bonus if a wave dealt 0 damage

export const DEF_START_BRICKS = 950;
export function defenderIncome(round: number): number {
  return 220 + 44 * (round - 1);
}
// catch-up valve for a bleeding defender
export function defenderCatchUp(lives: number): number {
  if (lives <= 5) return 180;
  if (lives <= 10) return 100;
  return 0;
}

// ---------------- units ----------------
// Everything is buyable from round 1 — prices are the gate.
// Attack cadence: lots of small shots. Damage × cooldown preserved from the
// old single-shot values, just delivered twice as often at half strength.
export const UNITS: Record<UnitKind, UnitDef> = {
  scout: {
    kind: 'scout', name: 'Scout', cost: 10, tonnage: 1, hp: 70, speed: 60,
    leakDamage: 1, bounty: 3, unlockRound: 1, radius: 13,
    desc: 'Cheap and fast. Pecks at towers with a light gun.',
    attack: { damage: 2, range: 115, cooldown: 0.75, volley: 1, projectile: 'bullet' },
  },
  brawler: {
    kind: 'brawler', name: 'Brawler', cost: 18, tonnage: 2, hp: 190, speed: 60,
    leakDamage: 1, bounty: 6, unlockRound: 1, radius: 16,
    desc: 'The workhorse. Honest HP, honest cannon.',
    attack: { damage: 4.5, range: 135, cooldown: 1.1, volley: 1, projectile: 'bullet' },
  },
  hunter: {
    kind: 'hunter', name: 'Hunter', cost: 30, tonnage: 2, hp: 150, speed: 60,
    leakDamage: 1, bounty: 10, unlockRound: 1, radius: 16,
    desc: 'Long-range missile sniper. Cracks towers open from afar.',
    attack: { damage: 17, range: 185, cooldown: 2.25, volley: 1, projectile: 'missile' },
  },
  heavy: {
    kind: 'heavy', name: 'Heavy', cost: 38, tonnage: 3, hp: 540, speed: 60,
    leakDamage: 2, bounty: 13, unlockRound: 1, radius: 19,
    desc: 'Slow slab of armor with a real cannon. Eats bullets, spits them back.',
    attack: { damage: 7.5, range: 145, cooldown: 1.4, volley: 1, projectile: 'bullet' },
  },
  boomer: {
    kind: 'boomer', name: 'Boomer', cost: 26, tonnage: 2, hp: 170, speed: 60,
    leakDamage: 1, bounty: 8, unlockRound: 1, radius: 15,
    deathBlast: { radius: 150, damage: 150 },
    desc: 'Dies loudly — the blast craters nearby towers.',
  },
  decoy: {
    kind: 'decoy', name: 'Decoy', cost: 24, tonnage: 2, hp: 220, speed: 60,
    leakDamage: 1, bounty: 8, unlockRound: 1, radius: 15, taunt: true,
    desc: 'Towers can’t resist shooting it first. Use as a shield.',
  },
  shield: {
    kind: 'shield', name: 'Aegis', cost: 46, tonnage: 3, hp: 280, speed: 60,
    leakDamage: 2, bounty: 15, unlockRound: 1, radius: 17,
    aura: { radius: 95, damageMult: 0.7 },
    desc: 'Projects a bubble: nearby allies take 30% less damage.',
    attack: { damage: 3, range: 130, cooldown: 1.2, volley: 1, projectile: 'bullet' },
  },
  splitter: {
    kind: 'splitter', name: 'Splitter', cost: 32, tonnage: 2, hp: 260, speed: 60,
    leakDamage: 1, bounty: 7, unlockRound: 1, radius: 17,
    splitInto: { kind: 'mite', count: 3 },
    desc: 'Cracks open into three angry mites when destroyed.',
  },
  mite: {
    kind: 'mite', name: 'Mite', cost: 0, tonnage: 1, hp: 55, speed: 60,
    leakDamage: 1, bounty: 2, unlockRound: 1, radius: 10, hidden: true,
    desc: 'A splitter’s grudge, in triplicate.',
  },
  flak: {
    kind: 'flak', name: 'Flak Rig', cost: 40, tonnage: 2, hp: 300, speed: 60,
    leakDamage: 1, bounty: 9, unlockRound: 1, radius: 16, maxPerWave: 4,
    intercept: { range: 160, cooldown: 0.9 },
    desc: 'Shoots defender missiles out of the sky. Max 4 per wave.',
  },
  phantom: {
    kind: 'phantom', name: 'Phantom', cost: 36, tonnage: 2, hp: 200, speed: 60,
    leakDamage: 1, bounty: 8, unlockRound: 1, radius: 15,
    phase: { visibleT: 2.2, hiddenT: 1.4 },
    desc: 'Pulses invisible — towers can’t aim at what isn’t there. Splash still hurts it.',
  },
  mortar: {
    kind: 'mortar', name: 'Mortar Crawler', cost: 52, tonnage: 3, hp: 240, speed: 60,
    leakDamage: 2, bounty: 17, unlockRound: 1, radius: 18,
    desc: 'Lobs suppression shells that slow a tower’s fire rate.',
    attack: { type: 'suppress', damage: 14, range: 235, cooldown: 2.75, duration: 1.5, volley: 1, projectile: 'missile' },
  },
  mechanic: {
    kind: 'mechanic', name: 'Mechanic', cost: 48, tonnage: 3, hp: 260, speed: 60,
    leakDamage: 1, bounty: 10, unlockRound: 1, radius: 16,
    healAura: { radius: 95, hps: 10 },
    desc: 'Field repairs on the move. Keeps the column rolling.',
  },
  goliath: {
    kind: 'goliath', name: 'GOLIATH', cost: 130, tonnage: 6, hp: 1900, speed: 60,
    leakDamage: 4, bounty: 40, unlockRound: 1, radius: 26,
    desc: 'Boss. Volleys of heavy missiles. A rolling fortress.',
    attack: { damage: 17.5, range: 200, cooldown: 3.5, volley: 3, projectile: 'missile' },
  },
  leviathan: {
    kind: 'leviathan', name: 'LEVIATHAN', cost: 270, tonnage: 10, hp: 5000, speed: 60,
    leakDamage: 8, bounty: 80, unlockRound: 1, radius: 32, slowResist: 0.5,
    desc: 'The end of the world on treads. Shielded, seething, unstoppable?',
    attack: { damage: 22.5, range: 210, cooldown: 3, volley: 3, projectile: 'missile' },
    aura: { radius: 110, damageMult: 0.75 },
  },
};

export const UNIT_ORDER: UnitKind[] = [
  'scout', 'brawler', 'hunter', 'heavy', 'boomer', 'decoy', 'shield',
  'splitter', 'flak', 'phantom', 'mortar', 'mechanic', 'goliath', 'leviathan',
];

// ---------------- towers ----------------
export const TOWERS: Record<TowerKind, TowerDef> = {
  gun: {
    kind: 'gun', name: 'Gun Turret', short: 'GUN', projectile: 'bullet',
    desc: 'Cheap rapid fire. The bread and butter.',
    levels: [
      { cost: 70, hp: 240, range: 120, damage: 9, cooldown: 0.22 },
      { cost: 60, hp: 300, range: 130, damage: 14, cooldown: 0.2 },
      { cost: 110, hp: 360, range: 140, damage: 21, cooldown: 0.175 },
    ],
  },
  swarm: {
    kind: 'swarm', name: 'Swarm Pod', short: 'SWARM', projectile: 'missile',
    desc: 'Volleys of tiny homing missiles. Beautiful chaos.',
    levels: [
      { cost: 150, hp: 280, range: 170, damage: 11, cooldown: 1.6, volley: 6 },
      { cost: 110, hp: 340, range: 180, damage: 13, cooldown: 1.45, volley: 8 },
      { cost: 190, hp: 400, range: 195, damage: 16, cooldown: 1.35, volley: 10 },
    ],
  },
  arc: {
    kind: 'arc', name: 'Arc Coil', short: 'ARC', projectile: 'zap',
    desc: 'Chain lightning. Made for mobs.',
    levels: [
      { cost: 180, hp: 260, range: 135, damage: 16, cooldown: 1.0, chains: 3, chainRange: 95 },
      { cost: 140, hp: 320, range: 150, damage: 23, cooldown: 0.95, chains: 4, chainRange: 100 },
      { cost: 220, hp: 380, range: 165, damage: 32, cooldown: 0.9, chains: 5, chainRange: 110 },
    ],
  },
  railgun: {
    kind: 'railgun', name: 'Railgun', short: 'RAIL', projectile: 'railshot',
    desc: 'Long range, huge single hits. Boss insurance.',
    levels: [
      { cost: 170, hp: 260, range: 240, damage: 90, cooldown: 1.75 },
      { cost: 130, hp: 320, range: 255, damage: 140, cooldown: 1.6 },
      { cost: 220, hp: 380, range: 275, damage: 220, cooldown: 1.45 },
    ],
  },
  emp: {
    kind: 'emp', name: 'EMP Coil', short: 'EMP', projectile: 'pulse',
    desc: 'Pulses that slow everything nearby.',
    levels: [
      { cost: 130, hp: 260, range: 110, damage: 0, cooldown: 1.85, slowPct: 0.4, slowDur: 1.6 },
      { cost: 100, hp: 320, range: 122, damage: 0, cooldown: 1.75, slowPct: 0.5, slowDur: 2.0 },
      { cost: 170, hp: 380, range: 134, damage: 0, cooldown: 1.6, slowPct: 0.6, slowDur: 2.4 },
    ],
  },
  bertha: {
    kind: 'bertha', name: 'Big Bertha', short: 'BERTHA', projectile: 'bigmissile',
    desc: 'One colossal missile. Massive splash. Felt in your chest.',
    levels: [
      { cost: 280, hp: 360, range: 260, damage: 120, cooldown: 3.3, splash: 80 },
      { cost: 210, hp: 430, range: 280, damage: 190, cooldown: 3.05, splash: 90 },
      { cost: 340, hp: 500, range: 300, damage: 290, cooldown: 2.8, splash: 100 },
    ],
  },
  hive: {
    kind: 'hive', name: 'Beehive', short: 'HIVE', projectile: 'drone',
    desc: 'A box of angry drones. They sting and sting, then fly home to recharge.',
    levels: [
      { cost: 160, hp: 280, range: 165, damage: 9, cooldown: 0.27, drones: 3, stings: 4 },
      { cost: 120, hp: 340, range: 180, damage: 12, cooldown: 0.25, drones: 4, stings: 4 },
      { cost: 190, hp: 400, range: 195, damage: 15, cooldown: 0.23, drones: 5, stings: 5 },
    ],
  },
  ciws: {
    kind: 'ciws', name: 'Point Defense', short: 'CIWS', projectile: 'beam', maxCount: 4,
    desc: 'Shoots enemy missiles out of the sky. Weak vs armor. Max 4.',
    levels: [
      { cost: 140, hp: 300, range: 150, damage: 4, cooldown: 0.27, interceptPerSec: 6 },
      { cost: 100, hp: 360, range: 165, damage: 7, cooldown: 0.23, interceptPerSec: 9 },
      { cost: 170, hp: 420, range: 180, damage: 10, cooldown: 0.2, interceptPerSec: 12 },
    ],
  },
  bastion: {
    kind: 'bastion', name: 'Bastion', short: 'BASTION', projectile: 'aura',
    desc: 'Projects a shield dome: towers inside take less damage.',
    levels: [
      { cost: 120, hp: 420, range: 180, damage: 0, cooldown: 99, shieldMult: 0.7 },
      { cost: 90, hp: 520, range: 210, damage: 0, cooldown: 99, shieldMult: 0.6 },
      { cost: 150, hp: 620, range: 240, damage: 0, cooldown: 99, shieldMult: 0.5 },
    ],
  },
  medic: {
    kind: 'medic', name: 'Repair Crew', short: 'MEDIC', projectile: 'aura',
    desc: 'Patches up nearby towers while the shells fly.',
    levels: [
      { cost: 130, hp: 320, range: 140, damage: 0, cooldown: 99, heal: 7 },
      { cost: 100, hp: 400, range: 155, damage: 0, cooldown: 99, heal: 10 },
      { cost: 160, hp: 480, range: 170, damage: 0, cooldown: 99, heal: 14 },
    ],
  },
};

export const TOWER_ORDER: TowerKind[] = [
  'gun', 'swarm', 'arc', 'railgun', 'emp', 'bertha', 'hive', 'ciws', 'bastion', 'medic',
];

// upgraded towers are bigger targets: bonus damage taken from tank fire per level
export const TOWER_LEVEL_VULN = 0.15; // L2 +15%, L3 +30%

// ---------------- map ----------------
// Switchback path, left to right. Start off-screen left, base off right.
export const PATH_POINTS: Vec[] = [
  { x: -60, y: 170 },
  { x: 235, y: 170 },
  { x: 235, y: 470 },
  { x: 560, y: 470 },
  { x: 560, y: 170 },
  { x: 935, y: 170 },
  { x: 935, y: 430 },
  { x: 705, y: 430 },
  { x: 705, y: 645 },
  { x: 1185, y: 645 },
];

export const BASE_POS: Vec = { x: 1200, y: 645 };

// Tower slot pads. Hand-placed for interesting coverage overlaps.
export const SLOTS: Vec[] = [
  { x: 120, y: 85 },   // 0  top-left run
  { x: 150, y: 262 },  // 1  seg1+2 corner pocket
  { x: 62, y: 320 },   // 2  long-range west
  { x: 318, y: 262 },  // 3  east of first descent
  { x: 318, y: 388 },  // 4  seg2+3 pocket
  { x: 470, y: 388 },  // 5  seg3+4 pocket (sweet spot)
  { x: 470, y: 252 },  // 6  seg4 mid
  { x: 645, y: 252 },  // 7  seg4+5 pocket (sweet spot)
  { x: 645, y: 88 },   // 8  top run
  { x: 810, y: 88 },   // 9  top run east
  { x: 855, y: 252 },  // 10 seg5+6 pocket
  { x: 1030, y: 255 }, // 11 east of descent
  { x: 820, y: 345 },  // 12 seg6+7 pocket (sweet spot)
  { x: 820, y: 520 },  // 13 seg7+8+9 triple pocket (sweet spot)
  { x: 618, y: 518 },  // 14 west of final descent
  { x: 380, y: 560 },  // 15 below seg3
  { x: 600, y: 730 },  // 16 below final run west
  { x: 905, y: 735 },  // 17 final run
  { x: 1055, y: 735 }, // 18 final run east
  { x: 1100, y: 545 }, // 19 last stand
  { x: 1030, y: 430 }, // 20 seg6 east… covers descent + final
  { x: 230, y: 600 },  // 21 deep south-west long range
];

export const SLOT_SIZE = 62;

// orange — used ONLY for life loss + defeat
export const ACCENT = 0xf2742b;
