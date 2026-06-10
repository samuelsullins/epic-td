import { Rocket, Trash2 } from 'lucide-react';
import { ABILITIES, ABILITY_ORDER, UNITS, UNIT_ORDER } from '../game/config';
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
  const round = useGame((s) => s.round);
  const atkBricks = useGame((s) => s.atkBricks);
  const draft = useGame((s) => s.draft);
  const draftAbilities = useGame((s) => s.draftAbilities);
  const addUnit = useGame((s) => s.addUnit);
  const removeUnit = useGame((s) => s.removeUnit);
  const clearDraft = useGame((s) => s.clearDraft);
  const toggleAbility = useGame((s) => s.toggleAbility);
  const launchWave = useGame((s) => s.launchWave);

  const spent = draft.reduce((s, k) => s + UNITS[k].cost, 0)
    + draftAbilities.reduce((s, k) => s + ABILITIES[k].cost, 0);
  const groups = groupDraft(draft);

  return (
    <div className="builder">
      <div className="builder-top">
        <div className="meter">
          <div className="label">
            <span>BRICKS (unspent bricks bank for later rounds)</span>
            <b><Brick /> {atkBricks - spent} <span style={{ color: 'var(--mid)', fontWeight: 700 }}>/ {atkBricks}</span></b>
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
            const locked = def.unlockRound > round;
            const afford = spent + def.cost <= atkBricks;
            return (
              <button
                key={k}
                className={`neu unit-card${locked ? ' locked' : ''}`}
                disabled={locked || !afford}
                onClick={() => addUnit(k)}
                title={def.desc}
              >
                {locked && <span className="lock-tag">R{def.unlockRound}</span>}
                <UnitIcon kind={k} />
                <span className="nm">{def.name.toUpperCase()}</span>
                <span className="cost"><Brick /> {def.cost}</span>
                <span className="meta">{def.hp}hp · {def.speed}sp</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ABILITY_ORDER.map((k) => {
            const a = ABILITIES[k];
            const on = draftAbilities.includes(k);
            return (
              <button key={k} className={`neu ability-pick${on ? ' on' : ''}`} onClick={() => toggleAbility(k)}>
                <span className="t">{a.name.toUpperCase()} <span><Brick /> {a.cost}</span></span>
                <span className="d">{a.desc}</span>
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
