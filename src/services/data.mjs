import { reactive } from '../deps/vue.mjs';

export const store = reactive({
  loaded: false,
  error: null,
  data: null,
  now: new Date(),
});

export async function loadData() {
  try {
    const res = await fetch('./data.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    store.data = await res.json();
    store.loaded = true;
  } catch (err) {
    store.error = err.message || String(err);
    store.loaded = true;
  }
}

export function startClock() {
  const tick = () => { store.now = new Date(); };
  tick();
  const slot = 30 * 60_000;
  const ms = Date.now();
  const msToNext = slot - (ms % slot);
  setTimeout(() => {
    tick();
    setInterval(tick, slot);
  }, msToNext + 100);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}
