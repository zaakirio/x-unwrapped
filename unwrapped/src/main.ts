import '@fontsource-variable/inter';
import './style.css';
import { decodeSummary, encodeSummary } from './link';
import { Ribbon } from './ribbon';
import { esc, fmt, yearOf } from './slides';
import { PERSONAS, parseExport, summarize, type Summary } from './stats';
import { playStory } from './story';

const app = document.getElementById('app')!;
const EXPORTER = 'x-export.user.js';

function shareUrl(token: string) {
  return `${location.origin}${location.pathname}#u=${token}`;
}

let stopBackdrop = () => {};

function backdrop(canvas: HTMLCanvasElement) {
  const ribbon = new Ribbon(canvas);
  let alive = true;
  const t0 = performance.now();
  const frame = (now: number) => {
    if (!alive) return;
    const dpr = Math.min(2, devicePixelRatio);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) Object.assign(canvas, { width: w, height: h });
    ribbon.render((now - t0) / 1000, [0.42, -0.02, 0.95, 1.0]);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return () => (alive = false);
}

function landing(shared: Summary | null, token: string | null) {
  const year = shared ? yearOf(shared) : String(new Date().getFullYear());
  const cards = shared
    ? [`${fmt(shared.likes)} likes`, `${fmt(shared.bookmarks)} saves`, PERSONAS[shared.persona.id].name]
    : ['Top accounts', 'The Vault', 'Your persona'];
  app.innerHTML = `
    <main class="landing">
      <canvas class="backdrop"></canvas>
      <div class="hero">
        ${shared ? `<p class="handle">@${esc(shared.handle)}</p>` : '<p class="handle">X Unwrapped</p>'}
        <h1 class="display">Your X<br>Unwrapped<br>${esc(year)}</h1>
        <p class="range glass">${shared ? `${rangeLabel(shared)}` : 'Your last 12 months on X'}</p>
        <div class="cta">
          ${shared ? '<button class="primary" data-action="play">Play their Unwrapped</button>' : ''}
          <label class="${shared ? 'secondary' : 'primary'} file-btn">
            ${shared ? 'Make your own' : 'Make your Unwrapped'}
            <input type="file" accept=".json,application/json" multiple hidden>
          </label>
        </div>
        <p class="privacy">${shared
          ? 'This link holds only summary stats. No posts, no logins.'
          : 'Your data never leaves your browser. Drop the likes and bookmarks JSON files from the <a href="' + EXPORTER + '">X exporter</a> anywhere on this page.'}</p>
        <p class="error" role="alert"></p>
      </div>
      <div class="floaters">${cards.map((c, i) => `<div class="glass floater f${i}">${esc(c)}</div>`).join('')}</div>
    </main>`;

  stopBackdrop = backdrop(app.querySelector<HTMLCanvasElement>('.backdrop')!);
  const input = app.querySelector<HTMLInputElement>('input[type=file]')!;
  input.addEventListener('change', () => input.files && build([...input.files]));
  app.querySelector('[data-action=play]')?.addEventListener('click', () => play(shared!, token!));
}

function rangeLabel(s: Summary) {
  const f = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${f(s.from)} – ${f(s.to)}`;
}

async function build(files: File[]) {
  const error = app.querySelector<HTMLElement>('.error');
  try {
    const exports = await Promise.all(files.map(async (f) => parseExport(await f.text())));
    const summary = summarize(exports);
    const token = await encodeSummary(summary);
    history.replaceState(null, '', `#u=${token}`);
    play(summary, token);
  } catch (e) {
    if (error) error.textContent = (e as Error).message;
  }
}

function play(s: Summary, token: string) {
  stopBackdrop();
  playStory(app, s, shareUrl(token), () => landing(s, token));
}

addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault();
  const files = [...(e.dataTransfer?.files || [])].filter((f) => f.name.endsWith('.json'));
  if (files.length) build(files);
});

async function start() {
  const token = new URLSearchParams(location.hash.slice(1)).get('u');
  if (!token) return landing(null, null);
  try {
    landing(await decodeSummary(token), token);
  } catch {
    landing(null, null);
    app.querySelector('.error')!.textContent = 'This share link is broken or incomplete.';
  }
}

start();
