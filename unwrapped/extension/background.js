// Runs one collection job at a time: likes, then bookmarks, then posts, in a single X tab.
// Job state lives in storage because Chrome stops idle service workers.

const STEPS = ['likes', 'bookmarks', 'posts'];
const YEAR_MS = 365 * 86_400_000;

export function stepUrl(kind, handle) {
  if (kind === 'likes') return 'https://x.com/i/history/likes';
  if (kind === 'bookmarks') return 'https://x.com/i/history';
  return `https://x.com/${handle}/with_replies`;
}

const getJob = async () => (await chrome.storage.local.get('job')).job || null;
const setJob = (job) => chrome.storage.local.set({ job });

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('index.html') }));

async function start(appTabId) {
  await chrome.storage.local.remove(STEPS.map((k) => `result:${k}`));
  const tab = await chrome.tabs.create({ url: stepUrl('likes'), active: true });
  await setJob({
    status: 'running',
    step: 0,
    kind: 'likes',
    appTabId,
    tabId: tab.id,
    cutoff: Date.now() - YEAR_MS,
    handle: null,
    counts: {},
    message: '',
  });
}

async function onResult(job, payload) {
  await chrome.storage.local.set({ [`result:${payload.kind}`]: payload });
  job.counts[payload.kind] = payload.count;
  job.handle = job.handle || payload.account;
  job.step += 1;
  if (job.step < STEPS.length) {
    job.kind = STEPS[job.step];
    await setJob(job);
    await chrome.tabs.update(job.tabId, { url: stepUrl(job.kind, job.handle) });
    return;
  }
  job.status = 'done';
  job.kind = null;
  await setJob(job);
  await chrome.tabs.update(job.appTabId, { active: true }).catch(() => chrome.tabs.create({ url: chrome.runtime.getURL('index.html') }));
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === 'start') return start(sender.tab.id);
    const job = await getJob();
    // Every other message comes from the X tab that the job opened.
    if (!job || job.status !== 'running' || sender.tab?.id !== job.tabId) return null;
    if (msg.type === 'job?') return { kind: job.kind, cutoff: job.cutoff, url: stepUrl(job.kind, job.handle) };
    if (msg.type === 'progress') {
      job.counts[msg.kind] = msg.count;
      job.message = msg.message || '';
      return setJob(job);
    }
    if (msg.type === 'result') return onResult(job, msg.payload);
    if (msg.type === 'failed') {
      job.status = 'error';
      job.message = msg.message;
      return setJob(job);
    }
  })().then(reply, (e) => reply({ error: String(e) }));
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const job = await getJob();
  if (job?.status === 'running' && tabId === job.tabId) {
    job.status = 'error';
    job.message = 'The X tab was closed before it finished.';
    await setJob(job);
  }
});
