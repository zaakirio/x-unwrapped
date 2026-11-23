// Runs in the threads.com page (MAIN world) for the Unwrapped extension. Threads renders the first
// posts into the HTML and loads the rest from GraphQL as you scroll; both are read here, so nothing
// extra is requested from Threads. Driven by bridge.js through window messages.
(function () {
  'use strict';

  // ---------- Parsing (pure, also loaded by the Node tests) ----------

  const MEDIA = { 1: 'photo', 2: 'video' };

  function mediaOf(post) {
    if (post.media_type === 8) return (post.carousel_media || []).map((m) => ({ type: MEDIA[m.media_type] || 'photo' }));
    return MEDIA[post.media_type] ? [{ type: MEDIA[post.media_type] }] : [];
  }

  function normalizePost(post, depth = 0) {
    const user = post.user || {};
    const info = post.text_post_app_info || {};
    const quoted = depth === 0 && info.share_info?.quoted_post ? normalizePost(info.share_info.quoted_post, 1) : null;
    return {
      id: String(post.pk),
      url: `https://www.threads.com/@${user.username}/post/${post.code}`,
      created_at: post.taken_at ? new Date(post.taken_at * 1000).toISOString() : null,
      author: { id: user.pk || user.id || null, screen_name: user.username, name: user.full_name || user.username, avatar: user.profile_pic_url || null },
      text: post.caption?.text || '',
      lang: post.detected_language || null,
      reply_to: info.reply_to_author?.username ? { screen_name: info.reply_to_author.username } : null,
      metrics: {
        likes: post.like_and_view_counts_disabled ? null : post.like_count ?? null,
        replies: info.direct_reply_count ?? null,
        reposts: info.repost_count ?? null,
        quotes: info.quote_count ?? null,
        views: null,
      },
      media: mediaOf(post),
      quoted,
      retweet_of: null,
    };
  }

  // Threads come as `thread_items` lists: a post plus the posts it replies to, oldest first.
  // In Liked and Saved the action is on the last item; on a profile every item can be yours.
  function extractPosts(json, lastOnly) {
    const posts = [];
    let ended = false;
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (Array.isArray(node.edges) && node.edges.some((e) => e?.node?.thread_items) && node.page_info?.has_next_page === false) ended = true;
      if (Array.isArray(node.thread_items)) {
        const items = node.thread_items.map((i) => i?.post).filter((p) => p?.pk && p.user?.username);
        posts.push(...(lastOnly ? items.slice(-1) : items));
        return;
      }
      Object.values(node).forEach(walk);
    };
    walk(json);
    return { posts: posts.map((p) => normalizePost(p)), ended };
  }

  // Responses can be prefixed with `for (;;);` and stream several JSON objects, one per line.
  function parseBodies(text) {
    const body = text.replace(/^for \(;;\);/, '');
    try {
      return [JSON.parse(body)];
    } catch {
      return body.split(/\r?\n/).filter((l) => l.startsWith('{')).flatMap((l) => {
        try {
          return [JSON.parse(l)];
        } catch {
          return [];
        }
      });
    }
  }

  if (typeof window === 'undefined') {
    module.exports = { normalizePost, extractPosts, parseBodies };
    return;
  }

  // ---------- Capture ----------

  const IDLE_STOP_MS = 30000;
  const GRAPHQL = /\/(api\/)?graphql/;

  let bucket = newBucket(location.pathname);

  function newBucket(path) {
    return { path, tweets: new Map(), ended: false, lastNewAt: Date.now() };
  }

  const lastOnly = () => /^\/(liked|saved)\/?$/.test(location.pathname);

  function ingest(text) {
    // A new page in the app starts a new list.
    if (bucket.path !== location.pathname) bucket = newBucket(location.pathname);
    for (const json of parseBodies(text)) {
      const { posts, ended } = extractPosts(json, lastOnly());
      for (const p of posts) {
        if (bucket.tweets.has(p.id)) continue;
        bucket.tweets.set(p.id, p);
        bucket.lastNewAt = Date.now();
      }
      if (ended) bucket.ended = true;
    }
  }

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__unwrapUrl = String(url);
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (GRAPHQL.test(this.__unwrapUrl || '')) {
      this.addEventListener('loadend', () => {
        if (this.status !== 200) return;
        try {
          ingest(this.responseType === 'json' ? JSON.stringify(this.response) : this.responseText);
        } catch {
          // Binary or unreadable responses hold no posts.
        }
      });
    }
    return origSend.apply(this, arguments);
  };

  const origFetch = window.fetch;
  window.fetch = function (input) {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const p = origFetch.apply(this, arguments);
    if (GRAPHQL.test(url)) p.then((res) => res.status === 200 && res.clone().text().then(ingest)).catch(() => {});
    return p;
  };

  // The first page of posts ships inside the HTML.
  function readEmbedded() {
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      if (s.textContent.includes('thread_items')) ingest(s.textContent);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', readEmbedded, { once: true });
  else readEmbedded();

  function viewerHandle() {
    // The side menu links to your profile as a bare /@handle next to /activity; post author links
    // live elsewhere on the page, so search only inside the menu.
    let menu = document.querySelector('a[href="/activity"]');
    while (menu && !menu.querySelector('a[href^="/@"]')) menu = menu.parentElement;
    const link = menu?.querySelector('a[href^="/@"]');
    return link ? link.getAttribute('href').slice(2).replace(/\/.*$/, '') : null;
  }

  function post(message) {
    window.postMessage({ source: 'xunwrapped-page', ...message }, location.origin);
  }

  // Lists are newest-action first, so a long run of old posts means the cutoff has passed.
  function pastCutoff(kind, cutoff) {
    const need = kind === 'likes' || kind === 'bookmarks' ? 40 : 5;
    const me = viewerHandle()?.toLowerCase();
    let run = 0;
    const tweets = [...bucket.tweets.values()];
    for (let i = tweets.length - 1; i >= 0 && run < need; i--) {
      const t = tweets[i];
      if (!t.created_at) continue;
      if (need === 5 && t.author.screen_name.toLowerCase() !== me) continue;
      if (Date.parse(t.created_at) >= cutoff) return false;
      run++;
    }
    return run >= need;
  }

  // Threads can scroll the window or an inner column depending on layout; scroll whichever holds the posts.
  function scrollDown() {
    const posts = document.querySelectorAll('a[href*="/post/"]');
    let el = posts[posts.length - 1]?.parentElement;
    while (el && !(el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    const box = el || document.scrollingElement || document.documentElement;
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) box.scrollTop -= 400;
    box.scrollTop = box.scrollHeight;
  }

  let timer = null;

  function run(kind, cutoff) {
    const finish = () => {
      clearInterval(timer);
      timer = null;
      post({
        type: 'done',
        kind,
        payload: {
          platform: 'threads',
          kind,
          exported_at: new Date().toISOString(),
          account: viewerHandle(),
          complete: bucket.ended,
          count: bucket.tweets.size,
          tweets: [...bucket.tweets.values()],
        },
      });
    };
    bucket.lastNewAt = Date.now();
    timer = setInterval(() => {
      if (bucket.ended || pastCutoff(kind, cutoff) || Date.now() - bucket.lastNewAt > IDLE_STOP_MS) return finish();
      scrollDown();
      post({ type: 'progress', kind, count: bucket.tweets.size, rateLimitedUntil: 0 });
    }, 1200);
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'xunwrapped-bridge') return;
    if (e.data.type === 'run' && !timer) run(e.data.kind, e.data.cutoff);
  });
})();
