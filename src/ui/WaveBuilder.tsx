import { useState } from 'react';
import { Rocket, Trash2, X } from 'lucide-react';
import { TOWERS, TOWER_ORDER, UNITS, UNIT_ORDER } from '../game/config';
import { useGame } from '../state/store';
import type { TowerKind, UnitKind, WaveEntry } from '../game/types';
import { Brick, TowerIcon, UnitIcon } from './icons';

/** consecutive runs of the same unit (and same seeker prey) collapse into one chip */
function groupDraft(draft: WaveEntry[]): { kind: UnitKind; targetTower?: TowerKind; count: number; lastIndex: number }[] {
  const groups: { kind: UnitKind; targetTower?: TowerKind; count: number; lastIndex: number }[] = [];
  draft.forEach((e, i) => {
    const g = groups[groups.length - 1];
    if (g && g.kind === e.kind && g.targetTower === e.targetTower) { g.count += 1; g.lastIndex = i; }
    else groups.push({ kind: e.kind, targetTower: e.targetTower, count: 1, lastIndex: i });
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
  // seeker flow: tap the card, then choose which tower type it hunts
  const [picking, setPicking] = useState<UnitKind | null>(null);

  const spent = draft.reduce((s, e) => s + UNITS[e.kind].cost, 0);
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

      {picking ? (
        <div className="queue pick-row">
          <span className="hint" style={{ flexShrink: 0 }}>SEEKER HUNTS:</span>
          {TOWER_ORDER.map((tk) => (
            <button
              key={tk}
              className="neu queue-chip"
              title={TOWERS[tk].name}
              onClick={() => { addUnit(picking, tk); setPicking(null); }}
            >
              <TowerIcon kind={tk} size={26} />
            </button>
          ))}
          <button
            className="neu"
            style={{ padding: '6px 10px', fontSize: 11, flexShrink: 0, marginLeft: 4 }}
            onClick={() => setPicking(null)}
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <div className="queue">
          {draft.length === 0 && <span className="hint">Tap tanks below to build your wave. The first chip leads the charge. Tap a chip to remove one.</span>}
          {groups.length > 0 && <span className="hint" style={{ flexShrink: 0 }}>1st&nbsp;→</span>}
          {groups.map((g, gi) => (
            <div key={gi} className="queue-chip" onClick={() => removeUnit(g.lastIndex)}>
              <UnitIcon kind={g.kind} size={26} />
              {g.targetTower && (
                <span className="chip-prey"><TowerIcon kind={g.targetTower} size={15} /></span>
              )}
              {g.count > 1 && <span className="chip-count">×{g.count}</span>}
            </div>
          ))}
          {draft.length > 0 && (
            <button className="neu" style={{ padding: '6px 10px', fontSize: 11, flexShrink: 0, marginLeft: 4, display: 'flex', alignItems: 'center', gap: 5 }} onClick={clearDraft}>
              <Trash2 size={13} strokeWidth={2.5} /> CLEAR
            </button>
          )}
        </div>
      )}

      <div className="builder-bottom">
        <div className="card-row">
          {UNIT_ORDER.map((k) => {
            const def = UNITS[k];
            const inDraft = draft.filter((d) => d.kind === k).length;
            const capped = def.maxPerWave !== undefined && inDraft >= def.maxPerWave;
            const afford = spent + def.cost <= atkBricks;
            return (
              <button
                key={k}
                className="neu unit-card"
                disabled={capped || !afford}
                onClick={() => {
                  if (def.pickTower) setPicking(k);
                  else addUnit(k);
                }}
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
