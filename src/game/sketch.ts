// Hand-drawn "whiteboard marker" drawing helpers for Pixi Graphics.
// All randomness is seeded, so baked textures come out identical every run —
// the wobble is in the shapes, never animated (no boiling lines).
import type { Graphics } from 'pixi.js';

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Stroke {
  color: number;
  width?: number; // px, default 2
  alpha?: number; // default 1
  jitter?: number; // wobble amplitude in px, default 1.1
  overshoot?: number; // px the stroke runs past each end, default 2
  passes?: number; // marker goes over the line this many times, default 2
}

export class Sketcher {
  constructor(private rand: () => number) {}

  private j(amt: number): number {
    return (this.rand() - 0.5) * 2 * amt;
  }

  /** one wobbly polyline pass between two points, with overshoot */
  private linePass(g: Graphics, x1: number, y1: number, x2: number, y2: number, jitter: number, over: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const o1 = over * (0.4 + this.rand() * 0.6);
    const o2 = over * (0.4 + this.rand() * 0.6);
    const ax = x1 - ux * o1;
    const ay = y1 - uy * o1;
    const bx = x2 + ux * o2;
    const by = y2 + uy * o2;
    const n = Math.max(2, Math.round(len / 24));
    g.moveTo(ax + this.j(jitter * 0.6), ay + this.j(jitter * 0.6));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const w = i === n ? jitter * 0.6 : jitter;
      g.lineTo(
        ax + (bx - ax) * t + px * this.j(w),
        ay + (by - ay) * t + py * this.j(w),
      );
    }
  }

  line(g: Graphics, x1: number, y1: number, x2: number, y2: number, s: Stroke) {
    const passes = s.passes ?? 2;
    const jitter = s.jitter ?? 1.1;
    const over = s.overshoot ?? 2;
    for (let p = 0; p < passes; p++) {
      this.linePass(g, x1, y1, x2, y2, jitter, over);
      g.stroke({
        width: (s.width ?? 2) * (p === 0 ? 1 : 0.75),
        color: s.color,
        alpha: (s.alpha ?? 1) * (p === 0 ? 1 : 0.45),
        cap: 'round',
        join: 'round',
      });
    }
  }

  /** open or closed wobbly polyline through pts [x,y,x,y,...] */
  poly(g: Graphics, pts: number[], close: boolean, s: Stroke) {
    const n = pts.length / 2;
    const end = close ? n : n - 1;
    for (let i = 0; i < end; i++) {
      const x1 = pts[i * 2];
      const y1 = pts[i * 2 + 1];
      const x2 = pts[((i + 1) % n) * 2];
      const y2 = pts[((i + 1) % n) * 2 + 1];
      this.line(g, x1, y1, x2, y2, s);
    }
  }

  rect(g: Graphics, x: number, y: number, w: number, h: number, s: Stroke) {
    this.poly(g, [x, y, x + w, y, x + w, y + h, x, y + h], true, s);
  }

  circle(g: Graphics, cx: number, cy: number, r: number, s: Stroke) {
    const passes = s.passes ?? 2;
    const jitter = s.jitter ?? Math.max(0.8, r * 0.05);
    for (let p = 0; p < passes; p++) {
      const n = Math.max(10, Math.round(r / 3.2) + 8);
      const a0 = this.rand() * Math.PI * 2;
      // overlap the start a little, like a hand closing a circle
      const sweep = Math.PI * 2 + 0.25 + this.rand() * 0.2;
      for (let i = 0; i <= n; i++) {
        const a = a0 + (i / n) * sweep;
        const rr = r + this.j(jitter);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({
        width: (s.width ?? 2) * (p === 0 ? 1 : 0.75),
        color: s.color,
        alpha: (s.alpha ?? 1) * (p === 0 ? 1 : 0.45),
        cap: 'round',
        join: 'round',
      });
    }
  }

  /** dashed circle, single pass; deterministic enough for per-frame redraws */
  dashedCircle(g: Graphics, cx: number, cy: number, r: number, s: Stroke, dash = 12, gap = 9) {
    const circ = Math.PI * 2 * r;
    const n = Math.max(6, Math.floor(circ / (dash + gap)));
    const dashA = (dash / circ) * Math.PI * 2;
    const stepA = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const a = i * stepA;
      const segs = Math.max(2, Math.round((dashA * r) / 10));
      for (let k = 0; k <= segs; k++) {
        const aa = a + (k / segs) * dashA;
        const rr = r + this.j(s.jitter ?? 1.2);
        const x = cx + Math.cos(aa) * rr;
        const y = cy + Math.sin(aa) * rr;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    }
    g.stroke({ width: s.width ?? 2, color: s.color, alpha: s.alpha ?? 1, cap: 'round' });
  }

  /** diagonal hatch scribble clipped to a circle — scorch marks, shading */
  hatchCircle(g: Graphics, cx: number, cy: number, r: number, s: Stroke, spacing = 6) {
    for (let off = -r + spacing / 2; off < r; off += spacing) {
      const half = Math.sqrt(Math.max(0, r * r - off * off));
      // 45° hatch: rotate chord endpoints
      const x1 = cx + (off - half) * 0.7071;
      const y1 = cy + (off + half) * 0.7071;
      const x2 = cx + (off + half) * 0.7071;
      const y2 = cy + (off - half) * 0.7071;
      this.linePass(g, x1, y1, x2, y2, s.jitter ?? 1.5, 1);
    }
    g.stroke({ width: s.width ?? 2, color: s.color, alpha: s.alpha ?? 1, cap: 'round' });
  }

  /** chaotic looped scribble blob — death marks */
  scribble(g: Graphics, cx: number, cy: number, r: number, s: Stroke) {
    const loops = 3;
    let a = this.rand() * Math.PI * 2;
    let started = false;
    for (let l = 0; l < loops; l++) {
      const lr = r * (0.45 + this.rand() * 0.55);
      const ox = this.j(r * 0.3);
      const oy = this.j(r * 0.3);
      const n = 9;
      for (let i = 0; i <= n; i++) {
        a += (Math.PI * 2) / n;
        const rr = lr + this.j(lr * 0.25);
        const x = cx + ox + Math.cos(a) * rr;
        const y = cy + oy + Math.sin(a) * rr * 0.8;
        if (!started) { g.moveTo(x, y); started = true; }
        else g.lineTo(x, y);
      }
    }
    g.stroke({ width: s.width ?? 2.5, color: s.color, alpha: s.alpha ?? 1, cap: 'round', join: 'round' });
  }
}

export function sketcher(seedKey: string): Sketcher {
  return new Sketcher(seededRng(hashSeed(seedKey)));
}
