import { ArrowRight, Hammer, Play, RotateCcw, Swords, Truck } from 'lucide-react';
import { ROUNDS, UNITS, UNIT_ORDER, attackerBudget } from '../game/config';
import { unlockAudio } from '../game/audio';
import { enterDefendBuild, useGame } from '../state/store';
import { Brick, UnitIcon } from './icons';

export function Overlays() {
  const phase = useGame((s) => s.phase);
  switch (phase) {
    case 'title': return <Title />;
    case 'roundIntro': return <RoundIntro />;
    case 'handoffToAttacker': return <Handoff who="ATTACKER" />;
    case 'handoffToCombat': return <CombatHandoff />;
    case 'summary': return <Summary />;
    case 'gameOver': return <GameOver />;
    default: return null;
  }
}

function Title() {
  const startMatch = useGame((s) => s.startMatch);
  return (
    <div className="overlay">
      <div className="panel">
        <h1>EPIC&nbsp;TD</h1>
        <div className="accent-line" />
        <p className="sub">
          Two players. One iPad.<br />
          The <b>Attacker</b> builds waves of tanks. The <b>Defender</b> builds towers — most of them
          launch missiles. Attacker wins by draining 20 lives within {ROUNDS} rounds.
          Defender wins by surviving.
        </p>
        <p className="sub" style={{ fontSize: 12.5 }}>
          Currency is <b>Bricks</b> <Brick />. Attackers: unspent Bricks bank between rounds — save up
          or spend big. Defenders: every kill pays a bounty, and towers persist all match.
        </p>
        <button className="neu big-btn" onClick={() => { unlockAudio(); startMatch(); }}>
          <Play size={19} strokeWidth={2.5} /> START MATCH
        </button>
      </div>
    </div>
  );
}

function RoundIntro() {
  const round = useGame((s) => s.round);
  const lives = useGame((s) => s.lives);
  const defBricks = useGame((s) => s.defBricks);
  const newUnits = UNIT_ORDER.filter((k) => UNITS[k].unlockRound === round && round > 1);
  return (
    <div className="overlay translucent">
      <div className="panel">
        <h2>ROUND {round} / {ROUNDS}</h2>
        <div className="accent-line" />
        <div className="statgrid">
          <div className="sg"><b>{lives}</b><span>LIVES</span></div>
          <div className="sg"><b><Brick size={16} /> {defBricks}</b><span>DEFENDER BRICKS</span></div>
          <div className="sg"><b><Brick size={16} /> {attackerBudget(round)}+</b><span>ATTACKER INCOME</span></div>
        </div>
        {newUnits.length > 0 && (
          <p className="sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b>NEW THREAT UNLOCKED:</b>
            {newUnits.map((k) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <UnitIcon kind={k} size={24} /> {UNITS[k].name}
              </span>
            ))}
          </p>
        )}
        <p className="sub">Defender builds first — you won’t see the wave coming. Choose well.</p>
        <button className="neu big-btn" onClick={enterDefendBuild}><Hammer size={19} strokeWidth={2.5} /> DEFENDER: BUILD</button>
      </div>
    </div>
  );
}

function Handoff({ who }: { who: string }) {
  const attackerArrived = useGame((s) => s.attackerArrived);
  return (
    <div className="overlay">
      <div className="panel">
        <h2>PASS TO {who}</h2>
        <div className="accent-line" />
        <p className="sub">Defender: look away. The Attacker now designs the wave<br />with full view of your defenses.</p>
        <button className="neu big-btn" onClick={attackerArrived}><Swords size={19} strokeWidth={2.5} /> I’M THE ATTACKER</button>
      </div>
    </div>
  );
}

function CombatHandoff() {
  const beginCombat = useGame((s) => s.beginCombat);
  const draftAbilities = useGame((s) => s.draftAbilities);
  return (
    <div className="overlay translucent">
      <div className="panel">
        <h2>WAVE LOCKED</h2>
        <div className="accent-line" />
        <p className="sub">
          Set the iPad where both players can reach.<br />
          <b>Defender</b>: you may keep building while the wave rolls — taps on pads, bounties fund you.<br />
          <b>Attacker</b>: {draftAbilities.length > 0
            ? 'your ability buttons are on the left edge. Time them well.'
            : 'you bought no abilities — sit back and watch it burn.'}
        </p>
        <button className="neu big-btn" onClick={beginCombat}><Truck size={19} strokeWidth={2.5} /> ROLL OUT</button>
      </div>
    </div>
  );
}

function Summary() {
  const s = useGame((st) => st.lastSummary);
  const lives = useGame((st) => st.lives);
  const nextRound = useGame((st) => st.nextRound);
  if (!s) return null;
  const clean = s.livesLost === 0;
  return (
    <div className="overlay translucent">
      <div className="panel">
        <h2>{clean ? 'CLEAN DEFENSE' : `${s.livesLost} ${s.livesLost === 1 ? 'LIFE' : 'LIVES'} LOST`}</h2>
        <div className="accent-line" />
        <div className="statgrid">
          <div className="sg"><b>{lives}</b><span>LIVES LEFT</span></div>
          <div className="sg"><b><Brick size={16} /> {s.bountyEarned}</b><span>BOUNTIES EARNED</span></div>
          <div className="sg"><b><Brick size={16} /> {s.attackerReward + (s.pity ? 60 : 0)}</b><span>ATTACKER BONUS</span></div>
        </div>
        <p className="sub">
          {clean
            ? 'Shutout — the attacker receives a pity bonus to keep things spicy.'
            : 'Every life taken pays the attacker extra Bricks next round.'}
        </p>
        <button className="neu big-btn" onClick={nextRound}>ROUND {s.round + 1} <ArrowRight size={19} strokeWidth={2.5} /></button>
      </div>
    </div>
  );
}

function GameOver() {
  const winner = useGame((s) => s.winner);
  const round = useGame((s) => s.round);
  const lives = useGame((s) => s.lives);
  const startMatch = useGame((s) => s.startMatch);
  const attacker = winner === 'attacker';
  return (
    <div className="overlay">
      <div className="panel">
        <h1 style={attacker ? { color: 'var(--accent)' } : undefined}>
          {attacker ? 'BASE DESTROYED' : 'BASE STANDS'}
        </h1>
        <div className={`accent-line${attacker ? ' orange' : ''}`} />
        <h2 style={{ fontSize: 20 }}>{attacker ? 'ATTACKER WINS' : 'DEFENDER WINS'}</h2>
        <p className="sub">
          {attacker
            ? `The defense cracked on round ${round}.`
            : `Survived all ${ROUNDS} rounds with ${lives} ${lives === 1 ? 'life' : 'lives'} to spare.`}
          <br />Swap seats and run it back?
        </p>
        <button className="neu big-btn" onClick={startMatch}><RotateCcw size={19} strokeWidth={2.5} /> REMATCH</button>
      </div>
    </div>
  );
}
