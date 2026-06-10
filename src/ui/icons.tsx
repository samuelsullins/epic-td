import type { TowerKind, UnitKind } from '../game/types';

// whiteboard marker palette (mirrors renderer.ts)
const INK = '#32353a';
const RED = '#d24a43';
const RED_D = '#9b2f2a';
const RED_L = '#f4c7c3';
const BLUE = '#2b6cb8';
const BLUE_D = '#1c4e87';
const PAPER = '#fcfcf9';

/** tiny per-kind tilt so every icon sits a little hand-placed */
function tilt(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 997;
  const deg = ((h % 9) - 4); // -4..4
  return `rotate(${deg} 16 16)`;
}

export function UnitIcon({ kind, size = 30 }: { kind: UnitKind; size?: number }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 32 32">
      <g transform={tilt(kind)} strokeLinecap="round" strokeLinejoin="round">
        {icon(kind)}
      </g>
    </svg>
  );
}

function icon(kind: UnitKind) {
  switch (kind) {
    case 'scout':
      return (<>
        <rect x="7" y="9" width="18" height="4" rx="2" fill={INK} />
        <rect x="7" y="19" width="18" height="4" rx="2" fill={INK} />
        <circle cx="16" cy="16" r="6.5" fill={RED} stroke={RED_D} strokeWidth="1.6" />
        <rect x="16" y="14.6" width="9" height="2.8" rx="1.4" fill={INK} />
      </>);
    case 'brawler':
      return (<>
        <rect x="6" y="8" width="20" height="4.5" rx="2" fill={INK} />
        <rect x="6" y="19.5" width="20" height="4.5" rx="2" fill={INK} />
        <rect x="7" y="10" width="18" height="12" rx="4" fill={RED} stroke={RED_D} strokeWidth="1.6" />
        <circle cx="15" cy="16" r="4.4" fill={RED_D} />
        <rect x="15" y="14.5" width="11" height="3" rx="1.5" fill={INK} />
      </>);
    case 'hunter':
      return (<>
        <rect x="7" y="10" width="18" height="12" rx="3.5" fill={RED} stroke={RED_D} strokeWidth="1.6" />
        <rect x="4.5" y="11" width="6" height="4" rx="2" fill={RED_D} />
        <rect x="4.5" y="17" width="6" height="4" rx="2" fill={RED_D} />
        <rect x="15" y="14.6" width="11" height="2.8" rx="1.4" fill={INK} />
        <circle cx="15" cy="16" r="3.6" fill={RED_D} />
      </>);
    case 'heavy':
      return (<>
        <rect x="5" y="8" width="22" height="16" rx="4" fill={RED} stroke={RED_D} strokeWidth="1.8" />
        <rect x="8" y="11" width="13" height="10" rx="2.5" fill={RED_D} />
        <circle cx="14" cy="16" r="4.4" fill={RED} />
        <rect x="14" y="14" width="13" height="4" rx="2" fill={INK} />
      </>);
    case 'boomer':
      return (<>
        <circle cx="16" cy="17" r="9.5" fill={RED} stroke={RED_D} strokeWidth="1.8" />
        <line x1="11.5" y1="13" x2="20" y2="21.5" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="13" x2="11.5" y2="21.5" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        <path d="M 19 9 Q 22 6 25 7" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        <circle cx="26" cy="6.5" r="2" fill="#f2a93b" />
      </>);
    case 'splitter':
      return (<>
        <rect x="6" y="9" width="20" height="14" rx="4" fill={RED} stroke={RED_D} strokeWidth="1.6" />
        <line x1="16" y1="9" x2="16" y2="23" stroke={INK} strokeWidth="2" strokeDasharray="3 2.4" strokeLinecap="round" />
        <circle cx="11" cy="16" r="2.4" fill={RED_D} />
        <circle cx="21" cy="16" r="2.4" fill={RED_D} />
      </>);
    case 'mite':
      return (<>
        <rect x="9" y="11" width="14" height="3" rx="1.5" fill={INK} />
        <rect x="9" y="18" width="14" height="3" rx="1.5" fill={INK} />
        <circle cx="16" cy="16" r="4.6" fill={RED} stroke={RED_D} strokeWidth="1.5" />
      </>);
    case 'flak':
      return (<>
        <rect x="6" y="11" width="20" height="12" rx="3.5" fill={RED} stroke={RED_D} strokeWidth="1.6" />
        <rect x="13" y="6" width="13" height="3" rx="1.5" fill={INK} transform="rotate(-18 13 7.5)" />
        <rect x="13" y="11" width="13" height="3" rx="1.5" fill={INK} transform="rotate(-18 13 12.5)" />
        <circle cx="13" cy="17" r="3.4" fill={RED_D} />
      </>);
    case 'phantom':
      return (<>
        <rect
          x="6" y="9" width="20" height="14" rx="5"
          fill={RED} fillOpacity="0.35"
          stroke={RED_D} strokeWidth="1.8" strokeDasharray="3 3"
        />
        <path d="M 10 14.5 Q 13 12.5 16 14.5 T 22 14.5" fill="none" stroke={RED_D} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M 10 18.5 Q 13 16.5 16 18.5 T 22 18.5" fill="none" stroke={RED_D} strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
      </>);
    case 'mechanic':
      return (<>
        <rect x="6" y="9" width="20" height="14" rx="4" fill={RED} stroke={RED_D} strokeWidth="1.6" />
        <rect x="14" y="11" width="4" height="10" rx="1" fill={PAPER} />
        <rect x="11" y="14" width="10" height="4" rx="1" fill={PAPER} />
      </>);
    case 'decoy':
      return (<>
        <rect
          x="6" y="9" width="20" height="14" rx="5"
          fill={RED} fillOpacity="0.3"
          stroke={RED_D} strokeWidth="1.8" strokeDasharray="4 2.6"
        />
        <circle cx="16" cy="16" r="5.4" fill="none" stroke={RED_D} strokeWidth="2" />
        <circle cx="16" cy="16" r="2.2" fill={RED_D} />
      </>);
    case 'shield':
      return (<>
        <polygon points="16,5 25.5,10.5 25.5,21.5 16,27 6.5,21.5 6.5,10.5" fill={RED} stroke={RED_D} strokeWidth="1.6" />
        <circle cx="16" cy="16" r="5.2" fill="none" stroke={RED_L} strokeWidth="2.4" />
        <circle cx="16" cy="16" r="2" fill={RED_D} />
      </>);
    case 'mortar':
      return (<>
        <rect x="6" y="9" width="20" height="14" rx="4" fill={RED} stroke={RED_D} strokeWidth="1.6" />
        <rect x="7" y="12.5" width="11" height="7" rx="3.5" fill={RED_D} />
        <circle cx="12.5" cy="16" r="4" fill={INK} />
        <circle cx="12.5" cy="16" r="2.4" fill={RED_D} />
      </>);
    case 'goliath':
      return (<>
        <polygon points="11,4 21,4 28,11 28,21 21,28 11,28 4,21 4,11" fill={RED} stroke={RED_D} strokeWidth="1.8" />
        <rect x="9" y="9" width="14" height="14" rx="3" fill={RED_D} />
        <rect x="14" y="10.5" width="14" height="2.8" rx="1.4" fill={INK} />
        <rect x="14" y="18.7" width="14" height="2.8" rx="1.4" fill={INK} />
        <circle cx="14" cy="16" r="3.6" fill={RED} />
      </>);
    case 'leviathan':
      return (<>
        <rect x="3" y="6" width="26" height="20" rx="5" fill={RED} stroke={RED_D} strokeWidth="1.8" />
        <polygon points="16,8 23,12 23,20 16,24 9,20 9,12" fill={RED_D} />
        <rect x="15" y="9.5" width="14" height="2.6" rx="1.3" fill={INK} />
        <rect x="15" y="14.7" width="15" height="2.6" rx="1.3" fill={INK} />
        <rect x="15" y="19.9" width="14" height="2.6" rx="1.3" fill={INK} />
        <circle cx="16" cy="16" r="3.4" fill="none" stroke={RED_L} strokeWidth="2" />
      </>);
  }
}

export function TowerIcon({ kind, size = 30 }: { kind: TowerKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <g transform={tilt(`tw_${kind}`)} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="16" cy="16" r="12.5" fill={PAPER} />
        <circle cx="16" cy="16" r="12.5" fill="none" stroke={INK} strokeWidth="1.6" strokeDasharray="5 3" />
        {towerIcon(kind)}
      </g>
    </svg>
  );
}

function towerIcon(kind: TowerKind) {
  switch (kind) {
    case 'gun':
      return (<>
        <circle cx="16" cy="16" r="6" fill={BLUE} stroke={BLUE_D} strokeWidth="1.4" />
        <rect x="18" y="14.4" width="11" height="3.2" rx="1.6" fill={INK} />
      </>);
    case 'swarm':
      return (<>
        <rect x="9.5" y="9.5" width="13" height="13" rx="3.5" fill={BLUE} stroke={BLUE_D} strokeWidth="1.4" />
        <circle cx="13" cy="13" r="1.8" fill={PAPER} />
        <circle cx="19" cy="13" r="1.8" fill={PAPER} />
        <circle cx="13" cy="19" r="1.8" fill={PAPER} />
        <circle cx="19" cy="19" r="1.8" fill={PAPER} />
      </>);
    case 'railgun':
      return (<>
        <circle cx="14" cy="16" r="5.5" fill={BLUE} stroke={BLUE_D} strokeWidth="1.4" />
        <rect x="15" y="14.7" width="15" height="2.6" rx="1.3" fill={INK} />
        <rect x="22" y="12.8" width="4" height="6.4" rx="2" fill={BLUE_D} />
      </>);
    case 'emp':
      return (<>
        <circle cx="16" cy="16" r="6.5" fill={BLUE} stroke={BLUE_D} strokeWidth="1.4" />
        <circle cx="16" cy="16" r="3.8" fill="none" stroke={PAPER} strokeWidth="1.8" />
        <circle cx="16" cy="16" r="1.5" fill={PAPER} />
      </>);
    case 'bertha':
      return (<>
        <rect x="8" y="10" width="14" height="12" rx="3.5" fill={BLUE} stroke={BLUE_D} strokeWidth="1.4" />
        <rect x="14" y="12.7" width="15" height="6.6" rx="3.3" fill={INK} />
        <circle cx="26" cy="16" r="2.6" fill={BLUE_D} />
      </>);
    case 'ciws':
      return (<>
        <circle cx="14" cy="16" r="5.5" fill={BLUE} stroke={BLUE_D} strokeWidth="1.4" />
        <rect x="15" y="11.8" width="11" height="2.2" rx="1.1" fill={INK} />
        <rect x="15" y="14.9" width="13" height="2.2" rx="1.1" fill={INK} />
        <rect x="15" y="18" width="11" height="2.2" rx="1.1" fill={INK} />
      </>);
    case 'arc':
      return (<>
        <circle cx="16" cy="16" r="6.5" fill={BLUE} stroke={BLUE_D} strokeWidth="1.4" />
        <polyline
          points="14,8 18,14 14,17 19,24"
          fill="none" stroke="#f2d23b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        />
      </>);
    case 'hive':
      return (<>
        <rect x="9" y="9" width="14" height="14" rx="3.5" fill={BLUE} stroke={BLUE_D} strokeWidth="1.4" />
        <polygon points="13,11.2 15.4,12.6 15.4,15.4 13,16.8 10.6,15.4 10.6,12.6" fill={PAPER} />
        <polygon points="19,11.2 21.4,12.6 21.4,15.4 19,16.8 16.6,15.4 16.6,12.6" fill={PAPER} />
        <polygon points="16,16.2 18.4,17.6 18.4,20.4 16,21.8 13.6,20.4 13.6,17.6" fill={PAPER} />
        <circle cx="23" cy="20" r="1.6" fill={INK} />
      </>);
    case 'bastion':
      return (<>
        <path d="M 7 21 A 9 9 0 0 1 25 21 Z" fill={BLUE} stroke={BLUE_D} strokeWidth="1.6" />
        <path d="M 11 21 A 5 5 0 0 1 21 21" fill="none" stroke={PAPER} strokeWidth="1.8" />
        <line x1="6" y1="21" x2="26" y2="21" stroke={BLUE_D} strokeWidth="2" strokeLinecap="round" />
      </>);
    case 'medic':
      return (<>
        <circle cx="16" cy="16" r="7" fill={BLUE} stroke={BLUE_D} strokeWidth="1.4" />
        <rect x="14.4" y="11" width="3.2" height="10" rx="1" fill={PAPER} />
        <rect x="11" y="14.4" width="10" height="3.2" rx="1" fill={PAPER} />
      </>);
  }
}

export function Brick({ size = 12 }: { size?: number }) {
  // little brick-wall mark: two offset courses
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" style={{ verticalAlign: '-1px' }}>
      <g transform="rotate(-3 6 6)">
        <rect x="0.7" y="1.7" width="10.6" height="8.6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <line x1="0.7" y1="6" x2="11.3" y2="6" stroke="currentColor" strokeWidth="1.1" />
        <line x1="6" y1="1.7" x2="6" y2="6" stroke="currentColor" strokeWidth="1.1" />
        <line x1="3.4" y1="6" x2="3.4" y2="10.3" stroke="currentColor" strokeWidth="1.1" />
        <line x1="8.6" y1="6" x2="8.6" y2="10.3" stroke="currentColor" strokeWidth="1.1" />
      </g>
    </svg>
  );
}
