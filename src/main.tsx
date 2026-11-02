// The page: makes the store, mounts the UI, and runs the loop. The wall clock is read here and in the store,
// nowhere nearer the sim.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CONTENT } from './content';
import { App } from './ui/App';
import { createStore } from './ui/store';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('No #root in the page.');

const store = createStore(CONTENT, window.localStorage, Date.now() >>> 0);
createRoot(root).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);

// Frames drive the sim; a timer keeps it moving when the tab is throttled and frames come slowly or not at all.
const loop = (t: number) => {
  store.pump(t);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
setInterval(() => store.pump(performance.now()), 100);
window.addEventListener('pagehide', () => store.save());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.save();
});

// For poking at from the console and from tests.
declare global {
  interface Window {
    propshop: typeof store;
  }
}
window.propshop = store;
