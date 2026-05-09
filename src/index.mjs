import { createApp } from './deps/vue.mjs';
import App from './components/App.mjs';
import { loadData, startClock } from './services/data.mjs';

await loadData();
startClock();

const app = createApp(App);
app.mount(document.getElementById('root'));

if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
