export type Vec = { x: number; y: number };

export type UnitKind =
  | 'scout'
  | 'gunship'
  | 'brawler'
  | 'hunter'
  | 'sniper'
  | 'heavy'
  | 'boomer'
  | 'decoy'
  | 'shield'
  | 'splitter'
  | 'mite'
  | 'flak'
  | 'phantom'
  | 'offroad'
  | 'seeker'
  | 'laser'
  | 'disabler'
  | 'mortar'
  | 'lobber'
  | 'mechanic'
  | 'juggernaut'
  | 'goliath'
  | 'behemoth'
  | 'leviathan';

export type TowerKind =
  | 'gun' | 'swarm' | 'arc' | 'railgun' | 'emp' | 'bertha' | 'hive' | 'ciws' | 'bastion' | 'medic'
  | 'lockon' | 'garage' | 'cryo' | 'sprayer' | 'minelayer' | 'citadel';

export interface AttackSpec {
  type?: 'suppress' | 'disable';
  damage: number;
  range: number;
  cooldown: number; // s
  duration?: number; // s of suppress/disable on tower
  volley: number; // shots per volley
  projectile: 'bullet' | 'missile' | 'bigmissile'; // bullets can't be intercepted by CIWS
  splash?: number; // big missiles: also hit neighboring towers
}

export interface UnitDef {
  kind: UnitKind;
  name: string;
  cost: number;
  tonnage: number;
  hp: number;
  speed: number; // px/s along path
  leakDamage: number;
  bounty: number;
  unlockRound: number;
  radius: number;
  desc: string;
  // tower-attacking behavior: every armed tank deals real damage
  attack?: AttackSpec;
  attack2?: AttackSpec; // behemoth: second weapon system
  lockon?: { range: number; dps: number }; // laser tank: one tower until it's gone
  aura?: { radius: number; damageMult: number }; // shield tank
  taunt?: boolean; // decoy
  slowResist?: number; // 0..1
  deathBlast?: { radius: number; damage: number }; // boomer: hurts towers when killed
  splitInto?: { kind: UnitKind; count: number }; // splitter
  healAura?: { radius: number; hps: number }; // mechanic
  intercept?: { range: number; cooldown: number }; // flak/behemoth: downs defender missiles
  phase?: { visibleT: number; hiddenT: number }; // phantom: pulses untargetable
  offroad?: boolean; // ignores the path, drives straight for the base
  pickTower?: boolean; // seeker: attacker chooses a tower type when drafting
  hidden?: boolean; // spawn-only units (mites) — not purchasable
  maxPerWave?: number; // cap per wave (flak)
}

export interface TowerLevel {
  cost: number; // cost to reach this level (L1 = build cost)
  hp: number; // tower durability (upgrading heals to the new max)
  range: number;
  damage: number;
  cooldown: number; // s between shots/volleys
  splash?: number; // splash radius
  volley?: number; // missiles per volley (swarm/citadel)
  slowPct?: number; // emp/citadel
  slowDur?: number;
  interceptPerSec?: number; // ciws
  shieldMult?: number; // bastion: damage multiplier for towers in range
  heal?: number; // medic: hp/s restored to nearby towers
  drones?: number; // hive: max drones aloft
  stings?: number; // hive: stings per drone before recharge
  chains?: number; // arc: max targets per zap
  chainRange?: number; // arc: max jump distance
  dps?: number; // lockon/citadel: laser damage per second (per beam)
  tanks?: number; // garage: sortie tanks fielded
  freezeDur?: number; // cryo: seconds a hit tank is iced
  maxMines?: number; // minelayer: live mines at once
}

export interface TowerDef {
  kind: TowerKind;
  name: string;
  short: string;
  desc: string;
  levels: TowerLevel[]; // length 3
  projectile: 'bullet' | 'missile' | 'bigmissile' | 'pulse' | 'beam' | 'railshot' | 'drone' | 'zap' | 'aura' | 'laser' | 'sortie' | 'cryoshot' | 'minimissile' | 'mine';
  maxCount?: number; // cap on simultaneous builds (ciws)
}

// ---- wave drafting ----
export interface WaveEntry {
  kind: UnitKind;
  targetTower?: TowerKind; // seeker: the tower type it hunts
}

// ---- live entities (sim) ----

export interface Tank {
  id: number;
  kind: UnitKind;
  hp: number;
  maxHp: number;
  dist: number; // distance along path (offroad: progress proxy)
  pos: Vec;
  angle: number;
  turretAngle: number;
  slow: { mult: number; t: number };
  attackCd: number;
  attackCd2: number; // behemoth second weapon
  interceptCd: number; // flak/behemoth
  phaseT: number; // phantom: position in the visible/hidden cycle
  ghosted: boolean; // phantom: currently untargetable
  freezeT: number; // cryo: fully iced — no moving, no shooting
  lockTower?: number; // laser tank's chosen victim
  preferredTower?: TowerKind; // seeker
  offStart?: number; // offroad: straight-line distance to base at spawn
  flash: number; // damage flash timer
  dead: boolean;
  leaked: boolean;
}

export interface Tower {
  id: number;
  kind: TowerKind;
  level: number; // 1..3
  slot: number;
  hp: number;
  maxHp: number;
  pos: Vec;
  cooldown: number;
  angle: number;
  suppressT: number; // fire-rate debuff timer
  disableT: number; // hexer: knocked offline
  recoil: number;
  invested: number; // bricks spent (for sell)
  dronesOut: number; // hive
  rechargeT: number; // hive: delay before relaunching a returned drone
  lockTank?: number; // lockon/citadel beam target
  lockTank2?: number; // citadel's second beam
}

/** garage sortie tank: defender armor that roams off-road */
export interface Sortie {
  id: number;
  towerId: number;
  pos: Vec;
  angle: number;
  turretAngle: number;
  cooldown: number;
}

export interface Mine {
  id: number;
  towerId: number;
  pos: Vec;
  damage: number;
  splash: number;
}

export type ProjectileKind =
  | 'bullet'
  | 'missile' // small homing, from swarm tower
  | 'minimissile' // hornet nest: tiny and constant
  | 'bigmissile' // bertha
  | 'railshot'
  | 'cryoshot' // freeze ray bolt
  | 'tankmissile' // creep -> tower (damage + suppress/disable), interceptable
  | 'tankbigmissile' // lobber -> tower, splash, interceptable
  | 'tankbullet' // creep -> tower (damage only), NOT interceptable
  | 'interceptor' // ciws -> tank missiles
  | 'tankinterceptor' // flak -> defender missile
  | 'drone'; // hive bee: stings repeatedly, then flies home to recharge

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  pos: Vec;
  vel: Vec;
  speed: number;
  turnRate: number; // rad/s for homing
  targetTank?: number;
  targetTower?: number;
  targetProjectile?: number;
  damage: number;
  splash?: number;
  effect?: { type: 'suppress' | 'disable'; duration: number };
  freezeDur?: number; // cryoshot
  life: number; // failsafe seconds
  dead: boolean;
  wobblePhase?: number;
  // drone state
  stingsLeft?: number;
  droneState?: 'hunt' | 'return';
  homeTower?: number;
  stingCd?: number; // brief pull-away after each sting
}

export type SimEvent =
  | { type: 'explosion'; pos: Vec; size: number }
  | { type: 'shockwave'; pos: Vec; radius: number }
  | { type: 'muzzle'; pos: Vec; angle: number }
  | { type: 'intercept'; pos: Vec }
  | { type: 'kill'; pos: Vec; bounty: number; kind: UnitKind }
  | { type: 'leak'; damage: number; kind: UnitKind }
  | { type: 'pulse'; pos: Vec; radius: number }
  | { type: 'zap'; points: Vec[] }
  | { type: 'towerDestroyed'; pos: Vec; towerId: number }
  | { type: 'waveEnd' }
  | { type: 'sfx'; name: string };

export type Phase =
  | 'title'
  | 'roundIntro'
  | 'defendBuild'
  | 'handoffToAttacker'
  | 'waveBuild'
  | 'handoffToCombat'
  | 'combat'
  | 'summary'
  | 'gameOver';
