import {
  Application, Container, Graphics, Sprite, Text, Texture,
} from 'pixi.js';
import {
  ACCENT, BASE_POS, PATH_POINTS, PATH_WIDTH, SLOTS, SLOT_SIZE, TOWERS, UNITS, WORLD_H, WORLD_W,
} from './config';
import { pointAt, PATH_LENGTH } from './path';
import { sketcher } from './sketch';
import type { Sim } from './sim';
import type { SimEvent, TowerKind, UnitKind, Vec } from './types';

// ---- whiteboard marker palette ----
const PAPER = 0xfcfcf9;
const GRID = 0x9db5d4; // graph-paper blue
const INK = 0x32353a;
const INK_LIGHT = 0x7a7f87;
const BLUE = 0x2b6cb8; // defender marker
const BLUE_DARK = 0x1c4e87;
const RED = 0xd24a43; // attacker marker
const RED_DARK = 0x9b2f2a;
const GREEN = 0x2f9e57; // money
const SMOKE = 0x8a8f96;

const FONT = "'Chalkboard SE', 'Comic Sans MS', 'Marker Felt', 'Segoe Print', sans-serif";

interface Fx {
  obj: Container;
  age: number;
  life: number;
  update: (fx: Fx, dt: number) => void;
}

interface Particle {
  sp: Sprite;
  vx: number; vy: number;
  life: number; maxLife: number;
  scaleDecay: number;
}

export class Renderer {
  app = new Application();
  world = new Container();
  boardLayer = new Container();
  auraG = new Graphics();
  craterG = new Container();
  towerLayer = new Container();
  tankLayer = new Container();
  statusG = new Graphics();
  projLayer = new Container();
  fxLayer = new Container();
  rangeG = new Graphics();

  private tankViews = new Map<number, { root: Container; body: Sprite; turret: Sprite; hp: Container; hpFg: Sprite }>();
  private towerViews = new Map<number, { root: Container; turret: Sprite; hp: Container; hpFg: Sprite; level: number; kind: TowerKind; age: number }>();
  private projViews = new Map<number, { sp: Sprite; trailAcc: number }>();
  private fx: Fx[] = [];
  private particles: Particle[] = [];
  private particlePool: Sprite[] = [];
  private textPool: Text[] = [];
  private tex = new Map<string, Texture>();
  private softTex!: Texture;
  private bannerOD!: Text;
  private bannerJam!: Text;

  private shake = 0;
  private scale = 1;
  private offX = 0;
  private offY = 0;

  onSlotTap: (slot: number) => void = () => {};
  onTowerTap: (towerId: number, slot: number) => void = () => {};
  onBoardTap: () => void = () => {};
  onFrame: (deltaMS: number) => void = () => {};

  private sim!: Sim;
  private mounted = false;

  async mount(el: HTMLElement, sim: Sim) {
    this.sim = sim;
    if (this.mounted) {
      el.appendChild(this.app.canvas);
      this.resize(el);
      return;
    }
    this.mounted = true;
    await this.app.init({
      background: PAPER,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      resizeTo: el,
    });
    el.appendChild(this.app.canvas);

    this.world.addChild(
      this.boardLayer, this.craterG, this.auraG, this.rangeG,
      this.towerLayer, this.tankLayer, this.statusG, this.projLayer, this.fxLayer,
    );
    this.app.stage.addChild(this.world);
    this.buildSoftTexture();
    this.buildBoard();
    this.buildBanners();

    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = { contains: () => true };
    this.app.stage.on('pointertap', (e) => {
      const p = this.world.toLocal(e.global);
      // tower first, then slot
      let bestSlot = -1;
      let bestD = Infinity;
      SLOTS.forEach((s, i) => {
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        if (d < SLOT_SIZE * 0.75 && d < bestD) { bestD = d; bestSlot = i; }
      });
      if (bestSlot >= 0) {
        const tw = this.sim.towerAt(bestSlot);
        if (tw) this.onTowerTap(tw.id, bestSlot);
        else this.onSlotTap(bestSlot);
      } else {
        this.onBoardTap();
      }
    });

    const ro = new ResizeObserver(() => this.resize(el));
    ro.observe(el);
    this.resize(el);

    this.app.ticker.add((tk) => {
      this.onFrame(tk.deltaMS);
      this.update(tk.deltaMS / 1000);
    });
  }

  resize(el: HTMLElement) {
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    this.scale = Math.min(w / WORLD_W, h / WORLD_H);
    this.offX = (w - WORLD_W * this.scale) / 2;
    this.offY = (h - WORLD_H * this.scale) / 2;
    this.world.scale.set(this.scale);
    this.world.position.set(this.offX, this.offY);
  }

  worldToScreen(pos: Vec): Vec {
    const rect = this.app.canvas.getBoundingClientRect();
    return {
      x: rect.left + this.offX + pos.x * this.scale,
      y: rect.top + this.offY + pos.y * this.scale,
    };
  }

  // ---------------- static board ----------------
  private buildSoftTexture() {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const g2 = cv.getContext('2d')!;
    const grad = g2.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = grad;
    g2.fillRect(0, 0, 64, 64);
    this.softTex = Texture.from(cv);
  }

  private buildBoard() {
    const b = new Graphics();
    const sk = sketcher('board');

    // graph-paper grid (kept clean — the paper is printed, the game is drawn)
    for (let x = 0; x <= WORLD_W; x += 64) { b.moveTo(x, 0); b.lineTo(x, WORLD_H); }
    for (let y = 0; y <= WORLD_H; y += 64) { b.moveTo(0, y); b.lineTo(WORLD_W, y); }
    b.stroke({ width: 1, color: GRID, alpha: 0.22 });

    // path bed: a pencil-shaded road
    b.moveTo(PATH_POINTS[0].x, PATH_POINTS[0].y);
    for (let i = 1; i < PATH_POINTS.length; i++) b.lineTo(PATH_POINTS[i].x, PATH_POINTS[i].y);
    b.stroke({ width: PATH_WIDTH, color: 0xeceae2, alpha: 1, cap: 'round', join: 'round' });

    // hand-inked road edges, segment by segment (messy corners are the style)
    for (let i = 0; i < PATH_POINTS.length - 1; i++) {
      const a = PATH_POINTS[i];
      const c = PATH_POINTS[i + 1];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = (-dy / len) * (PATH_WIDTH / 2);
      const py = (dx / len) * (PATH_WIDTH / 2);
      sk.line(b, a.x + px, a.y + py, c.x + px, c.y + py, { color: INK, width: 2.5, jitter: 1.6, overshoot: 5 });
      sk.line(b, a.x - px, a.y - py, c.x - px, c.y - py, { color: INK, width: 2.5, jitter: 1.6, overshoot: 5 });
    }

    // direction chevrons — the attacker's route, sketched in red
    for (let d = 60; d < PATH_LENGTH - 70; d += 90) {
      const { pos, angle } = pointAt(d);
      const s = 8;
      const a1 = angle - 2.5;
      const a2 = angle + 2.5;
      const tip = { x: pos.x + Math.cos(angle) * s * 1.2, y: pos.y + Math.sin(angle) * s * 1.2 };
      sk.line(b, pos.x + Math.cos(a1) * s, pos.y + Math.sin(a1) * s, tip.x, tip.y, { color: RED, width: 3, alpha: 0.4, jitter: 0.8, overshoot: 1, passes: 1 });
      sk.line(b, tip.x, tip.y, pos.x + Math.cos(a2) * s, pos.y + Math.sin(a2) * s, { color: RED, width: 3, alpha: 0.4, jitter: 0.8, overshoot: 1, passes: 1 });
    }

    // empty lots: dashed pencil squares with a little blue "+" (build here)
    for (const s of SLOTS) {
      const h = SLOT_SIZE / 2;
      dashedRect(b, sk, s.x - h, s.y - h, SLOT_SIZE, SLOT_SIZE, { color: INK_LIGHT, width: 2, alpha: 0.75, jitter: 1 });
      sk.line(b, s.x - 7, s.y, s.x + 7, s.y, { color: BLUE, width: 2.5, alpha: 0.45, jitter: 0.6, overshoot: 1, passes: 1 });
      sk.line(b, s.x, s.y - 7, s.x, s.y + 7, { color: BLUE, width: 2.5, alpha: 0.45, jitter: 0.6, overshoot: 1, passes: 1 });
    }

    // base plinth at the path's end — double-boxed, with a heart worth defending
    const bp = BASE_POS;
    b.roundRect(bp.x - 58, bp.y - 58, 116, 116, 10).fill({ color: PAPER });
    sk.rect(b, bp.x - 58, bp.y - 58, 116, 116, { color: INK, width: 3, jitter: 1.8, overshoot: 6 });
    sk.rect(b, bp.x - 42, bp.y - 42, 84, 84, { color: INK_LIGHT, width: 2, jitter: 1.4, overshoot: 3 });
    drawHeart(b, bp.x, bp.y, 1.5, RED);

    this.boardLayer.addChild(b);
  }

  private buildBanners() {
    const mk = (y: number) => {
      const t = new Text({
        text: '',
        style: { fontFamily: FONT, fontSize: 24, fontWeight: '700', fill: RED },
      });
      t.anchor.set(0.5);
      t.position.set(WORLD_W / 2, y);
      t.rotation = -0.015;
      t.visible = false;
      this.world.addChild(t);
      return t;
    };
    this.bannerOD = mk(28);
    this.bannerJam = mk(60);
  }

  // ---------------- procedural textures ----------------
  private texture(key: string, draw: (g: Graphics) => void, res = 3): Texture {
    let t = this.tex.get(key);
    if (!t) {
      const g = new Graphics();
      draw(g);
      t = this.app.renderer.generateTexture({ target: g, resolution: res });
      this.tex.set(key, t);
      g.destroy();
    }
    return t;
  }

  // tank hulls point +x; turrets are separate sprites that aim
  private tankTexture(kind: UnitKind): Texture {
    return this.texture(`tank_${kind}`, (g) => {
      const sk = sketcher(`tank_${kind}`);
      const def = UNITS[kind];
      const r = def.radius;
      const body = { color: RED, alpha: 0.9 };
      const line = { color: RED_DARK, width: 2.2, jitter: 1, overshoot: 2 };
      // treads in ink
      g.roundRect(-r, -r * 0.95, r * 2, r * 0.55, r * 0.25).fill({ color: INK, alpha: 0.92 });
      g.roundRect(-r, r * 0.4, r * 2, r * 0.55, r * 0.25).fill({ color: INK, alpha: 0.92 });
      switch (kind) {
        case 'scout':
          g.circle(0, 0, r * 0.78).fill(body);
          sk.circle(g, 0, 0, r * 0.78, line);
          break;
        case 'brawler':
          g.roundRect(-r * 0.95, -r * 0.7, r * 1.9, r * 1.4, r * 0.35).fill(body);
          sk.rect(g, -r * 0.95, -r * 0.7, r * 1.9, r * 1.4, line);
          break;
        case 'hunter':
          g.roundRect(-r * 0.95, -r * 0.7, r * 1.9, r * 1.4, r * 0.3).fill(body);
          sk.rect(g, -r * 0.95, -r * 0.7, r * 1.9, r * 1.4, line);
          // missile pods on the back
          g.roundRect(-r * 1.05, -r * 0.55, r * 0.7, r * 0.42, 3).fill({ color: RED_DARK, alpha: 0.95 });
          g.roundRect(-r * 1.05, r * 0.13, r * 0.7, r * 0.42, 3).fill({ color: RED_DARK, alpha: 0.95 });
          break;
        case 'heavy':
          g.roundRect(-r, -r * 0.78, r * 2, r * 1.56, r * 0.3).fill(body);
          sk.rect(g, -r, -r * 0.78, r * 2, r * 1.56, line);
          g.roundRect(-r * 0.7, -r * 0.5, r * 1.2, r, r * 0.2).fill({ color: RED_DARK, alpha: 0.85 });
          break;
        case 'boomer':
          // a rolling bomb with hazard stripes
          g.circle(0, 0, r * 0.85).fill(body);
          sk.circle(g, 0, 0, r * 0.85, line);
          sk.line(g, -r * 0.5, -r * 0.35, r * 0.1, r * 0.55, { color: INK, width: 2.6, jitter: 0.7, overshoot: 1, passes: 1 });
          sk.line(g, -r * 0.1, -r * 0.55, r * 0.5, r * 0.35, { color: INK, width: 2.6, jitter: 0.7, overshoot: 1, passes: 1 });
          break;
        case 'splitter':
          g.roundRect(-r * 0.95, -r * 0.72, r * 1.9, r * 1.44, r * 0.3).fill(body);
          sk.rect(g, -r * 0.95, -r * 0.72, r * 1.9, r * 1.44, line);
          // the seam it will crack open along
          dashedLine(g, sk, 0, -r * 0.72, 0, r * 0.72, { color: INK, width: 2.2, jitter: 0.6 });
          g.circle(-r * 0.45, 0, r * 0.2).fill({ color: RED_DARK });
          g.circle(r * 0.45, 0, r * 0.2).fill({ color: RED_DARK });
          break;
        case 'mite':
          g.circle(0, 0, r * 0.8).fill(body);
          sk.circle(g, 0, 0, r * 0.8, { ...line, width: 1.8 });
          break;
        case 'flak':
          g.roundRect(-r * 0.95, -r * 0.7, r * 1.9, r * 1.4, r * 0.3).fill(body);
          sk.rect(g, -r * 0.95, -r * 0.7, r * 1.9, r * 1.4, line);
          // upward-angled launcher rails
          g.roundRect(-r * 0.7, -r * 0.5, r * 1.1, r * 0.28, 2).fill({ color: INK, alpha: 0.95 });
          g.roundRect(-r * 0.7, r * 0.22, r * 1.1, r * 0.28, 2).fill({ color: INK, alpha: 0.95 });
          break;
        case 'phantom':
          // half-sketched — like someone started erasing it
          g.roundRect(-r * 0.9, -r * 0.68, r * 1.8, r * 1.36, r * 0.4).fill({ color: RED, alpha: 0.5 });
          dashedRect(g, sk, -r * 0.9, -r * 0.68, r * 1.8, r * 1.36, { color: RED_DARK, width: 2, jitter: 0.8 });
          sk.line(g, -r * 0.5, -r * 0.15, r * 0.5, -r * 0.15, { color: PAPER, width: 2.4, jitter: 1.6, overshoot: 1, passes: 1 });
          sk.line(g, -r * 0.5, r * 0.2, r * 0.5, r * 0.2, { color: PAPER, width: 2.4, jitter: 1.6, overshoot: 1, passes: 1 });
          break;
        case 'mechanic':
          g.roundRect(-r * 0.95, -r * 0.72, r * 1.9, r * 1.44, r * 0.3).fill(body);
          sk.rect(g, -r * 0.95, -r * 0.72, r * 1.9, r * 1.44, line);
          // field-repair cross
          g.roundRect(-r * 0.16, -r * 0.45, r * 0.32, r * 0.9, 2).fill({ color: PAPER, alpha: 0.92 });
          g.roundRect(-r * 0.45, -r * 0.16, r * 0.9, r * 0.32, 2).fill({ color: PAPER, alpha: 0.92 });
          break;
        case 'decoy':
          // a fake tank: pale fill, dashed outline, bullseye — clearly cardboard
          g.roundRect(-r * 0.9, -r * 0.68, r * 1.8, r * 1.36, r * 0.4).fill({ color: RED, alpha: 0.35 });
          dashedRect(g, sk, -r * 0.9, -r * 0.68, r * 1.8, r * 1.36, { color: RED_DARK, width: 2, jitter: 0.8 });
          sk.circle(g, 0, 0, r * 0.55, { color: RED_DARK, width: 2.4, jitter: 0.8 });
          g.circle(0, 0, r * 0.22).fill({ color: RED_DARK });
          break;
        case 'shield':
          g.poly(hexPts(r * 0.95)).fill(body);
          sk.poly(g, hexPts(r * 0.95), true, line);
          sk.circle(g, 0, 0, r * 0.55, { color: 0xf4c7c3, width: 3, jitter: 0.9 });
          break;
        case 'mortar':
          g.roundRect(-r * 0.95, -r * 0.72, r * 1.9, r * 1.44, r * 0.3).fill(body);
          sk.rect(g, -r * 0.95, -r * 0.72, r * 1.9, r * 1.44, line);
          g.roundRect(-r * 0.9, -r * 0.32, r * 1.1, r * 0.64, r * 0.3).fill({ color: RED_DARK, alpha: 0.9 });
          break;
        case 'goliath':
          g.poly(octPts(r)).fill(body);
          sk.poly(g, octPts(r), true, { ...line, width: 2.8 });
          g.roundRect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2, r * 0.25).fill({ color: RED_DARK, alpha: 0.85 });
          break;
        case 'leviathan':
          g.roundRect(-r, -r * 0.8, r * 2, r * 1.6, r * 0.35).fill(body);
          sk.rect(g, -r, -r * 0.8, r * 2, r * 1.6, { ...line, width: 3 });
          g.poly(hexPts(r * 0.72)).fill({ color: RED_DARK, alpha: 0.85 });
          sk.poly(g, hexPts(r * 0.72), true, { color: INK, width: 2, jitter: 0.9 });
          break;
      }
    });
  }

  private tankTurretTexture(kind: UnitKind): Texture {
    return this.texture(`tankturret_${kind}`, (g) => {
      const sk = sketcher(`tankturret_${kind}`);
      const r = UNITS[kind].radius;
      // invisible pad so the texture is centered on the pivot (anchor 0.5)
      g.circle(0, 0, r * 2.15).fill({ color: 0xffffff, alpha: 0.003 });
      const barrel = { color: INK, alpha: 0.95 };
      const cap = { color: RED_DARK, alpha: 0.95 };
      switch (kind) {
        case 'scout':
          g.roundRect(0, -2.5, r * 1.6, 5, 2.5).fill(barrel);
          g.circle(0, 0, r * 0.34).fill(cap);
          break;
        case 'brawler':
          g.circle(0, 0, r * 0.52).fill(cap);
          sk.circle(g, 0, 0, r * 0.52, { color: INK, width: 1.8, jitter: 0.7, passes: 1 });
          g.roundRect(0, -3, r * 1.75, 6, 3).fill(barrel);
          break;
        case 'hunter':
          g.circle(0, 0, r * 0.42).fill(cap);
          g.roundRect(0, -2.5, r * 1.55, 5, 2.5).fill(barrel);
          break;
        case 'heavy':
          g.circle(0, 0, r * 0.52).fill(cap);
          sk.circle(g, 0, 0, r * 0.52, { color: INK, width: 1.8, jitter: 0.7, passes: 1 });
          g.roundRect(0, -4, r * 1.9, 8, 4).fill(barrel);
          break;
        case 'decoy':
          g.circle(0, 0, r * 0.2).fill(cap);
          break;
        case 'boomer':
          // stubby fuse, permanently lit
          g.roundRect(0, -1.8, r * 0.7, 3.6, 1.8).fill({ color: INK });
          g.circle(r * 0.7, 0, 2.6).fill({ color: 0xffc46b });
          break;
        case 'splitter':
          g.circle(0, 0, r * 0.24).fill(cap);
          break;
        case 'mite':
          g.circle(0, 0, r * 0.3).fill({ color: INK });
          break;
        case 'flak':
          // twin AA barrels
          g.circle(0, 0, r * 0.45).fill(cap);
          g.roundRect(0, -r * 0.32, r * 1.5, 3.4, 1.7).fill(barrel);
          g.roundRect(0, r * 0.32 - 3.4, r * 1.5, 3.4, 1.7).fill(barrel);
          break;
        case 'phantom':
          g.circle(0, 0, r * 0.2).fill({ color: RED_DARK, alpha: 0.6 });
          break;
        case 'mechanic':
          // a little wrench arm
          g.roundRect(0, -2, r * 1.1, 4, 2).fill(barrel);
          sk.circle(g, r * 1.1, 0, r * 0.22, { color: INK, width: 2, jitter: 0.5, passes: 1 });
          break;
        case 'shield':
          g.circle(0, 0, r * 0.28).fill(cap);
          break;
        case 'mortar':
          g.circle(0, 0, r * 0.44).fill(barrel);
          g.roundRect(0, -4.5, r * 0.95, 9, 4.5).fill(barrel);
          g.circle(0, 0, r * 0.27).fill(cap);
          break;
        case 'goliath':
          g.roundRect(-r * 0.45, -r * 0.45, r * 0.9, r * 0.9, r * 0.2).fill(cap);
          sk.rect(g, -r * 0.45, -r * 0.45, r * 0.9, r * 0.9, { color: INK, width: 1.8, jitter: 0.8, passes: 1 });
          g.roundRect(0, -r * 0.42, r * 1.85, 7, 3.5).fill(barrel);
          g.roundRect(0, r * 0.42 - 7, r * 1.85, 7, 3.5).fill(barrel);
          g.circle(0, 0, r * 0.3).fill({ color: RED });
          break;
        case 'leviathan':
          g.poly(hexPts(r * 0.5)).fill(cap);
          sk.poly(g, hexPts(r * 0.5), true, { color: INK, width: 1.8, jitter: 0.8, passes: 1 });
          g.roundRect(0, -r * 0.34, r * 2.0, 8, 4).fill(barrel);
          g.roundRect(0, r * 0.34 - 8, r * 2.0, 8, 4).fill(barrel);
          sk.circle(g, 0, 0, r * 0.28, { color: 0xf4c7c3, width: 3, jitter: 0.8 });
          break;
      }
    });
  }

  // tower bases (static) and turrets (rotate, point +x)
  private towerBaseTexture(kind: TowerKind, level: number): Texture {
    return this.texture(`base_${kind}_${level}`, (g) => {
      const sk = sketcher(`base_${kind}_${level}`);
      g.circle(0, 0, 23).fill({ color: PAPER });
      sk.circle(g, 0, 0, 23, { color: INK, width: 2.4, jitter: 1.2 });
      sk.dashedCircle(g, 0, 0, 16.5, { color: BLUE, width: 1.6, alpha: 0.6, jitter: 0.6 }, 7, 6);
      // level tally marks below the base
      for (let i = 0; i < level; i++) {
        const x = (i - (level - 1) / 2) * 7;
        sk.line(g, x, 25, x - 2, 33, { color: INK, width: 2.4, jitter: 0.6, overshoot: 1, passes: 1 });
      }
    });
  }

  private turretTexture(kind: TowerKind, level: number): Texture {
    return this.texture(`turret_${kind}_${level}`, (g) => {
      const sk = sketcher(`turret_${kind}_${level}`);
      const s = 1 + (level - 1) * 0.12;
      // invisible pad so the texture is centered on the pivot (anchor 0.5)
      g.circle(0, 0, 42 * s).fill({ color: 0xffffff, alpha: 0.003 });
      const body = { color: BLUE, alpha: 0.92 };
      const line = { color: BLUE_DARK, width: 2, jitter: 0.9 };
      const barrel = { color: INK, alpha: 0.95 };
      switch (kind) {
        case 'gun':
          g.circle(0, 0, 11 * s).fill(body);
          sk.circle(g, 0, 0, 11 * s, line);
          g.roundRect(4, -3 * s, 22 * s, 6 * s, 3 * s).fill(barrel);
          g.circle(0, 0, 4.5 * s).fill({ color: BLUE_DARK });
          break;
        case 'swarm':
          g.roundRect(-11 * s, -11 * s, 22 * s, 22 * s, 6).fill(body);
          sk.rect(g, -11 * s, -11 * s, 22 * s, 22 * s, line);
          for (const [px, py] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
            g.circle(px * s, py * s, 3.4 * s).fill({ color: BLUE_DARK });
            g.circle(px * s, py * s, 1.6 * s).fill({ color: PAPER });
          }
          break;
        case 'railgun':
          g.circle(0, 0, 10 * s).fill(body);
          sk.circle(g, 0, 0, 10 * s, line);
          g.roundRect(2, -2.5 * s, 34 * s, 5 * s, 2.5).fill(barrel);
          g.roundRect(18 * s, -4.5 * s, 8 * s, 9 * s, 3).fill({ color: BLUE, alpha: 0.95 });
          sk.rect(g, 18 * s, -4.5 * s, 8 * s, 9 * s, { ...line, width: 1.6 });
          break;
        case 'emp':
          g.circle(0, 0, 12 * s).fill(body);
          sk.circle(g, 0, 0, 12 * s, line);
          sk.circle(g, 0, 0, 7 * s, { color: PAPER, width: 2.4, jitter: 0.7 });
          g.circle(0, 0, 3 * s).fill({ color: PAPER });
          break;
        case 'bertha':
          g.roundRect(-13 * s, -10 * s, 26 * s, 20 * s, 7).fill(body);
          sk.rect(g, -13 * s, -10 * s, 26 * s, 20 * s, line);
          g.roundRect(-4, -6.5 * s, 30 * s, 13 * s, 6.5 * s).fill(barrel);
          g.circle(26 * s - 4, 0, 6.5 * s).fill({ color: BLUE_DARK });
          break;
        case 'ciws':
          g.circle(0, 0, 10 * s).fill(body);
          sk.circle(g, 0, 0, 10 * s, line);
          g.roundRect(2, -5 * s, 18 * s, 3.2 * s, 1.6).fill(barrel);
          g.roundRect(2, -1.6 * s, 20 * s, 3.2 * s, 1.6).fill(barrel);
          g.roundRect(2, 1.8 * s, 18 * s, 3.2 * s, 1.6).fill(barrel);
          break;
        case 'arc': {
          g.circle(0, 0, 11 * s).fill(body);
          sk.circle(g, 0, 0, 11 * s, line);
          // tesla prongs
          g.roundRect(6 * s, -9 * s, 9 * s, 3 * s, 1.5).fill(barrel);
          g.roundRect(6 * s, 6 * s, 9 * s, 3 * s, 1.5).fill(barrel);
          // a scrawled bolt across the coil
          sk.poly(g, [-5 * s, -4 * s, 1 * s, -1 * s, -2 * s, 1 * s, 5 * s, 4.5 * s], false,
            { color: PAPER, width: 2.4, jitter: 0.5, overshoot: 0.5, passes: 1 });
          break;
        }
        case 'hive': {
          g.roundRect(-11 * s, -11 * s, 22 * s, 22 * s, 7).fill({ color: BLUE, alpha: 0.92 });
          sk.rect(g, -11 * s, -11 * s, 22 * s, 22 * s, line);
          // honeycomb cells
          for (const [px, py] of [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]]) {
            g.poly(hexPts(3.4 * s).map((v, i) => v + (i % 2 === 0 ? px * s : py * s))).fill({ color: PAPER, alpha: 0.85 });
          }
          // entrance
          g.circle(9 * s, 0, 2.6 * s).fill({ color: INK });
          break;
        }
        case 'bastion': {
          // a squat shield dome — no barrel, just bulk
          g.circle(0, 0, 15 * s).fill({ color: BLUE, alpha: 0.85 });
          sk.circle(g, 0, 0, 15 * s, { ...line, width: 2.6 });
          sk.circle(g, 0, 0, 9.5 * s, { color: PAPER, width: 2, jitter: 0.7, passes: 1, alpha: 0.8 });
          sk.line(g, -15 * s, 0, 15 * s, 0, { color: BLUE_DARK, width: 2, jitter: 0.8, overshoot: 1, passes: 1 });
          break;
        }
        case 'medic': {
          g.circle(0, 0, 12 * s).fill(body);
          sk.circle(g, 0, 0, 12 * s, line);
          // repair cross
          g.roundRect(-2.4 * s, -7.5 * s, 4.8 * s, 15 * s, 2).fill({ color: PAPER, alpha: 0.92 });
          g.roundRect(-7.5 * s, -2.4 * s, 15 * s, 4.8 * s, 2).fill({ color: PAPER, alpha: 0.92 });
          break;
        }
      }
    });
  }

  private projTexture(kind: string): Texture {
    return this.texture(`proj_${kind}`, (g) => {
      switch (kind) {
        case 'bullet':
          g.roundRect(-5, -1.8, 10, 3.6, 1.8).fill({ color: INK });
          break;
        case 'railshot':
          g.roundRect(-14, -2, 28, 4, 2).fill({ color: BLUE_DARK });
          g.roundRect(-14, -0.7, 28, 1.4, 0.7).fill({ color: 0xcfe0f4, alpha: 0.9 });
          break;
        case 'missile':
          g.roundRect(-6, -2.6, 12, 5.2, 2.6).fill({ color: BLUE });
          g.poly([6, -2.6, 10, 0, 6, 2.6]).fill({ color: INK });
          g.poly([-6, -2.6, -9.5, -4.6, -6, 0]).fill({ color: BLUE_DARK });
          g.poly([-6, 2.6, -9.5, 4.6, -6, 0]).fill({ color: BLUE_DARK });
          break;
        case 'tankbullet':
          g.roundRect(-5, -1.8, 10, 3.6, 1.8).fill({ color: RED_DARK });
          break;
        case 'tankmissile':
          g.roundRect(-6, -2.6, 12, 5.2, 2.6).fill({ color: RED });
          g.poly([6, -2.6, 10, 0, 6, 2.6]).fill({ color: INK });
          g.poly([-6, -2.6, -9.5, -4.6, -6, 0]).fill({ color: RED_DARK });
          g.poly([-6, 2.6, -9.5, 4.6, -6, 0]).fill({ color: RED_DARK });
          break;
        case 'bigmissile':
          g.roundRect(-16, -6, 32, 12, 6).fill({ color: BLUE });
          g.poly([16, -6, 25, 0, 16, 6]).fill({ color: INK });
          g.poly([-16, -6, -24, -11, -16, 0]).fill({ color: BLUE_DARK });
          g.poly([-16, 6, -24, 11, -16, 0]).fill({ color: BLUE_DARK });
          g.roundRect(-8, -6, 4, 12, 2).fill({ color: PAPER, alpha: 0.8 });
          break;
        case 'interceptor':
          g.roundRect(-4, -1.4, 8, 2.8, 1.4).fill({ color: BLUE_DARK });
          break;
        case 'tankinterceptor':
          g.roundRect(-4, -1.4, 8, 2.8, 1.4).fill({ color: RED_DARK });
          break;
        case 'drone':
          // a fat little bee, nose +x
          g.circle(-1, 0, 4).fill({ color: BLUE_DARK });
          g.roundRect(-2.2, -3.6, 2, 7.2, 1).fill({ color: PAPER, alpha: 0.85 }); // stripe
          g.circle(-3.5, -4, 2.6).fill({ color: 0xcfe0f4, alpha: 0.8 }); // wings
          g.circle(-3.5, 4, 2.6).fill({ color: 0xcfe0f4, alpha: 0.8 });
          g.poly([3, -1.4, 6.5, 0, 3, 1.4]).fill({ color: INK }); // stinger
          break;
      }
    });
  }

  // ---------------- selection / range UI ----------------
  setRangePreview(items: { pos: Vec; range: number }[]) {
    this.rangeG.clear();
    for (const it of items) {
      const sk = sketcher(`range_${Math.round(it.pos.x)}_${Math.round(it.pos.y)}_${it.range}`);
      this.rangeG.circle(it.pos.x, it.pos.y, it.range).fill({ color: BLUE, alpha: 0.05 });
      sk.dashedCircle(this.rangeG, it.pos.x, it.pos.y, it.range, { color: BLUE, width: 2.5, alpha: 0.55, jitter: 1.4 }, 16, 11);
    }
  }

  // ---------------- events ----------------
  handleEvents(events: SimEvent[]) {
    for (const ev of events) {
      switch (ev.type) {
        case 'explosion': this.explosion(ev.pos, ev.size); break;
        case 'shockwave': this.shockwave(ev.pos, ev.radius); this.shake = Math.max(this.shake, 14); break;
        case 'pulse': this.pulse(ev.pos, ev.radius); break;
        case 'zap': this.zapFx(ev.points); break;
        case 'muzzle': this.muzzle(ev.pos, ev.angle); break;
        case 'intercept': this.explosion(ev.pos, 12); break;
        case 'kill':
          this.bountyText(ev.pos, ev.bounty);
          this.deathMark(ev.pos, UNITS[ev.kind].radius);
          if (UNITS[ev.kind].tonnage >= 6) this.shake = Math.max(this.shake, 10);
          break;
        case 'leak': this.leakFlash(); break;
        default: break;
      }
    }
  }

  private ringFx(pos: Vec, fromR: number, toR: number, life: number, color: number, width = 3, alpha = 0.8) {
    const g = new Graphics();
    g.position.set(pos.x, pos.y);
    this.fxLayer.addChild(g);
    this.fx.push({
      obj: g, age: 0, life,
      update: (fx) => {
        const t = fx.age / fx.life;
        const r = fromR + (toR - fromR) * easeOut(t);
        const gg = fx.obj as Graphics;
        gg.clear();
        gg.circle(0, 0, r).stroke({ width: width * (1 - t * 0.7), color, alpha: alpha * (1 - t) });
      },
    });
  }

  private explosion(pos: Vec, size: number) {
    this.ringFx(pos, size * 0.3, size * 1.4, 0.35, ACCENT, 3.5, 0.9);
    // hot orange core that gutters out fast
    this.spawnParticle(pos, 0, 0, 0.16, size / 26, ACCENT, 0.95);
    const n = Math.min(14, Math.round(size / 3));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * size * 4;
      const hot = i % 3 === 0;
      this.spawnParticle(
        pos, Math.cos(a) * sp, Math.sin(a) * sp,
        0.35 + Math.random() * 0.3, size / 38,
        hot ? ACCENT : SMOKE,
      );
    }
    if (size > 36) {
      this.shake = Math.max(this.shake, size / 6);
      this.scorch(pos, size * 0.55);
    }
  }

  /** hatched scorch mark left by big explosions, fades out */
  private scorch(pos: Vec, r: number) {
    const g = new Graphics();
    const sk = sketcher(`scorch_${Math.round(pos.x * 7 + pos.y)}`);
    sk.hatchCircle(g, 0, 0, r, { color: INK, width: 2, alpha: 0.3, jitter: 1.6 }, 7);
    sk.circle(g, 0, 0, r, { color: INK, width: 1.8, alpha: 0.3, jitter: 2.2, passes: 1 });
    g.position.set(pos.x, pos.y);
    this.craterG.addChild(g);
    this.fx.push({
      obj: g, age: 0, life: 5,
      update: (fx) => { fx.obj.alpha = 1 - fx.age / fx.life; },
    });
  }

  /** little red scribble where a tank died */
  private deathMark(pos: Vec, r: number) {
    const g = new Graphics();
    const sk = sketcher(`death_${Math.round(pos.x * 13 + pos.y)}`);
    sk.scribble(g, 0, 0, r * 0.9, { color: RED_DARK, width: 2.2, alpha: 0.5 });
    g.position.set(pos.x, pos.y);
    this.craterG.addChild(g);
    this.fx.push({
      obj: g, age: 0, life: 4,
      update: (fx) => { fx.obj.alpha = 0.9 * (1 - fx.age / fx.life); },
    });
  }

  private shockwave(pos: Vec, radius: number) {
    this.ringFx(pos, 8, radius * 1.25, 0.5, INK, 6, 0.9);
    this.ringFx(pos, 4, radius * 0.9, 0.55, ACCENT, 5, 0.95);
    this.spawnParticle(pos, 0, 0, 0.22, radius / 30, ACCENT, 0.95);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.3;
      const sp = 80 + Math.random() * 220;
      const hot = i % 3 === 0;
      this.spawnParticle(pos, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + Math.random() * 0.4, 1.2, hot ? ACCENT : SMOKE);
    }
  }

  /** hand-scrawled lightning along the chain — random per bolt, gone in a blink */
  private zapFx(points: Vec[]) {
    if (points.length < 2) return;
    const g = new Graphics();
    const jag = (a: Vec, b: Vec) => {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const n = Math.max(3, Math.round(len / 18));
      const px = -(b.y - a.y) / len;
      const py = (b.x - a.x) / len;
      g.moveTo(a.x, a.y);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const off = (Math.random() - 0.5) * 14;
        g.lineTo(a.x + (b.x - a.x) * t + px * off, a.y + (b.y - a.y) * t + py * off);
      }
      g.lineTo(b.x, b.y);
    };
    for (let i = 0; i < points.length - 1; i++) jag(points[i], points[i + 1]);
    g.stroke({ width: 3.5, color: BLUE, alpha: 0.9, cap: 'round', join: 'round' });
    for (let i = 0; i < points.length - 1; i++) jag(points[i], points[i + 1]);
    g.stroke({ width: 1.4, color: 0xdcebfb, alpha: 0.95, cap: 'round', join: 'round' });
    this.fxLayer.addChild(g);
    this.fx.push({
      obj: g, age: 0, life: 0.18,
      update: (fx) => { fx.obj.alpha = 1 - fx.age / fx.life; },
    });
    for (let i = 1; i < points.length; i++) {
      this.spawnParticle(points[i], 0, 0, 0.15, 0.5, BLUE, 0.8);
    }
  }

  private pulse(pos: Vec, radius: number) {
    this.ringFx(pos, 10, radius, 0.55, BLUE, 3, 0.5);
    this.ringFx(pos, 4, radius * 0.7, 0.4, BLUE, 2, 0.35);
  }

  private muzzle(pos: Vec, angle: number) {
    this.spawnParticle(pos, Math.cos(angle) * 60, Math.sin(angle) * 60, 0.12, 0.55, 0xffc46b, 1);
  }

  private leakFlash() {
    this.shake = Math.max(this.shake, 12);
    const g = new Graphics();
    g.circle(0, 0, 74).fill({ color: ACCENT, alpha: 0.55 });
    g.position.set(BASE_POS.x, BASE_POS.y);
    this.fxLayer.addChild(g);
    this.fx.push({
      obj: g, age: 0, life: 0.55,
      update: (fx) => {
        fx.obj.alpha = 1 - fx.age / fx.life;
        fx.obj.scale.set(1 + (fx.age / fx.life) * 0.5);
      },
    });
    this.ringFx(BASE_POS, 60, 130, 0.6, ACCENT, 5, 0.9);
  }

  private bountyText(pos: Vec, bounty: number) {
    let t = this.textPool.pop();
    if (!t) {
      t = new Text({
        text: '', style: {
          fontFamily: FONT,
          fontSize: 17, fontWeight: '700', fill: GREEN,
        },
      });
      t.anchor.set(0.5);
    }
    t.text = `+${bounty}`;
    t.alpha = 1;
    t.rotation = ((pos.x * 7 + pos.y) % 10) / 10 * 0.24 - 0.12;
    t.position.set(pos.x, pos.y - 14);
    this.fxLayer.addChild(t);
    const tt = t;
    this.fx.push({
      obj: tt, age: 0, life: 0.8,
      update: (fx) => {
        fx.obj.y -= 0.6;
        fx.obj.alpha = 1 - (fx.age / fx.life) ** 1.5;
      },
    });
  }

  private spawnParticle(pos: Vec, vx: number, vy: number, life: number, scale: number, tint: number, alpha = 0.85) {
    if (this.particles.length > 650) return;
    let sp = this.particlePool.pop();
    if (!sp) {
      sp = new Sprite(this.softTex);
      sp.anchor.set(0.5);
    }
    sp.tint = tint;
    sp.alpha = alpha;
    sp.scale.set(scale);
    sp.position.set(pos.x, pos.y);
    this.fxLayer.addChild(sp);
    this.particles.push({ sp, vx, vy, life, maxLife: life, scaleDecay: 0.6 });
  }

  // ---------------- per-frame sync ----------------
  private update(dt: number) {
    const sim = this.sim;

    // tanks
    const liveTanks = new Set<number>();
    for (const tank of sim.tanks) {
      liveTanks.add(tank.id);
      let v = this.tankViews.get(tank.id);
      if (!v) {
        const root = new Container();
        const body = new Sprite(this.tankTexture(tank.kind));
        body.anchor.set(0.5);
        const turret = new Sprite(this.tankTurretTexture(tank.kind));
        turret.anchor.set(0.5);
        root.addChild(body, turret);
        const hp = new Container();
        const bg = new Sprite(Texture.WHITE);
        bg.tint = 0xc9ced6; bg.alpha = 0.6;
        bg.width = 30; bg.height = 4;
        bg.position.set(-15, 0);
        const fg = new Sprite(Texture.WHITE);
        fg.tint = RED_DARK;
        fg.width = 30; fg.height = 4;
        fg.position.set(-15, 0);
        hp.addChild(bg, fg);
        hp.position.set(0, -UNITS[tank.kind].radius - 12);
        hp.visible = false;
        root.addChild(hp);
        this.tankLayer.addChild(root);
        v = { root, body, turret, hp, hpFg: fg };
        this.tankViews.set(tank.id, v);
      }
      v.root.position.set(tank.pos.x, tank.pos.y);
      v.body.rotation = tank.angle;
      v.turret.rotation = tank.turretAngle;
      // phantoms fade to a faint pencil ghost while untargetable
      v.root.alpha = tank.ghosted ? 0.18 : 1;
      const frac = tank.hp / tank.maxHp;
      v.hp.visible = frac < 1 && !tank.ghosted;
      v.hpFg.width = 30 * Math.max(0, frac);
      // damage flash
      const flashA = tank.flash > 0 ? 0.55 + 0.45 * (1 - tank.flash / 0.2) : 1;
      v.body.alpha = flashA;
      v.turret.alpha = flashA;
    }
    for (const [tid, v] of this.tankViews) {
      if (!liveTanks.has(tid)) {
        v.root.destroy({ children: true });
        this.tankViews.delete(tid);
      }
    }

    // auras: tank shields (red), tank healers (green), bastion domes (blue), medics (green)
    this.auraG.clear();
    for (const tank of sim.tanks) {
      const aura = UNITS[tank.kind].aura;
      if (aura) {
        const sk = sketcher(`aura_${tank.id}`);
        this.auraG.circle(tank.pos.x, tank.pos.y, aura.radius).fill({ color: RED, alpha: 0.05 });
        sk.dashedCircle(this.auraG, tank.pos.x, tank.pos.y, aura.radius, { color: RED, width: 2, alpha: 0.45, jitter: 0 }, 12, 9);
      }
      const heal = UNITS[tank.kind].healAura;
      if (heal) {
        const sk = sketcher(`heal_${tank.id}`);
        sk.dashedCircle(this.auraG, tank.pos.x, tank.pos.y, heal.radius, { color: GREEN, width: 2, alpha: 0.45, jitter: 0 }, 10, 8);
      }
    }
    for (const tw of sim.towers) {
      if (tw.kind !== 'bastion' && tw.kind !== 'medic') continue;
      const lvl = TOWERS[tw.kind].levels[tw.level - 1];
      const sk = sketcher(`dome_${tw.id}_${tw.level}`);
      const color = tw.kind === 'bastion' ? BLUE : GREEN;
      this.auraG.circle(tw.pos.x, tw.pos.y, lvl.range).fill({ color, alpha: 0.035 });
      sk.dashedCircle(this.auraG, tw.pos.x, tw.pos.y, lvl.range, { color, width: 2, alpha: 0.4, jitter: 0 }, 13, 10);
    }

    // towers
    const liveTowers = new Set<number>();
    for (const tw of sim.towers) {
      liveTowers.add(tw.id);
      let v = this.towerViews.get(tw.id);
      if (!v || v.level !== tw.level) {
        if (v) v.root.destroy({ children: true });
        const root = new Container();
        root.position.set(tw.pos.x, tw.pos.y);
        const base = new Sprite(this.towerBaseTexture(tw.kind, tw.level));
        base.anchor.set(0.5);
        // tally marks hang below center; nudge the sprite so the dial stays centered
        base.position.y = 5;
        const turret = new Sprite(this.turretTexture(tw.kind, tw.level));
        turret.anchor.set(0.5);
        const hp = new Container();
        const hbg = new Sprite(Texture.WHITE);
        hbg.tint = 0xc9ced6; hbg.alpha = 0.6;
        hbg.width = 36; hbg.height = 4.5;
        hbg.position.set(-18, 0);
        const hfg = new Sprite(Texture.WHITE);
        hfg.tint = BLUE;
        hfg.width = 36; hfg.height = 4.5;
        hfg.position.set(-18, 0);
        hp.addChild(hbg, hfg);
        hp.position.set(0, 30);
        hp.visible = false;
        root.addChild(base, turret, hp);
        this.towerLayer.addChild(root);
        v = { root, turret, hp, hpFg: hfg, level: tw.level, kind: tw.kind, age: 0 };
        this.towerViews.set(tw.id, v);
      }
      // pop-in on build/upgrade
      if (v.age < 0.3) {
        v.age += dt;
        v.root.scale.set(easeOutBack(Math.min(1, v.age / 0.3)));
      }
      v.turret.rotation = tw.angle;
      const rec = tw.recoil * 5;
      v.turret.position.set(-Math.cos(tw.angle) * rec, -Math.sin(tw.angle) * rec);
      v.root.alpha = tw.suppressT > 0 ? 0.7 : 1;
      const hpFrac = tw.hp / tw.maxHp;
      v.hp.visible = hpFrac < 1;
      v.hpFg.width = 36 * Math.max(0, hpFrac);
    }
    for (const [tid, v] of this.towerViews) {
      if (!liveTowers.has(tid)) {
        v.root.destroy({ children: true });
        this.towerViews.delete(tid);
      }
    }

    // status overlay: slow / overdrive marks on tanks, suppress / jammer on towers
    this.statusG.clear();
    const odOn = sim.overdriveT > 0;
    const jamOn = sim.jammerT > 0;
    for (const tank of sim.tanks) {
      const r = UNITS[tank.kind].radius;
      if (tank.slow.t > 0 && tank.slow.mult < 1) {
        // blue "chill" ticks above a slowed tank
        for (let k = -1; k <= 1; k++) {
          const x = tank.pos.x + k * 8;
          const y = tank.pos.y - r - 16 + (k === 0 ? -3 : 0);
          this.statusG.moveTo(x - 3, y);
          this.statusG.lineTo(x + 3, y);
          this.statusG.moveTo(x, y - 3);
          this.statusG.lineTo(x, y + 3);
        }
        this.statusG.stroke({ width: 2, color: BLUE, alpha: 0.75, cap: 'round' });
      }
      if (odOn) {
        // red speed dashes trailing the hull
        const bx = -Math.cos(tank.angle);
        const by = -Math.sin(tank.angle);
        for (let k = -1; k <= 1; k++) {
          const px = -by * k * 7;
          const py = bx * k * 7;
          const sx = tank.pos.x + bx * (r + 6) + px;
          const sy = tank.pos.y + by * (r + 6) + py;
          this.statusG.moveTo(sx, sy);
          this.statusG.lineTo(sx + bx * (10 - Math.abs(k) * 3), sy + by * (10 - Math.abs(k) * 3));
        }
        this.statusG.stroke({ width: 2.5, color: RED, alpha: 0.6, cap: 'round' });
      }
    }
    for (const tw of sim.towers) {
      if (tw.suppressT > 0) this.zigzag(tw.pos.x, tw.pos.y - 40, INK, 0.8);
      if (jamOn) this.zigzag(tw.pos.x, tw.pos.y - (tw.suppressT > 0 ? 50 : 40), RED, 0.7);
    }

    // ability banners with countdowns
    this.bannerOD.visible = odOn;
    if (odOn) {
      const s = `OVERDRIVE ${sim.overdriveT.toFixed(1)}s`;
      if (this.bannerOD.text !== s) this.bannerOD.text = s;
    }
    this.bannerJam.visible = jamOn;
    if (jamOn) {
      const s = `JAMMER ${sim.jammerT.toFixed(1)}s`;
      if (this.bannerJam.text !== s) this.bannerJam.text = s;
    }

    // projectiles
    const liveProj = new Set<number>();
    for (const p of sim.projectiles) {
      if (p.dead) continue;
      liveProj.add(p.id);
      let v = this.projViews.get(p.id);
      if (!v) {
        const sp = new Sprite(this.projTexture(p.kind));
        sp.anchor.set(0.5);
        this.projLayer.addChild(sp);
        v = { sp, trailAcc: 0 };
        this.projViews.set(p.id, v);
      }
      v.sp.position.set(p.pos.x, p.pos.y);
      v.sp.rotation = Math.atan2(p.vel.y, p.vel.x);
      // exhaust trails
      const isMissile = p.kind === 'missile' || p.kind === 'bigmissile' || p.kind === 'tankmissile';
      if (isMissile) {
        v.trailAcc += dt;
        const gap = p.kind === 'bigmissile' ? 0.016 : 0.03;
        while (v.trailAcc > gap) {
          v.trailAcc -= gap;
          const back = p.kind === 'bigmissile' ? 18 : 8;
          const a = Math.atan2(p.vel.y, p.vel.x);
          this.spawnParticle(
            { x: p.pos.x - Math.cos(a) * back, y: p.pos.y - Math.sin(a) * back },
            -Math.cos(a) * 20 + (Math.random() - 0.5) * 22,
            -Math.sin(a) * 20 + (Math.random() - 0.5) * 22,
            p.kind === 'bigmissile' ? 0.65 : 0.4,
            p.kind === 'bigmissile' ? 0.9 : 0.38,
            0xc4c9cf,
          );
        }
      }
    }
    for (const [pid, v] of this.projViews) {
      if (!liveProj.has(pid)) {
        v.sp.destroy();
        this.projViews.delete(pid);
      }
    }

    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.fxLayer.removeChild(pt.sp);
        this.particlePool.push(pt.sp);
        this.particles.splice(i, 1);
        continue;
      }
      pt.sp.x += pt.vx * dt;
      pt.sp.y += pt.vy * dt;
      pt.vx *= 1 - 2.2 * dt;
      pt.vy *= 1 - 2.2 * dt;
      const t = pt.life / pt.maxLife;
      pt.sp.alpha = 0.85 * t;
      pt.sp.scale.set(pt.sp.scale.x * (1 + dt * pt.scaleDecay));
    }

    // fx
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.age += dt;
      if (f.age >= f.life) {
        if (f.obj instanceof Text) {
          this.fxLayer.removeChild(f.obj);
          this.textPool.push(f.obj);
        } else {
          f.obj.destroy();
        }
        this.fx.splice(i, 1);
        continue;
      }
      f.update(f, dt);
    }

    // shake
    if (this.shake > 0.2) {
      this.shake *= 1 - 7 * dt;
      this.world.position.set(
        this.offX + (Math.random() - 0.5) * this.shake,
        this.offY + (Math.random() - 0.5) * this.shake,
      );
    } else {
      this.shake = 0;
      this.world.position.set(this.offX, this.offY);
    }
  }

  /** small static zigzag (suppression smoke / jammer static) over a tower */
  private zigzag(cx: number, cy: number, color: number, alpha: number) {
    const w = 22;
    const n = 4;
    this.statusG.moveTo(cx - w / 2, cy + 3);
    for (let i = 1; i <= n; i++) {
      this.statusG.lineTo(cx - w / 2 + (w / n) * i, cy + (i % 2 === 0 ? 3 : -3));
    }
    this.statusG.stroke({ width: 2.2, color, alpha, cap: 'round', join: 'round' });
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

/** classic two-lobe heart, centered on (x, y); s≈1 → ~30px tall */
function drawHeart(g: Graphics, x: number, y: number, s: number, color: number) {
  const cy = y - 13 * s;
  g.moveTo(x, cy + 9 * s);
  g.bezierCurveTo(x, cy + 4 * s, x - 5 * s, cy - 3 * s, x - 11 * s, cy - 3 * s);
  g.bezierCurveTo(x - 18 * s, cy - 3 * s, x - 22 * s, cy + 2 * s, x - 22 * s, cy + 7 * s);
  g.bezierCurveTo(x - 22 * s, cy + 15 * s, x - 13 * s, cy + 21 * s, x, cy + 28 * s);
  g.bezierCurveTo(x + 13 * s, cy + 21 * s, x + 22 * s, cy + 15 * s, x + 22 * s, cy + 7 * s);
  g.bezierCurveTo(x + 22 * s, cy + 2 * s, x + 18 * s, cy - 3 * s, x + 11 * s, cy - 3 * s);
  g.bezierCurveTo(x + 5 * s, cy - 3 * s, x, cy + 4 * s, x, cy + 9 * s);
  g.fill(color);
}

/** dashed wobbly line */
function dashedLine(
  g: Graphics,
  sk: import('./sketch').Sketcher,
  x1: number, y1: number, x2: number, y2: number,
  s: import('./sketch').Stroke,
  dash = 7, gap = 5,
) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(len, d + dash);
    sk.line(g, x1 + ux * d, y1 + uy * d, x1 + ux * e, y1 + uy * e, { ...s, overshoot: 0.5, passes: 1 });
  }
}

/** dashed wobbly rectangle */
function dashedRect(
  g: Graphics,
  sk: import('./sketch').Sketcher,
  x: number, y: number, w: number, h: number,
  s: import('./sketch').Stroke,
) {
  const dash = 11;
  const gap = 7;
  const edge = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(len, d + dash);
      sk.line(g, x1 + ux * d, y1 + uy * d, x1 + ux * e, y1 + uy * e, { ...s, overshoot: 0.5, passes: 1 });
    }
  };
  edge(x, y, x + w, y);
  edge(x + w, y, x + w, y + h);
  edge(x + w, y + h, x, y + h);
  edge(x, y + h, x, y);
}

function hexPts(r: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

function octPts(r: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}
