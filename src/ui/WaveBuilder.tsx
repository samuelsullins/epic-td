import { Rocket, Trash2 } from 'lucide-react';
import { UNITS, UNIT_ORDER } from '../game/config';
import { useGame } from '../state/store';
import type { UnitKind } from '../game/types';
import { Brick, UnitIcon } from './icons';

/** consecutive runs of the same unit collapse into one chip with a ×N badge */
function groupDraft(draft: UnitKind[]): { kind: UnitKind; count: number; lastIndex: number }[] {
  const groups: { kind: UnitKind; count: number; lastIndex: number }[] = [];
  draft.forEach((k, i) => {
    const g = groups[groups.length - 1];
    if (g && g.kind === k) { g.count += 1; g.lastIndex = i; }
    else groups.push({ kind: k, count: 1, lastIndex: i });
  });
  return groups;
}

export function WaveBuilder() {
  const atkBricks = useGame((s) => s.atkBricks);
  const draft = useGame((s) => s.draft);
  const addUnit = useGame((s) => s.addUnit);
  const removeUnit = useGame((s) => s.removeUnit);
  const clearDraft = useGame((s) => s.clearDraft);
  const launchWave = useGame((s) => s.launchWave);

  const spent = draft.reduce((s, k) => s + UNITS[k].cost, 0);
  const groups = groupDraft(draft);

  return (
    <div className="builder">
      <div className="builder-top">
        <div className="meter">
          <div className="label">
            <span>BRICKS (unspent bricks bank for later rounds)</span>
            <b><Brick /> {atkBricks - spent} <span style={{ color: 'var(--ink-light)', fontWeight: 700 }}>/ {atkBricks}</span></b>
          </div>
          <div className="bar"><div className="fill" style={{ width: `${Math.max(0, ((atkBricks - spent) / Math.max(1, atkBricks)) * 100)}%` }} /></div>
        </div>
      </div>

      <div className="queue">
        {draft.length === 0 && <span className="hint">Tap tanks below to build your wave. The first chip leads the charge. Tap a chip to remove one.</span>}
        {groups.length > 0 && <span className="hint" style={{ flexShrink: 0 }}>1st&nbsp;→</span>}
        {groups.map((g, gi) => (
          <div key={gi} className="queue-chip" onClick={() => removeUnit(g.lastIndex)}>
            <UnitIcon kind={g.kind} size={26} />
            {g.count > 1 && <span className="chip-count">×{g.count}</span>}
          </div>
        ))}
        {draft.length > 0 && (
          <button className="neu" style={{ padding: '6px 10px', fontSize: 11, flexShrink: 0, marginLeft: 4, display: 'flex', alignItems: 'center', gap: 5 }} onClick={clearDraft}>
            <Trash2 size={13} strokeWidth={2.5} /> CLEAR
          </button>
        )}
      </div>

      <div className="builder-bottom">
        <div className="card-row">
          {UNIT_ORDER.map((k) => {
            const def = UNITS[k];
            const inDraft = draft.filter((d) => d === k).length;
            const capped = def.maxPerWave !== undefined && inDraft >= def.maxPerWave;
            const afford = spent + def.cost <= atkBricks;
            return (
              <button
                key={k}
                className="neu unit-card"
                disabled={capped || !afford}
                onClick={() => addUnit(k)}
                title={def.desc}
              >
                <UnitIcon kind={k} />
                <span className="nm">{def.name.toUpperCase()}</span>
                <span className="cost"><Brick /> {def.cost}</span>
                <span className="meta">{capped ? `max ${def.maxPerWave}` : `${def.hp}hp`}</span>
              </button>
            );
          })}
        </div>

        <button className="neu launch-btn att" disabled={draft.length === 0} onClick={launchWave}>
          <Rocket size={20} strokeWidth={2.5} /> LAUNCH<br />WAVE
        </button>
      </div>
    </div>
  );
}
