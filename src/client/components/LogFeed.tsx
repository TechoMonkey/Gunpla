import { useEffect, useRef } from 'react';
import { useMatchCtx } from '../lib';

export function LogFeed({ limit = 400 }: { limit?: number }) {
  const { view } = useMatchCtx();
  const ref = useRef<HTMLDivElement>(null);
  const entries = view.log.slice(-limit);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view.log.length]);
  return (
    <div className="log" ref={ref}>
      {entries.map((e) => (
        <div key={e.n} className={`log-entry log-${e.kind} ${e.seat ? `side-${e.seat}` : ''}`}>
          {e.round > 0 && <span className="log-when">R{e.round}</span>}
          <span>{e.text}</span>
        </div>
      ))}
    </div>
  );
}
