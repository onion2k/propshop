// The root: the cover first, with the store held still beneath it, then the game once the player starts.
import { useEffect, useState } from 'react';
import { App } from './App';
import { Cover } from './Cover';
import type { Store } from './store';

export function Root({ store }: { store: Store }) {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    store.hold(!started);
  }, [store, started]);
  // Held at once, before the first effect runs, so no frame slips through.
  if (!started) store.hold(true);
  return started ? <App store={store} /> : <Cover onStart={() => setStarted(true)} />;
}
