// The cover: the picture, the title and tagline on a dark panel, and Start. A click anywhere, Enter or Space starts.
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { glossary } from '../content';
import cover from '../cover.webp';

const TAGLINE = glossary('hft')?.short ?? '';

export function Cover({ onStart }: { onStart: () => void }) {
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => start.current?.focus(), []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    // Stop the focused button also clicking, which would start twice.
    e.preventDefault();
    onStart();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ') e.preventDefault();
  };

  return (
    <div
      className="cover"
      role="dialog"
      aria-label="Propshop"
      onClick={onStart}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
    >
      <img src={cover} alt="" />
      <div className="cover-panel">
        <h1>Propshop</h1>
        <p>{TAGLINE}</p>
        <button type="button" ref={start}>
          Start
        </button>
      </div>
    </div>
  );
}
