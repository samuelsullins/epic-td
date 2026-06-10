import {
  BASE_POS, SLOTS, SPAWN_INTERVAL, TOWERS, TOWER_LEVEL_VULN, UNITS,
} from './config';
import { PATH_LENGTH, distance, pointAt } from './path';
import type {
  AttackSpec, Mine, Projectile, SimEvent, Sortie, Tank, Tower, TowerKind, UnitKind, Vec, WaveEntry,
} from './types';

const DT = 1 / 60;
const SORTIE_SPEED = 85;
const SORTIE_FIRE_RANGE = 150;

let nextId = 1;
function id() { return nextId++; }

export class Sim {
  tanks: Tank[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  sorties: Sortie[] = [];
  mines: Mine[] = [];
  events: SimEvent[] = [];

  waveQueue: WaveEntry[] = [];
  spawnTimer = 0;
  waveActive = false;

  private acc = 0;
  private spawnLater: Tank[] = []; // splitter mites born mid-iteration

  // ---------- defender API ----------
  towerAt(slot: number): Tower | undefined {
    return this.towers.find((t) => t.slot === slot);
  }

  buildTower(slot: number, kind: TowerKind): Tower | null {
    if (this.towerAt(slot)) return null;
    const def = TOWERS[kind];
    const t: Tower = {
      id: id(), kind, level: 1, slot, pos: { ...SLOTS[slot] },
      hp: def.levels[0].hp, maxHp: def.levels[0].hp,
      cooldown: 0.2, angle: -Math.PI / 2, suppressT: 0, disableT: 0, recoil: 0,
      invested: def.levels[0].cost,
      dronesOut: 0, rechargeT: 0,
    };
    this.towers.push(t);
    this.events.push({ type: 'sfx', name: 'build' });
    return t;
  }

  upgradeTower(towerId: number): boolean {
    const t = this.towers.find((x) => x.id === towerId);
    if (!t || t.level >= 3) return false;
    t.invested += TOWERS[t.kind].levels[t.level].cost;
    t.level += 1;
    // upgrading repairs to the new, larger max
    t.maxHp = TOWERS[t.kind].levels[t.level - 1].hp;
    t.hp = t.maxHp;
    this.events.push({ type: 'sfx', name: 'build' });
    return true;
  }

  repairTower(towerId: number): boolean {
    const t = this.towers.find((x) => x.id === towerId);
    if (!t || t.hp >= t.maxHp) return false;
    t.hp = t.maxHp;
    this.events.push({ type: 'sfx', name: 'build' });
    return true;
  }

  /** between rounds, surviving towers patch themselves up for free */
  healAllTowers() {
    for (const t of this.towers) t.hp = t.maxHp;
  }

  sellTower(towerId: number): number {
    const i = this.towers.findIndex((x) => x.id === towerId);
    if (i < 0) return 0;
    const refund = this.towers[i].invested;
    this.towers.splice(i, 1);
    this.sorties = this.sorties.filter((s) => s.towerId !== towerId);
    this.events.push({ type: 'sfx', name: 'sell' });
    return refund;
  }

  // ---------- attacker API ----------
  startWave(entries: WaveEntry[]) {
    this.waveQueue = [...entries];
    this.spawnTimer = 0.3;
    this.waveActive = true;
    this.clearOrdnance();
  }

  /** no live rounds between waves — stale projectiles used to freeze on screen
      and fire off when the next wave began */
  private clearOrdnance() {
    this.projectiles = [];
    for (const t of this.towers) {
      t.dronesOut = 0;
      t.rechargeT = 0;
      t.lockTank = undefined;
      t.lockTank2 = undefined;
    }
  }

  get waveDone(): boolean {
    return this.waveActive && this.waveQueue.length === 0 && this.tanks.length === 0;
  }

  // ---------- main loop ----------
  /** Advance by real elapsed ms at a given speed multiplier; fixed internal steps. */
  tick(elapsedMs: number, speed: number) {
    this.acc += (elapsedMs / 1000) * speed;
    // clamp to avoid spiral of death after tab switch
    if (this.acc > 0.5) this.acc = 0.5;
    while (this.acc >= DT) {
      this.step(DT);
      this.acc -= DT;
    }
  }

  private step(dt: number) {
    // orphaned sorties (garage sold or destroyed) pack up
    if (this.sorties.length > 0) {
      this.sorties = this.sorties.filter((s) => this.towers.some((t) => t.id === s.towerId));
    }

    if (!this.waveActive) {
      // idle board (build phases): towers track nothing, timers cool
      for (const t of this.towers) t.recoil = Math.max(0, t.recoil - dt * 4);
      return;
    }

    // spawn (first unit added to the wave rolls out first)
    if (this.waveQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const entry = this.waveQueue.shift()!;
        const def = UNITS[entry.kind];
        // gap sized so the follower never overlaps this unit
        const next = this.waveQueue[0];
        if (next) {
          const ndef = UNITS[next.kind];
          const gapPx = def.radius + ndef.radius + 10;
          const slower = Math.min(def.speed, ndef.speed);
          this.spawnTimer += Math.min(1.5, Math.max(SPAWN_INTERVAL, gapPx / slower));
        }
        this.tanks.push(this.makeTank(entry.kind, 0, entry.targetTower));
        this.events.push({ type: 'sfx', name: 'spawn' });
      }
    }

    this.stepTanks(dt);
    this.stepTowers(dt);
    this.stepSorties(dt);
    this.stepMines();
    this.stepProjectiles(dt);

    if (this.spawnLater.length > 0) {
      this.tanks.push(...this.spawnLater);
      this.spawnLater = [];
    }

    this.tanks = this.tanks.filter((t) => !t.dead && !t.leaked);
    this.projectiles = this.projectiles.filter((p) => !p.dead);

    if (this.waveDone) {
      this.waveActive = false;
      this.clearOrdnance();
      this.events.push({ type: 'waveEnd' });
    }
  }

  private makeTank(kind: UnitKind, dist: number, targetTower?: TowerKind): Tank {
    const def = UNITS[kind];
    const p = pointAt(dist);
    const phase = def.phase;
    return {
      id: id(), kind, hp: def.hp, maxHp: def.hp, dist,
      pos: p.pos, angle: p.angle, turretAngle: p.angle, slow: { mult: 1, t: 0 },
      attackCd: def.attack ? def.attack.cooldown * 0.5 : 0,
      attackCd2: def.attack2 ? def.attack2.cooldown * 0.5 : 0,
      interceptCd: def.intercept ? def.intercept.cooldown * 0.5 : 0,
      phaseT: phase ? Math.random() * phase.visibleT : 0,
      ghosted: false,
      freezeT: 0,
      preferredTower: targetTower,
      flash: 0, dead: false, leaked: false,
    };
  }

  private stepTanks(dt: number) {
    for (const tank of this.tanks) {
      const def = UNITS[tank.kind];
      tank.flash = Math.max(0, tank.flash - dt * 3);

      // iced solid: no moving, no shooting — still very shootable
      if (tank.freezeT > 0) {
        tank.freezeT -= dt;
        continue;
      }

      if (tank.slow.t > 0) tank.slow.t -= dt;
      else tank.slow.mult = 1;

      // phantom: pulse in and out of reality
      if (def.phase) {
        const cycle = def.phase.visibleT + def.phase.hiddenT;
        tank.phaseT = (tank.phaseT + dt) % cycle;
        tank.ghosted = tank.phaseT >= def.phase.visibleT;
      }

      const speed = def.speed * tank.slow.mult;

      if (def.offroad) {
        // straight across country, path be damned
        if (tank.offStart === undefined) tank.offStart = distance(tank.pos, BASE_POS);
        const a = Math.atan2(BASE_POS.y - tank.pos.y, BASE_POS.x - tank.pos.x);
        tank.angle = a;
        tank.pos = { x: tank.pos.x + Math.cos(a) * speed * dt, y: tank.pos.y + Math.sin(a) * speed * dt };
        const remaining = distance(tank.pos, BASE_POS);
        tank.dist = PATH_LENGTH * Math.max(0, 1 - remaining / Math.max(1, tank.offStart));
        if (remaining < 36) {
          tank.leaked = true;
          this.events.push({ type: 'leak', damage: def.leakDamage, kind: tank.kind });
          this.events.push({ type: 'sfx', name: 'leak' });
          continue;
        }
      } else {
        tank.dist += speed * dt;
        const p = pointAt(tank.dist);
        tank.pos = p.pos;
        tank.angle = p.angle;
        if (tank.dist >= PATH_LENGTH) {
          tank.leaked = true;
          this.events.push({ type: 'leak', damage: def.leakDamage, kind: tank.kind });
          this.events.push({ type: 'sfx', name: 'leak' });
          continue;
        }
      }

      // laser tank: lock one tower and burn it down
      if (def.lockon) {
        let target = tank.lockTower !== undefined
          ? this.towers.find((tw) => tw.id === tank.lockTower)
          : undefined;
        if (!target) {
          let bd = def.lockon.range;
          for (const tw of this.towers) {
            const d = distance(tw.pos, tank.pos);
            if (d < bd) { bd = d; target = tw; }
          }
          tank.lockTower = target?.id;
        }
        if (target) {
          tank.turretAngle = Math.atan2(target.pos.y - tank.pos.y, target.pos.x - tank.pos.x);
          if (distance(target.pos, tank.pos) <= def.lockon.range) {
            this.hurtTower(target, def.lockon.dps * dt, target.pos, false, false);
          }
        }
        continue;
      }

      // turret tracks the nearest tower (menacing even on unarmed tanks)
      let aim = tank.angle;
      let bestD = def.attack ? def.attack.range + 60 : 260;
      for (const tw of this.towers) {
        const d = distance(tw.pos, tank.pos);
        if (d < bestD) { bestD = d; aim = Math.atan2(tw.pos.y - tank.pos.y, tw.pos.x - tank.pos.x); }
      }
      tank.turretAngle = lerpAngle(tank.turretAngle, aim, dt * 6);

      // tank fire vs towers
      if (def.attack) {
        tank.attackCd -= dt;
        if (tank.attackCd <= 0 && this.fireTankWeapon(tank, def.attack)) {
          tank.attackCd = def.attack.cooldown;
        }
      }
      if (def.attack2) {
        tank.attackCd2 -= dt;
        if (tank.attackCd2 <= 0 && this.fireTankWeapon(tank, def.attack2)) {
          tank.attackCd2 = def.attack2.cooldown;
        }
      }

      // flak/behemoth: shoot defender missiles out of the sky
      if (def.intercept) {
        tank.interceptCd -= dt;
        if (tank.interceptCd <= 0) {
          const threat = this.projectiles.find(
            (pr) => (pr.kind === 'missile' || pr.kind === 'bigmissile') && !pr.dead
              && distance(pr.pos, tank.pos) <= def.intercept!.range,
          );
          if (threat) {
            tank.interceptCd = def.intercept.cooldown;
            this.projectiles.push({
              id: id(), kind: 'tankinterceptor',
              pos: { ...tank.pos }, vel: this.aimVel(tank.pos, threat.pos, 430),
              speed: 430, turnRate: 10, targetProjectile: threat.id,
              damage: 0, life: 2, dead: false,
            });
            this.events.push({ type: 'sfx', name: 'flak' });
          }
        }
      }
    }

    // mechanics: field repairs for nearby allies
    for (const m of this.tanks) {
      const heal = UNITS[m.kind].healAura;
      if (!heal || m.dead) continue;
      for (const t of this.tanks) {
        if (t.dead || t.id === m.id || t.hp >= t.maxHp) continue;
        if (distance(t.pos, m.pos) <= heal.radius) {
          t.hp = Math.min(t.maxHp, t.hp + heal.hps * dt);
        }
      }
    }
  }

  /** fire one volley at towers in range; seekers only ever shoot their chosen prey */
  private fireTankWeapon(tank: Tank, atk: AttackSpec): boolean {
    let pool = this.towers;
    if (tank.preferredTower) pool = pool.filter((tw) => tw.kind === tank.preferredTower);
    const targets = pool.filter((tw) => distance(tw.pos, tank.pos) <= atk.range);
    if (targets.length === 0) return false;
    targets.sort((a, b) => distance(a.pos, tank.pos) - distance(b.pos, tank.pos));
    const big = atk.projectile === 'bigmissile';
    const isMissile = atk.projectile !== 'bullet';
    for (let v = 0; v < atk.volley; v++) {
      const tw = targets[v % targets.length];
      this.projectiles.push({
        id: id(),
        kind: big ? 'tankbigmissile' : isMissile ? 'tankmissile' : 'tankbullet',
        pos: { ...tank.pos },
        vel: this.aimVel(tank.pos, tw.pos, big ? 150 : isMissile ? 180 : 420, isMissile ? (v - 1) * 0.5 : 0.06),
        speed: big ? 200 : isMissile ? 180 : 420,
        turnRate: big ? 3 : isMissile ? 4.5 : 9,
        targetTower: tw.id, damage: atk.damage, splash: atk.splash,
        effect: atk.type ? { type: atk.type, duration: atk.duration ?? 1.5 } : undefined,
        life: big ? 7 : 5, dead: false,
        wobblePhase: isMissile ? Math.random() * 7 : undefined,
      });
    }
    this.events.push({ type: 'sfx', name: big ? 'bertha_launch' : isMissile ? 'tanklaunch' : 'tankgun' });
    return true;
  }

  private aimVel(from: Vec, to: Vec, speed: number, spread = 0): Vec {
    const a = Math.atan2(to.y - from.y, to.x - from.x) + spread * (Math.random() - 0.5);
    return { x: Math.cos(a) * speed, y: Math.sin(a) * speed };
  }

  /** damage multiplier from shield auras near this tank */
  private shieldMult(tank: Tank): number {
    let m = 1;
    for (const s of this.tanks) {
      const def = UNITS[s.kind];
      if (def.aura && !s.dead && s.id !== tank.id && distance(s.pos, tank.pos) <= def.aura.radius) {
        m = Math.min(m, def.aura.damageMult);
      }
    }
    return m;
  }

  /** damage multiplier from bastion domes covering this tower */
  private towerShieldMult(tw: Tower): number {
    let m = 1;
    for (const b of this.towers) {
      if (b.kind !== 'bastion') continue;
      const lvl = TOWERS.bastion.levels[b.level - 1];
      if (distance(b.pos, tw.pos) <= lvl.range) m = Math.min(m, lvl.shieldMult ?? 0.7);
    }
    return m;
  }

  /** tank fire hitting a tower: bastions soften it, upgrades make a fatter target */
  private hurtTower(tw: Tower, dmg: number, hitPos: Vec, big: boolean, fx = true) {
    const vuln = 1 + (tw.level - 1) * TOWER_LEVEL_VULN;
    tw.hp -= dmg * vuln * this.towerShieldMult(tw);
    if (tw.hp <= 0) {
      this.towers = this.towers.filter((x) => x.id !== tw.id);
      this.sorties = this.sorties.filter((s) => s.towerId !== tw.id);
      this.events.push({ type: 'towerDestroyed', pos: { ...tw.pos }, towerId: tw.id });
      this.events.push({ type: 'explosion', pos: { ...tw.pos }, size: 50 });
      this.events.push({ type: 'sfx', name: 'towerdown' });
    } else if (!fx) {
      // silent (laser burn) — no per-tick explosion spam
    } else if (big) {
      this.events.push({ type: 'explosion', pos: { ...hitPos }, size: 22 });
      this.events.push({ type: 'sfx', name: 'tankhit' });
    } else {
      this.events.push({ type: 'explosion', pos: { ...hitPos }, size: 9 });
    }
  }

  private targetable(tank: Tank): boolean {
    return !tank.dead && !tank.ghosted;
  }

  private pickTarget(tw: Tower, range: number): Tank | undefined {
    let best: Tank | undefined;
    let bestDist = -1;
    let bestTaunt: Tank | undefined;
    let bestTauntDist = -1;
    for (const tank of this.tanks) {
      if (!this.targetable(tank)) continue;
      if (distance(tank.pos, tw.pos) > range) continue;
      const taunt = UNITS[tank.kind].taunt;
      if (taunt && tank.dist > bestTauntDist) { bestTaunt = tank; bestTauntDist = tank.dist; }
      if (tank.dist > bestDist) { best = tank; bestDist = tank.dist; }
    }
    return bestTaunt ?? best;
  }

  /** beam upkeep for lockon/citadel: hold the victim until it's gone */
  private laserBurn(tw: Tower, range: number, dps: number, dt: number, beam: 1 | 2) {
    const cur = beam === 1 ? tw.lockTank : tw.lockTank2;
    let target = cur !== undefined ? this.tanks.find((t) => t.id === cur && !t.dead) : undefined;
    if (!target) {
      const exclude = beam === 1 ? tw.lockTank2 : tw.lockTank;
      let bd = -1;
      for (const t of this.tanks) {
        if (!this.targetable(t) || t.id === exclude) continue;
        if (distance(t.pos, tw.pos) > range) continue;
        if (t.dist > bd) { bd = t.dist; target = t; }
      }
      if (beam === 1) tw.lockTank = target?.id;
      else tw.lockTank2 = target?.id;
    }
    if (!target) return;
    if (beam === 1) tw.angle = Math.atan2(target.pos.y - tw.pos.y, target.pos.x - tw.pos.x);
    if (!target.ghosted && distance(target.pos, tw.pos) <= range) {
      this.damageTank(target, dps * dt);
    }
  }

  private stepTowers(dt: number) {
    for (const tw of this.towers) {
      tw.recoil = Math.max(0, tw.recoil - dt * 4);
      tw.rechargeT = Math.max(0, tw.rechargeT - dt);
      if (tw.disableT > 0) { tw.disableT -= dt; continue; } // hexed: lights out
      if (tw.suppressT > 0) tw.suppressT -= dt;

      const def = TOWERS[tw.kind];
      const lvl = def.levels[tw.level - 1];
      const rate = tw.suppressT > 0 ? 0.4 : 1;

      if (tw.kind === 'bastion') continue; // pure support: the dome is passive

      if (tw.kind === 'medic') {
        // patch up neighbors (not itself — someone has to hold the wrench)
        const heal = lvl.heal ?? 7;
        for (const other of this.towers) {
          if (other.id === tw.id || other.hp >= other.maxHp) continue;
          if (distance(other.pos, tw.pos) <= lvl.range) {
            other.hp = Math.min(other.maxHp, other.hp + heal * dt);
          }
        }
        continue;
      }

      if (tw.kind === 'lockon') {
        this.laserBurn(tw, lvl.range, (lvl.dps ?? 30) * rate, dt, 1);
        continue;
      }

      if (tw.kind === 'citadel') {
        // slow field
        const pct = lvl.slowPct ?? 0.25;
        for (const t of this.tanks) {
          if (t.dead || distance(t.pos, tw.pos) > lvl.range) continue;
          const resist = UNITS[t.kind].slowResist ?? 0;
          t.slow.mult = Math.min(t.slow.mult, 1 - pct * (1 - resist));
          t.slow.t = Math.max(t.slow.t, 0.3);
        }
        // twin lasers
        this.laserBurn(tw, lvl.range, (lvl.dps ?? 25) * rate, dt, 1);
        this.laserBurn(tw, lvl.range, (lvl.dps ?? 25) * rate, dt, 2);
        // missile volleys
        tw.cooldown -= dt * rate;
        if (tw.cooldown <= 0) {
          const target = this.pickTarget(tw, lvl.range);
          if (target) {
            tw.cooldown = lvl.cooldown;
            tw.recoil = 1;
            const volley = lvl.volley ?? 3;
            for (let i = 0; i < volley; i++) {
              const a = tw.angle + (i - (volley - 1) / 2) * 0.4;
              this.projectiles.push({
                id: id(), kind: 'missile',
                pos: { x: tw.pos.x + Math.cos(a) * 16, y: tw.pos.y + Math.sin(a) * 16 },
                vel: { x: Math.cos(a) * 180, y: Math.sin(a) * 180 },
                speed: 330, turnRate: 6.5, targetTank: target.id,
                damage: lvl.damage, life: 3.5, dead: false,
                wobblePhase: Math.random() * 7,
              });
            }
            this.events.push({ type: 'sfx', name: 'swarm' });
          }
        }
        continue;
      }

      if (tw.kind === 'garage') {
        // field the motor pool
        const want = lvl.tanks ?? 1;
        const mine = this.sorties.filter((s) => s.towerId === tw.id);
        for (let i = mine.length; i < want; i++) {
          this.sorties.push({
            id: id(), towerId: tw.id,
            pos: { x: tw.pos.x + (i - (want - 1) / 2) * 14, y: tw.pos.y + 6 },
            angle: -Math.PI / 2, turretAngle: -Math.PI / 2, cooldown: 0.3 * (i + 1),
          });
        }
        continue;
      }

      tw.cooldown -= dt * rate;
      if (tw.cooldown > 0) {
        // keep tracking current target for visual continuity
        const t = this.pickTarget(tw, lvl.range);
        if (t) tw.angle = lerpAngle(tw.angle, Math.atan2(t.pos.y - tw.pos.y, t.pos.x - tw.pos.x), dt * 10);
        continue;
      }

      // hive: launch drones while any are docked and recharged
      if (tw.kind === 'hive') {
        const maxDrones = lvl.drones ?? 3;
        if (tw.dronesOut < maxDrones && tw.rechargeT <= 0) {
          const target = this.pickTarget(tw, lvl.range);
          if (target) {
            tw.dronesOut += 1;
            tw.cooldown = lvl.cooldown;
            tw.recoil = 1;
            tw.angle = Math.atan2(target.pos.y - tw.pos.y, target.pos.x - tw.pos.x);
            this.projectiles.push({
              id: id(), kind: 'drone',
              pos: { ...tw.pos }, vel: this.aimVel(tw.pos, target.pos, 240),
              speed: 240, turnRate: 8, targetTank: target.id,
              damage: lvl.damage, life: 30, dead: false,
              stingsLeft: lvl.stings ?? 4, droneState: 'hunt', homeTower: tw.id,
              wobblePhase: Math.random() * 7,
            });
            this.events.push({ type: 'sfx', name: 'drone' });
          }
        }
        continue;
      }

      // minelayer: keep the road seeded
      if (tw.kind === 'minelayer') {
        const cap = lvl.maxMines ?? 3;
        const own = this.mines.filter((m) => m.towerId === tw.id).length;
        if (own < cap && this.placeMine(tw, lvl.range, lvl.damage, lvl.splash ?? 55)) {
          tw.cooldown = lvl.cooldown;
          tw.recoil = 1;
          this.events.push({ type: 'sfx', name: 'minelay' });
        } else {
          tw.cooldown = 0.4;
        }
        continue;
      }

      // cryo: prefer tanks that aren't already iced
      if (tw.kind === 'cryo') {
        let target: Tank | undefined;
        let bd = -1;
        for (const t of this.tanks) {
          if (!this.targetable(t) || t.freezeT > 0.3) continue;
          if (distance(t.pos, tw.pos) > lvl.range) continue;
          if (t.dist > bd) { bd = t.dist; target = t; }
        }
        if (!target) target = this.pickTarget(tw, lvl.range);
        if (target) {
          tw.cooldown = lvl.cooldown;
          tw.recoil = 1;
          tw.angle = Math.atan2(target.pos.y - tw.pos.y, target.pos.x - tw.pos.x);
          this.projectiles.push({
            id: id(), kind: 'cryoshot',
            pos: { x: tw.pos.x + Math.cos(tw.angle) * 20, y: tw.pos.y + Math.sin(tw.angle) * 20 },
            vel: this.aimVel(tw.pos, target.pos, 640),
            speed: 640, turnRate: 9, targetTank: target.id,
            damage: 0, freezeDur: lvl.freezeDur ?? 1.2, life: 1.5, dead: false,
          });
          this.events.push({ type: 'sfx', name: 'cryo' });
        }
        continue;
      }

      // CIWS: intercept enemy missiles first
      if (tw.kind === 'ciws') {
        const threat = this.projectiles.find(
          (p) => (p.kind === 'tankmissile' || p.kind === 'tankbigmissile') && !p.dead
            && distance(p.pos, tw.pos) <= lvl.range,
        );
        if (threat) {
          tw.cooldown = 1 / (lvl.interceptPerSec ?? 4);
          tw.angle = Math.atan2(threat.pos.y - tw.pos.y, threat.pos.x - tw.pos.x);
          tw.recoil = 1;
          this.projectiles.push({
            id: id(), kind: 'interceptor',
            pos: { ...tw.pos }, vel: this.aimVel(tw.pos, threat.pos, 420),
            speed: 420, turnRate: 10, targetProjectile: threat.id,
            damage: 0, life: 2, dead: false,
          });
          this.events.push({ type: 'sfx', name: 'ciws' });
          continue;
        }
      }

      if (tw.kind === 'emp') {
        // pulse if anything in range — an area effect, so even phantoms feel it
        const any = this.tanks.some((t) => !t.dead && distance(t.pos, tw.pos) <= lvl.range);
        if (any) {
          tw.cooldown = lvl.cooldown;
          tw.recoil = 1;
          for (const t of this.tanks) {
            if (t.dead || distance(t.pos, tw.pos) > lvl.range) continue;
            const resist = UNITS[t.kind].slowResist ?? 0;
            const pct = (lvl.slowPct ?? 0.4) * (1 - resist);
            t.slow.mult = Math.min(t.slow.mult, 1 - pct);
            t.slow.t = Math.max(t.slow.t, lvl.slowDur ?? 1.6);
          }
          this.events.push({ type: 'pulse', pos: { ...tw.pos }, radius: lvl.range });
          this.events.push({ type: 'sfx', name: 'emp' });
        }
        continue;
      }

      const target = this.pickTarget(tw, lvl.range);
      if (!target) continue;
      tw.angle = Math.atan2(target.pos.y - tw.pos.y, target.pos.x - tw.pos.x);
      tw.cooldown = lvl.cooldown;
      tw.recoil = 1;
      const muzzle: Vec = {
        x: tw.pos.x + Math.cos(tw.angle) * 24,
        y: tw.pos.y + Math.sin(tw.angle) * 24,
      };
      this.events.push({ type: 'muzzle', pos: muzzle, angle: tw.angle });

      switch (tw.kind) {
        case 'gun':
        case 'ciws': // fallback ground fire
          this.projectiles.push({
            id: id(), kind: 'bullet', pos: muzzle,
            vel: this.aimVel(tw.pos, target.pos, 560),
            speed: 560, turnRate: 7, targetTank: target.id,
            damage: lvl.damage, life: 1.5, dead: false,
          });
          this.events.push({ type: 'sfx', name: 'gun' });
          break;
        case 'railgun':
          this.projectiles.push({
            id: id(), kind: 'railshot', pos: muzzle,
            vel: this.aimVel(tw.pos, target.pos, 900),
            speed: 900, turnRate: 12, targetTank: target.id,
            damage: lvl.damage, life: 1.2, dead: false,
          });
          this.events.push({ type: 'sfx', name: 'rail' });
          break;
        case 'sprayer':
          this.projectiles.push({
            id: id(), kind: 'minimissile', pos: muzzle,
            vel: this.aimVel(tw.pos, target.pos, 240, 0.5),
            speed: 380, turnRate: 7.5, targetTank: target.id,
            damage: lvl.damage, life: 2.5, dead: false,
            wobblePhase: Math.random() * 7,
          });
          this.events.push({ type: 'sfx', name: 'spray' });
          break;
        case 'arc': {
          // chain lightning: instant, jumps to nearby targets with falloff
          const chains = lvl.chains ?? 3;
          const chainRange = lvl.chainRange ?? 90;
          const pts: Vec[] = [{ ...tw.pos }];
          const hit = new Set<number>();
          let cur: Tank | undefined = target;
          let dmg = lvl.damage;
          while (cur && hit.size < chains) {
            hit.add(cur.id);
            pts.push({ ...cur.pos });
            this.damageTank(cur, dmg);
            dmg *= 0.75;
            let next: Tank | undefined;
            let bd = chainRange;
            for (const t2 of this.tanks) {
              if (!this.targetable(t2) || hit.has(t2.id)) continue;
              const d = distance(t2.pos, cur.pos);
              if (d < bd) { bd = d; next = t2; }
            }
            cur = next;
          }
          this.events.push({ type: 'zap', points: pts });
          this.events.push({ type: 'sfx', name: 'zap' });
          break;
        }
        case 'swarm': {
          const volley = lvl.volley ?? 6;
          for (let i = 0; i < volley; i++) {
            const a = tw.angle + (i / volley) * Math.PI * 2;
            this.projectiles.push({
              id: id(), kind: 'missile',
              pos: { x: tw.pos.x + Math.cos(a) * 14, y: tw.pos.y + Math.sin(a) * 14 },
              vel: { x: Math.cos(a) * 160, y: Math.sin(a) * 160 },
              speed: 330, turnRate: 6.5, targetTank: target.id,
              damage: lvl.damage, life: 3.5, dead: false,
              wobblePhase: Math.random() * 7,
            });
          }
          this.events.push({ type: 'sfx', name: 'swarm' });
          break;
        }
        case 'bertha':
          this.projectiles.push({
            id: id(), kind: 'bigmissile', pos: { ...tw.pos },
            vel: this.aimVel(tw.pos, target.pos, 60),
            speed: 230, turnRate: 2.6, targetTank: target.id,
            damage: lvl.damage, splash: lvl.splash, life: 6, dead: false,
            wobblePhase: Math.random() * 7,
          });
          this.events.push({ type: 'sfx', name: 'bertha_launch' });
          break;
      }
    }
  }

  /** garage tanks: drive off-road at the wave, shoot, fall back when it's quiet */
  private stepSorties(dt: number) {
    for (const s of this.sorties) {
      const garage = this.towers.find((t) => t.id === s.towerId);
      if (!garage) continue; // pruned next step
      const lvl = TOWERS.garage.levels[garage.level - 1];
      s.cooldown = Math.max(0, s.cooldown - dt);

      // furthest-along tank inside the garage's operating radius
      let target: Tank | undefined;
      let bd = -1;
      for (const t of this.tanks) {
        if (!this.targetable(t)) continue;
        if (distance(t.pos, garage.pos) > lvl.range) continue;
        if (t.dist > bd) { bd = t.dist; target = t; }
      }

      if (target) {
        const d = distance(target.pos, s.pos);
        const a = Math.atan2(target.pos.y - s.pos.y, target.pos.x - s.pos.x);
        s.turretAngle = lerpAngle(s.turretAngle, a, dt * 8);
        if (d > SORTIE_FIRE_RANGE * 0.8) {
          s.angle = lerpAngle(s.angle, a, dt * 5);
          s.pos = { x: s.pos.x + Math.cos(s.angle) * SORTIE_SPEED * dt, y: s.pos.y + Math.sin(s.angle) * SORTIE_SPEED * dt };
        }
        if (d <= SORTIE_FIRE_RANGE && s.cooldown <= 0 && garage.disableT <= 0) {
          s.cooldown = lvl.cooldown;
          this.projectiles.push({
            id: id(), kind: 'bullet',
            pos: { ...s.pos }, vel: this.aimVel(s.pos, target.pos, 520),
            speed: 520, turnRate: 8, targetTank: target.id,
            damage: lvl.damage, life: 1.5, dead: false,
          });
          this.events.push({ type: 'sfx', name: 'gun' });
        }
      } else {
        // roll home and park
        const d = distance(garage.pos, s.pos);
        if (d > 10) {
          const a = Math.atan2(garage.pos.y - s.pos.y, garage.pos.x - s.pos.x);
          s.angle = lerpAngle(s.angle, a, dt * 5);
          s.turretAngle = lerpAngle(s.turretAngle, a, dt * 5);
          s.pos = { x: s.pos.x + Math.cos(s.angle) * SORTIE_SPEED * dt, y: s.pos.y + Math.sin(s.angle) * SORTIE_SPEED * dt };
        }
      }
    }
  }

  private placeMine(tw: Tower, range: number, damage: number, splash: number): boolean {
    for (let attempt = 0; attempt < 10; attempt++) {
      const d = Math.random() * PATH_LENGTH;
      const p = pointAt(d).pos;
      if (distance(p, tw.pos) > range) continue;
      if (this.mines.some((m) => distance(m.pos, p) < 30)) continue;
      this.mines.push({ id: id(), towerId: tw.id, pos: p, damage, splash });
      return true;
    }
    return false;
  }

  private stepMines() {
    for (const mine of [...this.mines]) {
      const victim = this.tanks.find(
        (t) => !t.dead && distance(t.pos, mine.pos) < 16 + UNITS[t.kind].radius * 0.4,
      );
      if (!victim) continue;
      this.mines = this.mines.filter((m) => m.id !== mine.id);
      this.events.push({ type: 'explosion', pos: { ...mine.pos }, size: 34 });
      this.events.push({ type: 'sfx', name: 'mine' });
      for (const t of this.tanks) {
        if (t.dead) continue;
        const d = distance(t.pos, mine.pos);
        if (d <= mine.splash) {
          const falloff = 1 - 0.5 * (d / mine.splash);
          this.damageTank(t, mine.damage * falloff);
        }
      }
    }
  }

  private stepDrone(p: Projectile, dt: number) {
    const home = this.towers.find((x) => x.id === p.homeTower);
    if (!home) { p.dead = true; return; } // hive sold or destroyed: bees disperse

    if (p.stingCd !== undefined && p.stingCd > 0) p.stingCd -= dt;

    if (p.droneState === 'hunt') {
      let target = this.tanks.find((x) => x.id === p.targetTank && this.targetable(x));
      if (!target) {
        // retarget the furthest-along tank inside the hive's patrol leash
        const lvl = TOWERS.hive.levels[home.level - 1];
        const leash = lvl.range + 80;
        let bestDist = -1;
        for (const t of this.tanks) {
          if (!this.targetable(t)) continue;
          if (distance(t.pos, home.pos) > leash) continue;
          if (t.dist > bestDist) { bestDist = t.dist; target = t; }
        }
        if (target) p.targetTank = target.id;
        else { p.droneState = 'return'; return; }
      }
      // after a sting, peel away briefly — bees bounce, they don't drill
      const fleeing = p.stingCd !== undefined && p.stingCd > 0;
      const desired = fleeing
        ? Math.atan2(p.pos.y - target.pos.y, p.pos.x - target.pos.x)
        : Math.atan2(target.pos.y - p.pos.y, target.pos.x - p.pos.x);
      this.steer(p, desired, dt, 0.3);
      if (!fleeing && distance(target.pos, p.pos) < 9 + UNITS[target.kind].radius * 0.4) {
        this.damageTank(target, p.damage);
        this.events.push({ type: 'explosion', pos: { ...p.pos }, size: 6 });
        this.events.push({ type: 'sfx', name: 'sting' });
        p.stingCd = 0.45;
        p.stingsLeft = (p.stingsLeft ?? 1) - 1;
        if (p.stingsLeft <= 0) p.droneState = 'return';
      }
    } else {
      // fly home, dock, recharge
      this.steer(p, Math.atan2(home.pos.y - p.pos.y, home.pos.x - p.pos.x), dt, 0.15);
      if (distance(home.pos, p.pos) < 14) {
        p.dead = true;
        home.dronesOut = Math.max(0, home.dronesOut - 1);
        home.rechargeT = Math.max(home.rechargeT, 0.6);
      }
    }
    p.pos = { x: p.pos.x + p.vel.x * dt, y: p.pos.y + p.vel.y * dt };
  }

  private steer(p: Projectile, desired: number, dt: number, wobbleAmp: number) {
    const cur = Math.atan2(p.vel.y, p.vel.x);
    let na = lerpAngle(cur, desired, Math.min(1, p.turnRate * dt));
    if (p.wobblePhase !== undefined) {
      p.wobblePhase += dt * 14;
      na += Math.sin(p.wobblePhase) * wobbleAmp;
    }
    const spd = Math.min(p.speed, Math.hypot(p.vel.x, p.vel.y) + p.speed * 2.2 * dt);
    p.vel = { x: Math.cos(na) * spd, y: Math.sin(na) * spd };
  }

  private stepProjectiles(dt: number) {
    for (const p of this.projectiles) {
      p.life -= dt;
      if (p.life <= 0) { p.dead = true; continue; }

      if (p.kind === 'drone') { this.stepDrone(p, dt); continue; }

      // homing steering
      let targetPos: Vec | undefined;
      if (p.targetTank !== undefined) {
        const t = this.tanks.find((x) => x.id === p.targetTank && this.targetable(x));
        if (t) targetPos = t.pos;
        else if (p.kind === 'missile' || p.kind === 'bigmissile' || p.kind === 'minimissile') {
          // retarget whoever is closest to the base
          const nt = this.furthestTank();
          if (nt) { p.targetTank = nt.id; targetPos = nt.pos; }
        }
      } else if (p.targetTower !== undefined) {
        const tw = this.towers.find((x) => x.id === p.targetTower);
        if (tw) targetPos = tw.pos; else p.dead = true;
      } else if (p.targetProjectile !== undefined) {
        const tp = this.projectiles.find((x) => x.id === p.targetProjectile && !x.dead);
        if (tp) targetPos = tp.pos; else p.dead = true;
      }

      if (targetPos) {
        const desired = Math.atan2(targetPos.y - p.pos.y, targetPos.x - p.pos.x);
        const cur = Math.atan2(p.vel.y, p.vel.x);
        let na = lerpAngle(cur, desired, Math.min(1, p.turnRate * dt));
        // wobble for small missiles
        if (p.wobblePhase !== undefined && p.kind !== 'bigmissile' && p.kind !== 'tankbigmissile') {
          p.wobblePhase += dt * 14;
          na += Math.sin(p.wobblePhase) * 0.12;
        }
        const spd = Math.min(p.speed, Math.hypot(p.vel.x, p.vel.y) + p.speed * 2.2 * dt);
        p.vel = { x: Math.cos(na) * spd, y: Math.sin(na) * spd };
      }

      p.pos = { x: p.pos.x + p.vel.x * dt, y: p.pos.y + p.vel.y * dt };

      // collisions
      if (p.targetProjectile !== undefined) {
        const tp = this.projectiles.find((x) => x.id === p.targetProjectile && !x.dead);
        if (tp && distance(tp.pos, p.pos) < 14) {
          tp.dead = true; p.dead = true;
          this.events.push({ type: 'intercept', pos: { ...p.pos } });
          this.events.push({ type: 'sfx', name: 'intercept' });
        }
        continue;
      }

      if (p.targetTower !== undefined) {
        const tw = this.towers.find((x) => x.id === p.targetTower);
        if (tw && distance(tw.pos, p.pos) < 20) {
          p.dead = true;
          if (p.effect?.type === 'suppress') {
            tw.suppressT = Math.max(tw.suppressT, p.effect.duration);
          } else if (p.effect?.type === 'disable') {
            tw.disableT = Math.max(tw.disableT, p.effect.duration);
            this.events.push({ type: 'sfx', name: 'hex' });
          }
          if (p.splash) {
            // lobber shell: the whole block feels it
            this.events.push({ type: 'shockwave', pos: { ...p.pos }, radius: p.splash });
            this.events.push({ type: 'explosion', pos: { ...p.pos }, size: 40 });
            this.events.push({ type: 'sfx', name: 'bertha_hit' });
            for (const t2 of [...this.towers]) {
              const d = distance(t2.pos, p.pos);
              if (d <= p.splash) {
                const falloff = 1 - 0.5 * (d / p.splash);
                this.hurtTower(t2, p.damage * falloff, t2.pos, false, t2.id === tw.id);
              }
            }
          } else {
            this.hurtTower(tw, p.damage, p.pos, p.kind === 'tankmissile');
          }
        }
        continue;
      }

      if (p.targetTank !== undefined) {
        const t = this.tanks.find((x) => x.id === p.targetTank && this.targetable(x));
        const hitR = p.kind === 'bigmissile' ? 18 : 12;
        if (t && distance(t.pos, p.pos) < hitR + UNITS[t.kind].radius * 0.5) {
          p.dead = true;
          if (p.freezeDur) {
            t.freezeT = Math.max(t.freezeT, p.freezeDur);
            this.events.push({ type: 'pulse', pos: { ...t.pos }, radius: 26 });
            this.events.push({ type: 'sfx', name: 'freeze' });
            continue;
          }
          if (p.splash) {
            this.events.push({ type: 'shockwave', pos: { ...p.pos }, radius: p.splash });
            this.events.push({ type: 'explosion', pos: { ...p.pos }, size: 46 });
            this.events.push({ type: 'sfx', name: 'bertha_hit' });
            for (const t2 of this.tanks) {
              if (t2.dead) continue; // splash hits even ghosted phantoms
              const d = distance(t2.pos, p.pos);
              if (d <= p.splash) {
                const falloff = 1 - 0.5 * (d / p.splash);
                this.damageTank(t2, p.damage * falloff);
              }
            }
          } else {
            this.damageTank(t, p.damage);
            this.events.push({
              type: 'explosion', pos: { ...p.pos },
              size: p.kind === 'missile' ? 14 : p.kind === 'minimissile' ? 9 : p.kind === 'railshot' ? 20 : 8,
            });
            if (p.kind === 'missile') this.events.push({ type: 'sfx', name: 'missile_hit' });
          }
        }
      }
    }
  }

  private furthestTank(): Tank | undefined {
    let best: Tank | undefined;
    let bd = -1;
    for (const t of this.tanks) {
      if (!this.targetable(t)) continue;
      if (t.dist > bd) { bd = t.dist; best = t; }
    }
    return best;
  }

  private damageTank(tank: Tank, dmg: number) {
    tank.hp -= dmg * this.shieldMult(tank);
    tank.flash = 0.2;
    if (tank.hp <= 0 && !tank.dead) {
      tank.dead = true;
      const def = UNITS[tank.kind];

      // boomer: take the neighborhood with it
      if (def.deathBlast) {
        const blast = def.deathBlast;
        this.events.push({ type: 'shockwave', pos: { ...tank.pos }, radius: blast.radius });
        this.events.push({ type: 'sfx', name: 'boomer' });
        for (const tw of [...this.towers]) {
          const d = distance(tw.pos, tank.pos);
          if (d <= blast.radius) {
            const falloff = 1 - 0.5 * (d / blast.radius);
            this.hurtTower(tw, blast.damage * falloff, tw.pos, true);
          }
        }
      }

      // splitter: the grudge lives on
      if (def.splitInto) {
        for (let i = 0; i < def.splitInto.count; i++) {
          const d = Math.max(0, tank.dist - 4 - i * 14);
          this.spawnLater.push(this.makeTank(def.splitInto.kind, d));
        }
      }

      this.events.push({ type: 'kill', pos: { ...tank.pos }, bounty: def.bounty, kind: tank.kind });
      this.events.push({
        type: 'explosion', pos: { ...tank.pos },
        size: def.radius * 2.2,
      });
      this.events.push({ type: 'sfx', name: def.tonnage >= 6 ? 'bigdeath' : 'death' });
    }
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}
