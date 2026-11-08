// The page: makes the store, mounts the UI, and runs the loop. The wall clock is read here and in the store,
// nowhere nearer the sim.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CONTENT } from './content';
import { Root } from './ui/Root';
import { WorkerRunner, type NightRunner } from './ui/nights';
import { readSave, workerPacker } from './ui/savefile';
import { createStore, SAVE_KEY } from './ui/store';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('No #root in the page.');

// The night's tests run in a worker; a browser that refuses one, or a worker that fails, runs them on the main
// thread in closed hours.
const runner: NightRunner = new WorkerRunner(
  () => new Worker(new URL('./backtest.worker.ts', import.meta.url), { type: 'module' }),
  CONTENT,
);

// The save is kept packed (it outgrows localStorage as JSON), packed in a worker of its own, and unpacked before
// the store is made.
const saved = await readSave(window.localStorage.getItem(SAVE_KEY));
const pack = workerPacker(() => new Worker(new URL('./save.worker.ts', import.meta.url), { type: 'module' }));
const store = createStore(CONTENT, window.localStorage, Date.now() >>> 0, () => performance.now(), runner, {
  pack,
  saved,
});
createRoot(root).render(
  <StrictMode>
    <Root store={store} storage={window.localStorage} />
  </StrictMode>,
);

// Frames drive the sim; a timer keeps it moving when the tab is throttled and frames come slowly or not at all.
const loop = (t: number) => {
  store.pump(t);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
setInterval(() => store.pump(performance.now()), 100);
// The page's last save is packed out of the frame, so a reload or a closed tab may beat it: the save before stands.
window.addEventListener('pagehide', () => void store.save());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void store.save();
});

// For poking at from the console and from tests.
declare global {
  interface Window {
    propshop: typeof store;
  }
}
window.propshop = store;
