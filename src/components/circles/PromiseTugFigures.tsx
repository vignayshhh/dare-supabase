import { StickmanBody } from './StickmanBody';
import './promise-tug.css';

type Person = { id: string; name: string; avatar?: string };

/** Decorative figures reuse chatlist geometry; the existing bar owns vote data. */
export function PromiseTugFigures({ voters, votes, reveal, active = true, colors = ['#facc15', '#b89a57'] }: {
  voters: Person[];
  votes: Record<string, string>;
  reveal: boolean;
  active?: boolean;
  colors?: [string, string];
}) {
  const root = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const element = root.current;
    if (!element || !active) { setRunning(false); return; }
    let visible = false;
    const update = () => setRunning(visible && document.visibilityState === 'visible');
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting && entry.intersectionRatio >= .5; update(); }, { threshold: [0, .5] });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, [active]);
  return <div ref={root} className="promise-tug-figures" data-pulling={running} aria-hidden="true">
    {(['keep', 'break'] as const).map(side => {
      const people = reveal ? voters.filter(person => votes[person.id] === side).slice(0, 2) : [];
      // Before results, neutral figures represent choices, never invented voters.
      const figures = reveal ? people : [{ id: `${side}-choice`, name: '' }];
      return <div key={side} className={`promise-tug-team promise-tug-team--${side}`}>
        {figures.map(person => <div className="promise-tug-person" key={person.id}>
          <div className="promise-tug-scale">
            <StickmanBody label={person.name} avatar={'avatar' in person ? person.avatar : undefined}
              statusId="available" color={side === 'keep' ? colors[0] : colors[1]} animate={false} />
          </div>
        </div>)}
      </div>;
    })}
  </div>;
}
import { useEffect, useRef, useState } from 'react';
