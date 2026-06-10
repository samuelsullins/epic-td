// Procedural SFX — no asset files. Soft, muted, neumorphic-feeling sounds.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ac(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}
export function isMuted() { return muted; }

// rate limiting so 30 missiles don't stack 30 whooshes
const lastPlayed: Record<string, number> = {};
function gate(name: string, minGapMs: number): boolean {
  const now = performance.now();
  if (lastPlayed[name] && now - lastPlayed[name] < minGapMs) return false;
  lastPlayed[name] = now;
  return true;
}

function env(g: GainNode, t0: number, peak: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function boom(freq: number, decay: number, vol: number, noiseAmt = 0.5) {
  const c = ac();
  const t = c.currentTime;
  // thump
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(28, freq * 0.3), t + decay * 0.8);
  const og = c.createGain();
  env(og, t, vol, decay);
  o.connect(og).connect(master!);
  o.start(t); o.stop(t + decay + 0.05);
  // crackle
  const n = c.createBufferSource();
  n.buffer = noiseBuffer(c, decay);
  const nf = c.createBiquadFilter();
  nf.type = 'lowpass';
  nf.frequency.setValueAtTime(1800, t);
  nf.frequency.exponentialRampToValueAtTime(220, t + decay);
  const ng = c.createGain();
  env(ng, t, vol * noiseAmt, decay);
  n.connect(nf).connect(ng).connect(master!);
  n.start(t);
}

function tick(freq: number, vol: number, decay = 0.06, type: OscillatorType = 'triangle') {
  const c = ac();
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  env(g, t, vol, decay);
  o.connect(g).connect(master!);
  o.start(t); o.stop(t + decay + 0.05);
}

function whoosh(decay: number, vol: number, from = 600, to = 2400) {
  const c = ac();
  const t = c.currentTime;
  const n = c.createBufferSource();
  n.buffer = noiseBuffer(c, decay);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 2.5;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + decay);
  const g = c.createGain();
  env(g, t, vol, decay);
  n.connect(f).connect(g).connect(master!);
  n.start(t);
}

export function sfx(name: string) {
  if (muted) return;
  try {
    switch (name) {
      case 'ui': tick(900, 0.12, 0.05); break;
      case 'ui_add': tick(620, 0.14, 0.07); tick(930, 0.1, 0.09); break;
      case 'ui_remove': tick(420, 0.12, 0.07); break;
      case 'ui_deny': if (gate('deny', 120)) { tick(180, 0.18, 0.12, 'square'); } break;
      case 'build': if (gate('build', 80)) { tick(340, 0.2, 0.1); tick(510, 0.16, 0.16); } break;
      case 'sell': tick(510, 0.15, 0.08); tick(340, 0.12, 0.14); break;
      case 'gun': if (gate('gun', 70)) tick(2200, 0.06, 0.03, 'square'); break;
      case 'ciws': if (gate('ciws', 60)) tick(3100, 0.05, 0.025, 'square'); break;
      case 'rail': if (gate('rail', 100)) { whoosh(0.18, 0.2, 3000, 400); } break;
      case 'swarm': if (gate('swarm', 150)) whoosh(0.3, 0.16, 500, 2600); break;
      case 'tanklaunch': if (gate('tanklaunch', 150)) whoosh(0.25, 0.18, 400, 1600); break;
      case 'bertha_launch': boom(160, 0.4, 0.3, 0.8); whoosh(0.7, 0.2, 300, 1200); break;
      case 'bertha_hit': boom(70, 0.9, 0.55, 1); break;
      case 'missile_hit': if (gate('mhit', 90)) boom(220, 0.18, 0.14, 0.7); break;
      case 'tankhit': boom(150, 0.3, 0.25, 0.8); break;
      case 'tankgun': if (gate('tankgun', 110)) tick(1500, 0.07, 0.035, 'square'); break;
      case 'towerdown': boom(60, 1.0, 0.55, 1); tick(300, 0.2, 0.5, 'sine'); break;
      case 'intercept': if (gate('intercept', 80)) { tick(2600, 0.1, 0.04); boom(400, 0.1, 0.08); } break;
      case 'death': if (gate('death', 90)) boom(120, 0.35, 0.3, 0.9); break;
      case 'bigdeath': boom(55, 1.2, 0.6, 1); break;
      case 'leak': boom(90, 0.6, 0.5, 0.3); tick(220, 0.3, 0.4, 'sine'); break;
      case 'spawn': if (gate('spawn', 200)) tick(260, 0.08, 0.1); break;
      case 'emp': if (gate('emp', 150)) { whoosh(0.35, 0.14, 1800, 300); } break;
      case 'zap': if (gate('zap', 90)) { tick(1500, 0.12, 0.07, 'sawtooth'); tick(2400, 0.07, 0.04, 'square'); } break;
      case 'spray': if (gate('spray', 120)) whoosh(0.14, 0.08, 900, 2200); break;
      case 'cryo': if (gate('cryo', 140)) { tick(2200, 0.08, 0.06, 'triangle'); tick(3300, 0.05, 0.08, 'sine'); } break;
      case 'freeze': if (gate('freeze', 140)) { tick(1100, 0.1, 0.12, 'sine'); tick(2600, 0.06, 0.05, 'triangle'); } break;
      case 'hex': boom(180, 0.4, 0.25, 0.4); tick(340, 0.16, 0.3, 'sine'); break;
      case 'mine': boom(120, 0.45, 0.4, 0.9); break;
      case 'minelay': if (gate('minelay', 200)) tick(480, 0.12, 0.08); break;
      case 'sting': if (gate('sting', 130)) tick(2900, 0.06, 0.03, 'triangle'); break;
      case 'drone': if (gate('drone', 180)) whoosh(0.22, 0.09, 700, 1900); break;
      case 'boomer': boom(95, 0.55, 0.45, 0.95); break;
      case 'flak': if (gate('flak', 100)) tick(1900, 0.07, 0.03, 'square'); break;
      case 'victory': [440, 554, 659, 880].forEach((f, i) => setTimeout(() => tick(f, 0.22, 0.5), i * 130)); break;
      case 'defeat': [330, 311, 233, 175].forEach((f, i) => setTimeout(() => tick(f, 0.22, 0.6, 'sine'), i * 180)); break;
      default: break;
    }
  } catch {
    // audio is decorative; never crash the game over it
  }
}

export function unlockAudio() { ac(); }
