import { useEffect, useRef } from 'react';
import { renderer, sim } from '../state/store';

export function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) renderer.mount(ref.current, sim);
  }, []);

  return <div ref={ref} className="canvas-host" />;
}
