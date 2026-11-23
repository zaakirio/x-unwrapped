// Runs one collection job at a time in a single tab: likes, then bookmarks (Saved on Threads), then posts.
// Job state lives in storage because Chrome stops idle service workers.

const YEAR_MS = 365 * 86_400_000;

// Threads keeps posts and replies on separate profile tabs, so it reads both into `posts`.
const PLATFORMS = {
  x: {
    steps: ['likes', 'bookmarks', 'posts'],
    url: (step, handle) =>
      ({ likes: 'https://x.com/i/history/likes', bookmarks: 'https://x.com/i/history', posts: `https://x.com/${handle}/with_replies` })[step],
  },
  threads: {
    steps: ['likes', 'bookmarks', 'posts', 'replies'],
    url: (step, handle) =>
      ({
        likes: 'https://www.threads.com/liked',
        bookmarks: 'https://www.threads.com/saved',
        posts: `https://www.threads.com/@${handle}`,
        replies: `https://www.threads.com/@${handle}/replies`,
      })[step],
  },
};
const KINDS = ['likes', 'bookmarks', 'posts'];
const kindOf = (step) => (step === 'replies' ? 'posts' : step);

const getJob = async () => (await chrome.storage.local.get('job')).job || null;
const setJob = (job) => chrome.storage.local.set({ job });
const stepUrl = (job) => PLATFORMS[job.platform].url(job.step, job.handle);

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('index.html') }));

async function start(appTabId, platform) {
  await chrome.storage.local.remove(KINDS.map((k) => `result:${k}`));
  const job = {
    status: 'running',
    platform,
    index: 0,
    step: PLATFORMS[platform].steps[0],
    kind: 'likes',
    appTabId,
    tabId: null,
    cutoff: Date.now() - YEAR_MS,
    handle: null,
    counts: {},
    message: '',
  };
  const tab = await chrome.tabs.create({ url: stepUrl(job), active: true });
  job.tabId = tab.id;
  await setJob(job);
}

async function onResult(job, payload) {
  const key = `result:${job.kind}`;
  if (job.step === 'replies') {
    const { [key]: prev } = await chrome.storage.local.get(key);
    const ids = new Set(prev.tweets.map((t) => t.id));
    prev.tweets.push(...payload.tweets.filter((t) => !ids.has(t.id)));
    prev.count = prev.tweets.length;
    payload = prev;
  }
  await chrome.storage.local.set({ [key]: { ...payload, kind: job.kind } });
  job.counts[job.kind] = payload.count;
  job.handle = job.handle || payload.account;
  const steps = PLATFORMS[job.platform].steps;
  job.index += 1;
  if (job.index < steps.length) {
    job.step = steps[job.index];
    job.kind = kindOf(job.step);
    job.base = job.step === 'replies' ? job.counts.posts || 0 : 0;
    await setJob(job);
    await chrome.tabs.update(job.tabId, { url: stepUrl(job) });
    return;
  }
  job.status = 'done';
  job.kind = null;
  await setJob(job);
  await chrome.tabs.update(job.appTabId, { active: true }).catch(() => chrome.tabs.create({ url: chrome.runtime.getURL('index.html') }));
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === 'start') return start(sender.tab.id, msg.platform === 'threads' ? 'threads' : 'x');
    const job = await getJob();
    // Every other message comes from the tab that the job opened.
    if (!job || job.status !== 'running' || sender.tab?.id !== job.tabId) return null;
    if (msg.type === 'job?') return { platform: job.platform, step: job.step, kind: job.kind, cutoff: job.cutoff, url: stepUrl(job) };
    if (msg.type === 'progress') {
      // Replies add to the posts already read from the profile tab.
      job.counts[job.kind] = (job.base || 0) + msg.count;
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
    job.message = `The ${job.platform === 'threads' ? 'Threads' : 'X'} tab was closed before it finished.`;
    await setJob(job);
  }
});
