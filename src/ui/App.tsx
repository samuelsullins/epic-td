import { useState } from 'react';
import {
  ArrowRightLeft, FastForward, Heart, Pause, Play, Shield, Swords, Volume2, VolumeX,
} from 'lucide-react';
import { ROUNDS } from '../game/config';
import { isMuted, setMuted } from '../game/audio';
import { useGame } from '../state/store';
import { GameCanvas } from './GameCanvas';
import { Overlays } from './Overlays';
import { BoardPopup } from './Popups';
import { WaveBuilder } from './WaveBuilder';
import { Brick } from './icons';

export function App() {
  return (
    <div className="app">
      <Hud />
      <div className="board-wrap">
        <GameCanvas />
      </div>
      <BottomPanel />
      <BoardPopup />
      <Overlays />
    </div>
  );
}

function Hud() {
  const phase = useGame((s) => s.phase);
  const round = useGame((s) => s.round);
  const lives = useGame((s) => s.lives);
  const defBricks = useGame((s) => s.defBricks);
  const speed = useGame((s) => s.speed);
  const paused = useGame((s) => s.paused);
  const setSpeed = useGame((s) => s.setSpeed);
  const setPaused = useGame((s) => s.setPaused);
  const [muted, setM] = useState(isMuted());

  const showBoard = phase === 'defendBuild' || phase === 'waveBuild' || phase === 'combat' || phase === 'summary';
  if (!showBoard) return <div className="hud" />;

  const role = phase === 'waveBuild' ? 'ATTACKER' : 'DEFENDER';

  return (
    <div className="hud">
      <div className="pill stat"><span>ROUND</span><b>{round}/{ROUNDS}</b></div>
      <div className="pill stat">
        <Heart size={15} strokeWidth={2.5} fill="currentColor" />
        <b key={lives} className={lives < 20 ? 'lives-flash' : ''}>{lives}</b>
      </div>
      {phase !== 'waveBuild' && (
        <div className="pill stat"><span>BRICKS</span><b><Brick size={14} /> {defBricks}</b></div>
      )}
      <div className={`pill stat ${role === 'ATTACKER' ? 'role-att' : 'role-def'}`}>
        {role === 'ATTACKER' ? <Swords size={15} strokeWidth={2.5} /> : <Shield size={15} strokeWidth={2.5} />}
        <b>{role}</b>
      </div>
      <div className="spacer" />
      {phase === 'combat' && (
        <>
          <button className={`neu iconbtn${paused ? ' active' : ''}`} onClick={() => setPaused(!paused)}>
            {paused ? <Play size={18} strokeWidth={2.5} /> : <Pause size={18} strokeWidth={2.5} />}
          </button>
          <button className={`neu iconbtn${speed === 2 ? ' active' : ''}`} onClick={() => setSpeed(speed === 2 ? 1 : 2)}>
            <FastForward size={18} strokeWidth={2.5} />
          </button>
        </>
      )}
      <button className="neu iconbtn" onClick={() => { setMuted(!muted); setM(!muted); }}>
        {muted ? <VolumeX size={18} strokeWidth={2.5} /> : <Volume2 size={18} strokeWidth={2.5} />}
      </button>
    </div>
  );
}

function BottomPanel() {
  const phase = useGame((s) => s.phase);
  if (phase === 'waveBuild') return <WaveBuilder />;
  if (phase === 'defendBuild' || phase === 'combat') return <DefenderBar />;
  return null;
}

function DefenderBar() {
  const phase = useGame((s) => s.phase);
  const defenderReady = useGame((s) => s.defenderReady);
  const waveSize = useGame((s) => s.waveSize);
  const tanksRemaining = useGame((s) => s.tanksRemaining);

  return (
    <div className="bottom">
      {phase === 'combat' ? (
        <div className="wave-progress" style={{ flex: 1 }}>
          <span className="label">WAVE&nbsp;&nbsp;{Math.max(0, waveSize - tanksRemaining)} / {waveSize} DOWN</span>
          <div className="bar">
            <div className="fill" style={{ width: `${waveSize ? ((waveSize - tanksRemaining) / waveSize) * 100 : 0}%` }} />
          </div>
          <span className="label" style={{ fontWeight: 600, letterSpacing: 0 }}>Tap a pad to build mid-wave</span>
        </div>
      ) : (
        <button className="neu launch-btn def" style={{ flex: 1, justifyContent: 'center', padding: '12px 26px' }} onClick={defenderReady}>
          <ArrowRightLeft size={20} strokeWidth={2.5} /> READY — PASS DEVICE
        </button>
      )}
    </div>
  );
}
