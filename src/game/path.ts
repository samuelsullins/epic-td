import { PATH_POINTS } from './config';
import type { Vec } from './types';

// Precomputed cumulative segment lengths for O(segments) position lookup.
const segs: { a: Vec; b: Vec; len: number; start: number }[] = [];
let total = 0;
for (let i = 0; i < PATH_POINTS.length - 1; i++) {
  const a = PATH_POINTS[i];
  const b = PATH_POINTS[i + 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  segs.push({ a, b, len, start: total });
  total += len;
}

export const PATH_LENGTH = total;

export function pointAt(dist: number): { pos: Vec; angle: number } {
  if (dist <= 0) {
    const s = segs[0];
    return { pos: { ...s.a }, angle: Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x) };
  }
  for (const s of segs) {
    if (dist <= s.start + s.len) {
      const t = (dist - s.start) / s.len;
      return {
        pos: { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t },
        angle: Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x),
      };
    }
  }
  const last = segs[segs.length - 1];
  return { pos: { ...last.b }, angle: Math.atan2(last.b.y - last.a.y, last.b.x - last.a.x) };
}

export function dist2(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
