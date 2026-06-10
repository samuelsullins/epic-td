import { create } from 'zustand';
import {
  ROUNDS, SLOTS, START_LIVES, TOWERS, UNITS,
  attackerBudget, defenderCatchUp, defenderIncome, DEF_START_BRICKS, LEAK_REWARD, SELL_RATIO, SHUTOUT_PITY,
} from '../game/config';
import { Renderer } from '../game/renderer';
import { Sim } from '../game/sim';
import { sfx } from '../game/audio';
import type { Phase, TowerKind, UnitKind } from '../game/types';

export const sim = new Sim();
export const renderer = new Renderer();

export type Selection =
  | { kind: 'slot'; slot: number }
  | { kind: 'tower'; towerId: number; slot: number }
  | null;

export interface SummaryData {
  round: number;
  livesLost: number;
  bountyEarned: number;
  attackerReward: number;
  pity: boolean;
}

interface GameState {
  phase: Phase;
  round: number;
  lives: number;

  defBricks: number;
  atkBricks: number;

  // wave draft (attacker)
  draft: UnitKind[];

  // combat
  speed: number;
  paused: boolean;
  waveSize: number;
  tanksRemaining: number; // queue + alive

  // per-round bookkeeping
  livesLostThisWave: number;
  bountyThisWave: number;
  lastSummary: SummaryData | null;

  selection: Selection;
  winner: 'attacker' | 'defender' | null;
  muted: boolean;

  // actions
  startMatch: () => void;
  beginRound: () => void;
  defenderReady: () => void;
  attackerArrived: () => void;
  addUnit: (k: UnitKind) => void;
  removeUnit: (index: number) => void;
  clearDraft: () => void;
  launchWave: () => void;
  beginCombat: () => void;
  onFrame: (deltaMS: number) => void;
  setSpeed: (s: number) => void;
  setPaused: (p: boolean) => void;
  buildTower: (slot: number, kind: TowerKind) => void;
  upgradeTower: (towerId: number) => void;
  repairTower: (towerId: number) => void;
  sellTower: (towerId: number) => void;
  setSelection: (s: Selection) => void;
  nextRound: () => void;
}

export function repairCost(hp: number, maxHp: number, invested: number): number {
  return Math.max(5, Math.ceil((1 - hp / maxHp) * invested * 0.5));
}

// end-of-round grace: let the last explosion breathe before the menu drops
let pendingEnd: { kind: 'defeat' } | { kind: 'wave'; summary: SummaryData } | null = null;
let pendingAt = 0;

function draftCost(draft: UnitKind[]): number {
  return draft.reduce((s, k) => s + UNITS[k].cost, 0);
}

function updateRangePreview(state: { phase: Phase; selection: Selection }) {
  // build phases: show every tower's range (public info for both players);
  // combat: only the selected tower's
  if (state.phase === 'defendBuild' || state.phase === 'waveBuild') {
    renderer.setRangePreview(
      sim.towers.map((t) => ({ pos: t.pos, range: TOWERS[t.kind].levels[t.level - 1].range })),
    );
  } else if (state.selection?.kind === 'tower') {
    const t = sim.towers.find((x) => x.id === (state.selection as { towerId: number }).towerId);
    renderer.setRangePreview(t ? [{ pos: t.pos, range: TOWERS[t.kind].levels[t.level - 1].range }] : []);
  } else if (state.selection?.kind === 'slot') {
    // show a generic mid range so the defender can judge coverage from this pad
    renderer.setRangePreview([{ pos: SLOTS[state.selection.slot], range: 170 }]);
  } else {
    renderer.setRangePreview([]);
  }
}

export const useGame = create<GameState>((set, get) => ({
  phase: 'title',
  round: 1,
  lives: START_LIVES,
  defBricks: DEF_START_BRICKS,
  atkBricks: 0,
  draft: [],
  speed: 1,
  paused: false,
  waveSize: 0,
  tanksRemaining: 0,
  livesLostThisWave: 0,
  bountyThisWave: 0,
  lastSummary: null,
  selection: null,
  winner: null,
  muted: false,

  startMatch: () => {
    // reset everything
    sim.tanks = [];
    sim.towers = [];
    sim.projectiles = [];
    sim.waveQueue = [];
    sim.waveActive = false;
    pendingEnd = null;
    set({
      round: 1, lives: START_LIVES, defBricks: DEF_START_BRICKS, atkBricks: 0,
      draft: [], winner: null, lastSummary: null,
      selection: null, speed: 1, paused: false,
    });
    get().beginRound();
  },

  beginRound: () => {
    const { round, lives } = get();
    const income = round === 1 ? 0 : defenderIncome(round) + defenderCatchUp(lives);
    set((s) => ({
      phase: 'roundIntro',
      defBricks: s.defBricks + income,
      livesLostThisWave: 0,
      bountyThisWave: 0,
      selection: null,
    }));
    sfx('ui');
  },

  defenderReady: () => {
    set({ phase: 'handoffToAttacker', selection: null });
    updateRangePreview(get());
    sfx('ui');
  },

  attackerArrived: () => {
    const { round, lastSummary } = get();
    let budget = attackerBudget(round);
    if (lastSummary) {
      budget += lastSummary.livesLost * LEAK_REWARD;
      if (lastSummary.pity) budget += SHUTOUT_PITY;
    }
    set((s) => ({
      phase: 'waveBuild',
      atkBricks: s.atkBricks + budget,
      draft: [],
    }));
    updateRangePreview(get());
    sfx('ui');
  },

  addUnit: (k) => {
    const { draft, atkBricks } = get();
    const def = UNITS[k];
    if (def.maxPerWave && draft.filter((d) => d === k).length >= def.maxPerWave) { sfx('ui_deny'); return; }
    const cost = draftCost(draft) + def.cost;
    if (cost > atkBricks) { sfx('ui_deny'); return; }
    set({ draft: [...draft, k] });
    sfx('ui_add');
  },

  removeUnit: (index) => {
    set((s) => ({ draft: s.draft.filter((_, i) => i !== index) }));
    sfx('ui_remove');
  },

  clearDraft: () => { set({ draft: [] }); sfx('ui_remove'); },

  launchWave: () => {
    const { draft } = get();
    if (draft.length === 0) { sfx('ui_deny'); return; }
    set({ phase: 'handoffToCombat' });
    updateRangePreview(get());
    sfx('ui');
  },

  beginCombat: () => {
    const { draft, atkBricks } = get();
    const spend = draftCost(draft);
    pendingEnd = null;
    sim.startWave(draft);
    set({
      phase: 'combat',
      atkBricks: atkBricks - spend,
      waveSize: draft.length,
      tanksRemaining: draft.length,
      paused: false,
      selection: null,
    });
    updateRangePreview(get());
    sfx('ui');
  },

  onFrame: (deltaMS) => {
    const st = get();
    const combatRunning = st.phase === 'combat' && !st.paused;
    if (combatRunning) sim.tick(deltaMS, st.speed);
    else sim.tick(deltaMS, 1); // idle cooldowns/recoil only

    // the round is decided — once the grace period elapses, drop the menu
    if (pendingEnd && st.phase === 'combat' && performance.now() >= pendingAt) {
      const pe = pendingEnd;
      pendingEnd = null;
      if (pe.kind === 'defeat') {
        sim.waveActive = false;
        sim.tanks = [];
        sim.projectiles = [];
        set({ phase: 'gameOver', winner: 'attacker', selection: null });
        sfx('defeat');
      } else {
        sim.healAllTowers(); // survivors patch up for free between rounds
        if (get().round >= ROUNDS) {
          set({ phase: 'gameOver', winner: 'defender', lastSummary: pe.summary, selection: null });
          sfx('victory');
        } else {
          set({ phase: 'summary', lastSummary: pe.summary, selection: null });
          sfx('ui');
        }
      }
      updateRangePreview(get());
      return;
    }

    const events = sim.drainEvents();
    if (events.length === 0) return;
    renderer.handleEvents(events);

    let lives = st.lives;
    let defBricks = st.defBricks;
    let livesLost = st.livesLostThisWave;
    let bounty = st.bountyThisWave;
    let dirty = false;
    let waveEnded = false;

    for (const ev of events) {
      if (ev.type === 'sfx') sfx(ev.name);
      else if (ev.type === 'kill') { defBricks += ev.bounty; bounty += ev.bounty; dirty = true; }
      else if (ev.type === 'leak') {
        lives = Math.max(0, lives - ev.damage);
        livesLost += ev.damage;
        dirty = true;
      } else if (ev.type === 'towerDestroyed') {
        const sel = get().selection;
        if (sel?.kind === 'tower' && sel.towerId === ev.towerId) set({ selection: null });
        updateRangePreview(get());
      } else if (ev.type === 'waveEnd') waveEnded = true;
    }

    const remaining = sim.waveQueue.length + sim.tanks.length;
    if (remaining !== st.tanksRemaining) { dirty = true; }

    if (dirty) {
      set({
        lives, defBricks,
        livesLostThisWave: livesLost, bountyThisWave: bounty,
        tanksRemaining: remaining,
      });
    }

    // don't cut to the menu mid-explosion: queue the transition, let it play out
    if (lives <= 0 && st.phase === 'combat' && !pendingEnd) {
      pendingEnd = { kind: 'defeat' };
      pendingAt = performance.now() + 2200;
      return;
    }

    if (waveEnded && get().phase === 'combat' && !pendingEnd) {
      const s2 = get();
      const summary: SummaryData = {
        round: s2.round,
        livesLost: s2.livesLostThisWave,
        bountyEarned: s2.bountyThisWave,
        attackerReward: s2.livesLostThisWave * LEAK_REWARD,
        pity: s2.livesLostThisWave === 0,
      };
      pendingEnd = { kind: 'wave', summary };
      pendingAt = performance.now() + 2400;
    }
  },

  setSpeed: (s) => { set({ speed: s }); sfx('ui'); },
  setPaused: (p) => { set({ paused: p }); sfx('ui'); },

  buildTower: (slot, kind) => {
    const { defBricks, phase } = get();
    if (phase !== 'defendBuild' && phase !== 'combat') return;
    const def = TOWERS[kind];
    const cost = def.levels[0].cost;
    if (def.maxCount && sim.towers.filter((t) => t.kind === kind).length >= def.maxCount) { sfx('ui_deny'); return; }
    if (cost > defBricks || sim.towerAt(slot)) { sfx('ui_deny'); return; }
    sim.buildTower(slot, kind);
    set({ defBricks: defBricks - cost, selection: null });
    updateRangePreview(get());
  },

  upgradeTower: (towerId) => {
    const { defBricks } = get();
    const t = sim.towers.find((x) => x.id === towerId);
    if (!t || t.level >= 3) { sfx('ui_deny'); return; }
    const cost = TOWERS[t.kind].levels[t.level].cost;
    if (cost > defBricks) { sfx('ui_deny'); return; }
    sim.upgradeTower(towerId);
    set({ defBricks: defBricks - cost, selection: null });
    updateRangePreview(get());
  },

  repairTower: (towerId) => {
    const { defBricks } = get();
    const t = sim.towers.find((x) => x.id === towerId);
    if (!t || t.hp >= t.maxHp) { sfx('ui_deny'); return; }
    const cost = repairCost(t.hp, t.maxHp, t.invested);
    if (cost > defBricks) { sfx('ui_deny'); return; }
    sim.repairTower(towerId);
    set({ defBricks: defBricks - cost, selection: null });
  },

  sellTower: (towerId) => {
    const t = sim.towers.find((x) => x.id === towerId);
    if (!t) return;
    const refund = Math.round(sim.sellTower(towerId) * SELL_RATIO);
    set((s) => ({ defBricks: s.defBricks + refund, selection: null }));
    updateRangePreview(get());
  },

  setSelection: (sel) => {
    set({ selection: sel });
    updateRangePreview(get());
    if (sel) sfx('ui');
  },

  nextRound: () => {
    set((s) => ({ round: s.round + 1 }));
    get().beginRound();
  },
}));

// wire renderer board taps → store
renderer.onSlotTap = (slot) => {
  const st = useGame.getState();
  if (st.phase === 'defendBuild' || st.phase === 'combat') {
    st.setSelection({ kind: 'slot', slot });
  }
};
renderer.onTowerTap = (towerId, slot) => {
  const st = useGame.getState();
  if (st.phase === 'defendBuild' || st.phase === 'combat') {
    st.setSelection({ kind: 'tower', towerId, slot });
  }
};
renderer.onBoardTap = () => {
  const st = useGame.getState();
  if (st.selection) st.setSelection(null);
};
renderer.onFrame = (deltaMS) => {
  const st = useGame.getState();
  if (st.phase !== 'title') st.onFrame(deltaMS);
};

// after the round intro card, the defender build phase begins
export function enterDefendBuild() {
  useGame.setState({ phase: 'defendBuild' });
  updateRangePreview(useGame.getState());
  sfx('ui');
}
