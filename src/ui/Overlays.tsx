import { ArrowRight, Play, RotateCcw, Shield, Swords } from 'lucide-react';
import { ROUNDS, attackerBudget } from '../game/config';
import { unlockAudio } from '../game/audio';
import { enterDefendBuild, useGame } from '../state/store';
import { Brick } from './icons';

export function Overlays() {
  const phase = useGame((s) => s.phase);
  switch (phase) {
    case 'title': return <Title />;
    case 'roundIntro': return <RoundIntro />;
    case 'handoffToAttacker': return <Handoff />;
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
      <button
        className="neu big-btn"
        style={{ fontSize: 26, padding: '26px 56px' }}
        onClick={() => { unlockAudio(); startMatch(); }}
      >
        <Play size={26} strokeWidth={2.5} /> START GAME
      </button>
    </div>
  );
}

function RoundIntro() {
  const round = useGame((s) => s.round);
  const lives = useGame((s) => s.lives);
  const defBricks = useGame((s) => s.defBricks);
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
        <button className="neu big-btn" onClick={enterDefendBuild}>
          <Shield size={19} strokeWidth={2.5} /> I’M THE DEFENDER
        </button>
      </div>
    </div>
  );
}

function Handoff() {
  const attackerArrived = useGame((s) => s.attackerArrived);
  return (
    <div className="overlay">
      <div className="panel">
        <h2>PASS TO ATTACKER</h2>
        <div className="accent-line" />
        <button className="neu big-btn" onClick={attackerArrived}>
          <Swords size={19} strokeWidth={2.5} /> I’M THE ATTACKER
        </button>
      </div>
    </div>
  );
}

function CombatHandoff() {
  const beginCombat = useGame((s) => s.beginCombat);
  return (
    <div className="overlay translucent">
      <div className="panel">
        <h2>READY?</h2>
        <div className="accent-line" />
        <button className="neu big-btn" onClick={beginCombat}>
          <Play size={19} strokeWidth={2.5} /> GO!
        </button>
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
          <div className="sg"><b><Brick size={16} /> {s.attackerReward + (s.pity ? 80 : 0)}</b><span>ATTACKER BONUS</span></div>
        </div>
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
        </p>
        <button className="neu big-btn" onClick={startMatch}><RotateCcw size={19} strokeWidth={2.5} /> REMATCH</button>
      </div>
    </div>
  );
}
