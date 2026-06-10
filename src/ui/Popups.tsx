import { useEffect, useState } from 'react';
import { ChevronsUp, Coins, Star, Wrench } from 'lucide-react';
import { SELL_RATIO, SLOTS, TOWERS, TOWER_ORDER } from '../game/config';
import { renderer, repairCost, sim, useGame } from '../state/store';
import type { TowerKind } from '../game/types';
import { Brick, TowerIcon } from './icons';

export function BoardPopup() {
  const selection = useGame((s) => s.selection);
  const defBricks = useGame((s) => s.defBricks);
  const buildTower = useGame((s) => s.buildTower);
  const upgradeTower = useGame((s) => s.upgradeTower);
  const repairTower = useGame((s) => s.repairTower);
  const sellTower = useGame((s) => s.sellTower);
  const [, bump] = useState(0);
  // two-tap build: first tap shows the tower's true range from this pad, second tap builds
  const [armed, setArmed] = useState<TowerKind | null>(null);

  useEffect(() => {
    const onResize = () => bump((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // selection changed → forget what was armed
  const slot = selection?.slot ?? -1;
  useEffect(() => { setArmed(null); }, [slot, selection?.kind]);

  if (!selection) return null;

  const slotPos = SLOTS[selection.slot];
  const screen = renderer.worldToScreen(slotPos);
  // clamp into the viewport
  const W = selection.kind === 'slot' ? 510 : 320;
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, screen.x - W / 2));
  const top = Math.max(8, Math.min(window.innerHeight - 290, screen.y + 36));

  if (selection.kind === 'slot') {
    const preview = (k: TowerKind) => {
      renderer.setRangePreview([{ pos: slotPos, range: TOWERS[k].levels[0].range }]);
    };
    return (
      <div className="popup" style={{ left, top }}>
        <div className="pop-row">
          {TOWER_ORDER.map((k) => {
            const def = TOWERS[k];
            const cost = def.levels[0].cost;
            const isArmed = armed === k;
            const capped = def.maxCount !== undefined
              && sim.towers.filter((t) => t.kind === k).length >= def.maxCount;
            return (
              <button
                key={k}
                className={`neu pop-card${isArmed ? ' armed' : ''}`}
                disabled={capped || cost > defBricks}
                onMouseEnter={() => preview(k)}
                onClick={() => {
                  if (isArmed) { buildTower(selection.slot, k); return; }
                  setArmed(k);
                  preview(k);
                }}
                title={def.desc}
              >
                <TowerIcon kind={k} />
                <span className="nm">{def.short}</span>
                <span className="cost"><Brick /> {cost}</span>
                <span className="meta">{capped ? `max ${def.maxCount}` : `rng ${def.levels[0].range}`}</span>
              </button>
            );
          })}
        </div>
        <span className="pop-hint">
          {armed
            ? `${TOWERS[armed].desc} — tap ${TOWERS[armed].short} again to build`
            : 'tap a tower to see its range and description'}
        </span>
      </div>
    );
  }

  const tower = sim.towers.find((t) => t.id === selection.towerId);
  if (!tower) return null;
  const def = TOWERS[tower.kind];
  const next = tower.level < 3 ? def.levels[tower.level] : null;
  const refund = Math.round(tower.invested * SELL_RATIO);
  const damaged = tower.hp < tower.maxHp;
  const fix = repairCost(tower.hp, tower.maxHp, tower.invested);

  return (
    <div className="popup" style={{ left, top }}>
      <div className="pop-row">
        <div className="pop-card" style={{ boxShadow: 'none' }}>
          <TowerIcon kind={tower.kind} />
          <span className="nm">{def.short} L{tower.level}</span>
          <span className="meta">{Math.ceil(tower.hp)}/{tower.maxHp} hp</span>
        </div>
        {damaged && (
          <button className="neu pop-card" disabled={fix > defBricks} onClick={() => repairTower(tower.id)}>
            <Wrench size={22} strokeWidth={2.5} />
            <span className="nm">REPAIR</span>
            <span className="cost"><Brick /> {fix}</span>
          </button>
        )}
        {next ? (
          <button className="neu pop-card" disabled={next.cost > defBricks} onClick={() => upgradeTower(tower.id)}>
            <ChevronsUp size={22} strokeWidth={2.5} />
            <span className="nm">UPGRADE</span>
            <span className="cost"><Brick /> {next.cost}</span>
            <span className="meta">{next.damage > 0 ? `dmg ${next.damage}` : `rng ${next.range}`}</span>
          </button>
        ) : (
          <div className="pop-card" style={{ boxShadow: 'none', opacity: 0.5 }}>
            <Star size={22} strokeWidth={2.5} />
            <span className="nm">MAX</span>
          </div>
        )}
        <button className="neu pop-card" onClick={() => sellTower(tower.id)}>
          <Coins size={22} strokeWidth={2.5} />
          <span className="nm">SELL</span>
          <span className="cost"><Brick /> {refund}</span>
        </button>
      </div>
    </div>
  );
}
