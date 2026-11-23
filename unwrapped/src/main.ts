import '@fontsource-variable/inter';
import './style.css';
import { readArchive } from './archive';
import { decodeSummary, encodeSummary } from './link';
import { Ribbon } from './ribbon';
import { download } from './share';
import { esc, fmt, yearOf } from './slides';
import { PERSONAS, parseExport, summarize, type ExportFile, type Kind, type Summary } from './stats';
import { playStory } from './story';
import { SITE_URL } from './site';

const app = document.getElementById('app')!;
const EXPORTER = 'x-export.user.js';
// Inside the extension the app runs as an extension page and can talk to the collector.
const ext = typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome : null;
const KINDS: Kind[] = ['likes', 'bookmarks', 'posts'];

function shareUrl(token: string) {
  return SITE_URL ? `${SITE_URL}#u=${token}` : null;
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

interface Job {
  status: 'running' | 'done' | 'error';
  kind: Kind | null;
  counts: Partial<Record<Kind, number>>;
  message: string;
}

async function storedExports(): Promise<ExportFile[]> {
  const got = await ext!.storage.local.get(KINDS.map((k) => `result:${k}`));
  return KINDS.map((k) => got[`result:${k}`] as ExportFile | undefined).filter((f): f is ExportFile => !!f);
}

function landing(shared: Summary | null, token: string | null) {
  const year = shared ? yearOf(shared) : String(new Date().getFullYear());
  const cards = shared
    ? [`${fmt(shared.likes)} likes`, `${fmt(shared.bookmarks)} saves`, PERSONAS[shared.persona.id].name]
    : ['Top accounts', 'The Vault', 'Your persona'];
  const fileButton = (label: string, cls: string) => `
    <label class="${cls} file-btn">${label}<input type="file" accept=".json,.zip,application/json,application/zip" multiple hidden></label>`;
  const cta = shared
    ? `<button class="primary" data-action="play">Play their Unwrapped</button>${fileButton('Make your own', 'secondary')}`
    : ext
      ? `<button class="primary" data-action="collect">Make my Unwrapped</button>${fileButton('Upload an export', 'secondary')}`
      : fileButton('Make your Unwrapped', 'primary');
  const privacy = shared
    ? 'This link holds only summary stats. No posts, no logins.'
    : ext
      ? 'Opens X in a new tab and reads your likes, bookmarks and posts from the last 12 months, right in your browser. Or upload your X data archive (.zip).'
      : `Your data never leaves your browser. Drop your <a href="https://x.com/settings/download_your_data" target="_blank" rel="noopener">X data archive</a> (.zip) or the JSON files from the <a href="${EXPORTER}">exporter</a> anywhere on this page.`;
  app.innerHTML = `
    <main class="landing">
      <canvas class="backdrop"></canvas>
      <div class="hero">
        <p class="handle">${shared ? `@${esc(shared.handle)}` : 'X Unwrapped'}</p>
        <h1 class="display">Your X<br>Unwrapped<br>${esc(year)}</h1>
        <p class="range glass">${shared ? rangeLabel(shared) : 'Your last 12 months on X'}</p>
        <div class="cta">${cta}</div>
        <div class="saved"></div>
        <p class="privacy">${privacy}</p>
        <p class="error" role="alert"></p>
      </div>
      <div class="floaters">${cards.map((c, i) => `<div class="glass floater f${i}">${esc(c)}</div>`).join('')}</div>
    </main>`;

  stopBackdrop = backdrop(app.querySelector<HTMLCanvasElement>('.backdrop')!);
  const input = app.querySelector<HTMLInputElement>('input[type=file]')!;
  input.addEventListener('change', () => input.files && build([...input.files]));
  app.querySelector('[data-action=play]')?.addEventListener('click', () => play(shared!, token!));
  if (ext && !shared) extensionControls();
}

// Extension: start a collection, follow its progress, and offer the last result.
async function extensionControls() {
  const saved = app.querySelector<HTMLElement>('.saved')!;
  const collect = app.querySelector<HTMLButtonElement>('[data-action=collect]')!;
  collect.addEventListener('click', () => ext!.runtime.sendMessage({ type: 'start' }));

  const show = async (job: Job | undefined) => {
    if (!app.contains(saved)) return;
    const files = await storedExports();
    collect.disabled = job?.status === 'running';
    collect.textContent = job?.status === 'running' ? 'Collecting on X...' : files.length ? 'Collect again' : 'Make my Unwrapped';
    const progress = job?.status === 'running'
      ? `<p class="progress-line">${KINDS.map((k) => `${k[0].toUpperCase()}${k.slice(1)}: ${job.counts[k] != null ? fmt(job.counts[k]!) : k === job.kind ? '...' : '-'}`).join(' · ')}</p>`
      : '';
    const ready = job?.status !== 'running' && files.length
      ? `<div class="cta"><button class="primary" data-action="play-saved">Play my Unwrapped</button><button class="secondary" data-action="export">Download JSON</button></div>`
      : '';
    saved.innerHTML = progress + ready;
    app.querySelector<HTMLElement>('.error')!.textContent = job?.status === 'error' ? job.message : '';
    saved.querySelector('[data-action=play-saved]')?.addEventListener('click', () => start(files));
    saved.querySelector('[data-action=export]')?.addEventListener('click', () => {
      const day = new Date().toISOString().slice(0, 10);
      files.forEach((f) => download(new Blob([JSON.stringify(f, null, 2)], { type: 'application/json' }), `x-${f.kind}-${f.account}-${day}.json`));
    });
    return files;
  };

  let { job } = (await ext!.storage.local.get('job')) as { job?: Job };
  await show(job);
  ext!.storage.onChanged.addListener(async (changes) => {
    if (!changes.job) return;
    const was = job?.status;
    job = changes.job.newValue as Job | undefined;
    const files = await show(job);
    if (was === 'running' && job?.status === 'done' && files) start(files);
  });
}

function rangeLabel(s: Summary) {
  const f = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${f(s.from)} – ${f(s.to)}`;
}

async function readFiles(files: File[]) {
  const out: ExportFile[] = [];
  for (const f of files) {
    if (f.name.toLowerCase().endsWith('.zip')) out.push(...(await readArchive(f)));
    else out.push(parseExport(await f.text()));
  }
  return out;
}

async function start(exports: ExportFile[]) {
  const summary = summarize(exports);
  const token = await encodeSummary(summary);
  if (!ext) history.replaceState(null, '', `#u=${token}`);
  play(summary, token);
}

async function build(files: File[]) {
  const error = app.querySelector<HTMLElement>('.error');
  if (error) error.textContent = files.some((f) => f.name.endsWith('.zip')) ? 'Reading your archive...' : '';
  try {
    await start(await readFiles(files));
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
  const files = [...(e.dataTransfer?.files || [])].filter((f) => /\.(json|zip)$/i.test(f.name));
  if (files.length) build(files);
});

async function boot() {
  const token = new URLSearchParams(location.hash.slice(1)).get('u');
  if (!token) return landing(null, null);
  try {
    landing(await decodeSummary(token), token);
  } catch {
    landing(null, null);
    app.querySelector('.error')!.textContent = 'This share link is broken or incomplete.';
  }
}

boot();
