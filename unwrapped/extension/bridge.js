// Content script on x.com and threads.com. When this tab belongs to a running job, it starts the
// collector on the right page, relays its progress and result to the background worker, and shows a progress overlay.

const THREADS = location.hostname.endsWith('threads.com');
const LABELS = { likes: 'Likes', bookmarks: THREADS ? 'Saved' : 'Bookmarks', posts: 'Posts' };
const STALL_MS = 25_000;

const until = (test, every = 300) =>
  new Promise((ok) => {
    const check = () => (test() ? ok() : setTimeout(check, every));
    check();
  });

// The signed-in user's own profile link in the side bar, as a handle without the leading / or /@.
function viewerHandle() {
  if (!THREADS) return document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href').slice(1) || null;
  const link = [...document.querySelectorAll('a[href^="/@"]')].find((a) => a.querySelector('svg[aria-label="Profile"]'));
  return link ? link.getAttribute('href').slice(2).replace(/\/.*$/, '') : null;
}
const onLoginPage = () => /^\/(i\/flow\/login|login|i\/flow\/signup)/.test(location.pathname) || (!THREADS && location.pathname === '/');

async function main() {
  const job = await chrome.runtime.sendMessage({ type: 'job?' });
  if (!job || job.error) return;
  await until(() => document.body);
  const overlay = mountOverlay();
  render(overlay, (await chrome.storage.local.get('job')).job);
  chrome.storage.onChanged.addListener((changes) => changes.job && render(overlay, changes.job.newValue));

  await until(() => viewerHandle() || onLoginPage());
  if (!viewerHandle()) {
    overlay.note(`Log in to ${THREADS ? 'Threads' : 'X'} in this tab. Unwrapping starts right after.`);
    await until(viewerHandle, 1000);
  }

  // The first list may not name the account; fill it in from the side bar.
  const handle = viewerHandle();
  const url = job.url.replace(/\/(@?)null(\/|$)/, `/$1${handle}$2`);
  if (location.pathname.toLowerCase() !== new URL(url).pathname.toLowerCase()) {
    location.assign(url);
    return;
  }

  let lastProgress = Date.now();
  let lastSent = 0;
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'xunwrapped-page') return;
    const m = e.data;
    if (m.type === 'progress') {
      lastProgress = Date.now();
      if (Date.now() - lastSent < 1000) return;
      lastSent = Date.now();
      const message = m.rateLimitedUntil > Date.now()
        ? `X asked us to slow down. Resuming at ${new Date(m.rateLimitedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
        : '';
      chrome.runtime.sendMessage({ type: 'progress', kind: m.kind, count: m.count, message });
    } else if (m.type === 'done') {
      chrome.runtime.sendMessage({ type: 'result', payload: m.payload });
    } else if (m.type === 'stopped') {
      chrome.runtime.sendMessage({ type: 'failed', message: m.message });
    }
  });

  window.postMessage({ source: 'xunwrapped-bridge', type: 'run', kind: job.kind, cutoff: job.cutoff }, location.origin);
  // The exporter only starts on a page it recognises; if nothing moves, say so instead of hanging.
  const stall = setInterval(() => {
    if (Date.now() - lastProgress > STALL_MS) {
      clearInterval(stall);
      chrome.runtime.sendMessage({ type: 'failed', message: `Could not read your ${LABELS[job.kind]} on this page.` });
    }
  }, 2000);
}

function mountOverlay() {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:auto 0 24px 0;z-index:2147483647;display:flex;justify-content:center;pointer-events:none';
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      .card { pointer-events: auto; width: min(420px, calc(100vw - 32px)); padding: 20px 22px; border-radius: 22px;
        font: 600 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #f6f3ee;
        background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02)), rgba(12,12,18,.86);
        backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,.14); box-shadow: 0 24px 80px rgba(0,0,0,.55); position: relative; overflow: hidden; }
      .card::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; background: linear-gradient(90deg, #1d6bff, #9a3cff, #ff6a4a); }
      h2 { margin: 0 0 12px; font-size: 20px; font-weight: 800; letter-spacing: -.02em; }
      .row { display: flex; justify-content: space-between; padding: 7px 0; border-top: 1px solid rgba(255,255,255,.08); }
      .row b { font-variant-numeric: tabular-nums; }
      .row.now span::after { content: ''; display: inline-block; width: 6px; height: 6px; margin-left: 8px; border-radius: 50%;
        background: #9a3cff; box-shadow: 0 0 10px #9a3cff; animation: pulse 1s ease-in-out infinite; vertical-align: middle; }
      .row.wait { opacity: .45; }
      .note { margin-top: 10px; color: rgba(246,243,238,.65); font-weight: 500; }
      .note.err { color: #ff8a6a; }
      @keyframes pulse { 50% { opacity: .3; } }
    </style>
    <div class="card"><h2>Unwrapping your year</h2><div class="rows"></div><p class="note"></p></div>`;
  const noteEl = root.querySelector('.note');
  return {
    root,
    note(text, error = false) {
      noteEl.textContent = text;
      noteEl.className = error ? 'note err' : 'note';
    },
  };
}

function render(overlay, job) {
  if (!job) return;
  overlay.root.querySelector('.rows').innerHTML = Object.keys(LABELS)
    .map((kind) => {
      const count = job.counts?.[kind];
      const state = job.kind === kind && job.status === 'running' ? 'now' : count == null ? 'wait' : 'done';
      const value = count == null ? (state === 'now' ? 'starting' : 'waiting') : `${count.toLocaleString()}${state === 'done' ? ' ✓' : ''}`;
      return `<div class="row ${state}"><span>${LABELS[kind]}</span><b>${value}</b></div>`;
    })
    .join('');
  if (job.status === 'error') overlay.note(job.message, true);
  else if (job.status === 'done') overlay.note('All done. Your Unwrapped is ready in the other tab.');
  else overlay.note(job.message || 'Keep this tab open. It scrolls by itself, about a minute per list.');
}

main();
