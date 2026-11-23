// ==UserScript==
// @name         X Likes, Bookmarks & Posts Exporter
// @namespace    https://github.com/zaakirio/x-unwrapped
// @version      1.1.0
// @description  Export your X (Twitter) likes, bookmarks and posts to JSON and CSV by capturing the timeline data the page already loads.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// ==/UserScript==

(function () {
  'use strict';

  // ---------- Parsing (pure, also loaded by the Node tests) ----------

  const TIMELINE_OP = /\/graphql\/[^/]+\/(Likes|Bookmarks|UserTweetsAndReplies|UserTweets)(?:\?|$)/;
  const OP_KIND = { Likes: 'likes', Bookmarks: 'bookmarks', UserTweets: 'posts', UserTweetsAndReplies: 'posts' };

  function opKind(url) {
    const m = TIMELINE_OP.exec(url);
    return m ? OP_KIND[m[1]] : null;
  }

  function requestVariables(url) {
    try {
      const v = new URL(url, 'https://x.com').searchParams.get('variables');
      return v ? JSON.parse(v) : {};
    } catch {
      return {};
    }
  }

  function findInstructions(node) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node.instructions)) return node.instructions;
    for (const v of Object.values(node)) {
      const found = findInstructions(v);
      if (found) return found;
    }
    return null;
  }

  function decodeEntities(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  // Swap t.co links for their targets and drop the trailing media link.
  function expandText(text, urls, media) {
    let out = text;
    for (const u of urls || []) {
      if (u.url && u.expanded_url) out = out.split(u.url).join(u.expanded_url);
    }
    for (const m of media || []) {
      if (m.url) out = out.split(m.url).join('');
    }
    return decodeEntities(out).trim();
  }

  function mediaItem(m) {
    if (m.type === 'photo') {
      return { type: 'photo', url: `${m.media_url_https}?name=orig`, alt: m.ext_alt_text || null };
    }
    const mp4s = (m.video_info?.variants || []).filter((v) => v.content_type === 'video/mp4');
    mp4s.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    return {
      type: m.type,
      url: mp4s[0]?.url || null,
      thumbnail: m.media_url_https || null,
      duration_ms: m.video_info?.duration_millis ?? null,
      alt: m.ext_alt_text || null,
    };
  }

  function unwrapTweet(result) {
    if (!result) return null;
    if (result.__typename === 'TweetWithVisibilityResults') return result.tweet || null;
    return result;
  }

  function normalizeTweet(raw, depth = 0) {
    const t = unwrapTweet(raw);
    if (!t || !t.legacy) {
      return {
        unavailable: true,
        reason: t?.tombstone?.text?.text || t?.__typename || 'unknown',
      };
    }
    const legacy = t.legacy;
    const user = t.core?.user_results?.result || {};
    const screenName = user.core?.screen_name ?? user.legacy?.screen_name ?? null;
    const note = t.note_tweet?.note_tweet_results?.result;
    const media = legacy.extended_entities?.media || legacy.entities?.media || [];
    const text = note
      ? expandText(note.text, note.entity_set?.urls, [])
      : expandText(legacy.full_text || '', legacy.entities?.urls, media);
    const urls = (note?.entity_set?.urls || legacy.entities?.urls || []).map((u) => u.expanded_url).filter(Boolean);
    const id = t.rest_id || legacy.id_str;
    const quoted = depth === 0 && t.quoted_status_result?.result
      ? normalizeTweet(t.quoted_status_result.result, depth + 1)
      : null;
    const retweeted = unwrapTweet(legacy.retweeted_status_result?.result);
    const retweetUser = retweeted?.core?.user_results?.result;

    return {
      id,
      url: `https://x.com/${screenName || 'i/web'}/status/${id}`,
      created_at: legacy.created_at ? new Date(legacy.created_at).toISOString() : null,
      author: {
        id: user.rest_id || legacy.user_id_str || null,
        screen_name: screenName,
        name: user.core?.name ?? user.legacy?.name ?? null,
        avatar: user.avatar?.image_url ?? user.legacy?.profile_image_url_https ?? null,
      },
      text,
      lang: legacy.lang || null,
      reply_to: legacy.in_reply_to_status_id_str
        ? { id: legacy.in_reply_to_status_id_str, screen_name: legacy.in_reply_to_screen_name || null }
        : null,
      conversation_id: legacy.conversation_id_str || null,
      metrics: {
        likes: legacy.favorite_count ?? null,
        retweets: legacy.retweet_count ?? null,
        replies: legacy.reply_count ?? null,
        quotes: legacy.quote_count ?? null,
        bookmarks: legacy.bookmark_count ?? null,
        views: t.views?.count != null ? Number(t.views.count) : null,
      },
      media: media.map(mediaItem),
      urls,
      quoted,
      retweet_of: retweeted
        ? { id: retweeted.rest_id || null, screen_name: retweetUser?.core?.screen_name ?? retweetUser?.legacy?.screen_name ?? null }
        : null,
    };
  }

  // Returns { tweets: [{entryId, sortIndex, tweet}], bottomCursor }.
  function parseTimeline(json) {
    const instructions = findInstructions(json?.data) || [];
    const entries = [];
    for (const ins of instructions) {
      if (ins.type === 'TimelineAddEntries') entries.push(...(ins.entries || []));
      else if (ins.type === 'TimelineReplaceEntry' && ins.entry) entries.push(ins.entry);
    }
    const tweets = [];
    let bottomCursor = null;
    for (const e of entries) {
      const c = e.content || {};
      if (c.cursorType === 'Bottom') {
        bottomCursor = c.value;
        continue;
      }
      const items = c.itemContent ? [c] : (c.items || []).map((i) => i.item);
      for (const item of items) {
        const result = item?.itemContent?.tweet_results?.result;
        if (!result) continue;
        const tweet = normalizeTweet(result);
        if (tweet.unavailable) {
          tweet.id = e.entryId.replace(/^tweet-/, '');
          tweet.url = `https://x.com/i/web/status/${tweet.id}`;
        }
        tweets.push({ entryId: e.entryId, sortIndex: e.sortIndex, tweet });
      }
    }
    return { tweets, bottomCursor };
  }

  const CSV_COLUMNS = [
    'position', 'id', 'url', 'created_at', 'author_screen_name', 'author_name', 'text',
    'likes', 'retweets', 'replies', 'quotes', 'bookmarks', 'views', 'media_urls', 'quoted_url', 'unavailable',
  ];

  function csvCell(v) {
    if (v == null) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function toCsv(tweets) {
    const rows = tweets.map((t, i) => [
      i + 1, t.id, t.url, t.created_at, t.author?.screen_name, t.author?.name, t.text,
      t.metrics?.likes, t.metrics?.retweets, t.metrics?.replies, t.metrics?.quotes, t.metrics?.bookmarks, t.metrics?.views,
      (t.media || []).map((m) => m.url).filter(Boolean).join(' '),
      t.quoted?.url, t.unavailable ? t.reason : '',
    ].map(csvCell).join(','));
    // BOM so Excel reads UTF-8.
    return '﻿' + [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
  }

  if (typeof window === 'undefined') {
    module.exports = { opKind, requestVariables, parseTimeline, normalizeTweet, toCsv };
    return;
  }

  // ---------- Capture ----------

  const LABEL = { likes: 'Likes', bookmarks: 'Bookmarks', posts: 'Posts' };
  // Set by the X Unwrapped extension, which drives the runner and shows its own overlay.
  const AUTOMATED = window.__xUnwrapped === true;
  const IDLE_STOP_MS = 45000;
  const DEFAULT_RATE_LIMIT_MS = 15 * 60 * 1000;

  const store = {
    likes: newBucket(),
    bookmarks: newBucket(),
    posts: newBucket(),
  };

  function newBucket() {
    return {
      tweets: new Map(), // id -> tweet, insertion order = timeline order
      bottomCursor: null,
      ended: false,
      pages: 0,
      lastNewAt: 0,
      ownerId: null,
    };
  }

  let rateLimitedUntil = 0;

  function ingest(url, status, bodyText, rateLimitReset) {
    const kind = opKind(url);
    if (!kind) return;
    const bucket = store[kind];
    if (status === 429) {
      const reset = Number(rateLimitReset) * 1000;
      rateLimitedUntil = reset > Date.now() ? reset + 2000 : Date.now() + DEFAULT_RATE_LIMIT_MS;
      ui.render();
      return;
    }
    if (status !== 200) return;
    let json;
    try {
      json = JSON.parse(bodyText);
    } catch {
      return;
    }
    const vars = requestVariables(url);
    // Profile timelines load for every profile you visit; keep only the latest profile's posts.
    if (kind === 'posts' && vars.userId && bucket.ownerId && vars.userId !== bucket.ownerId) {
      store.posts = newBucket();
      return ingest(url, status, bodyText, rateLimitReset);
    }
    if (kind !== 'bookmarks' && vars.userId) bucket.ownerId = vars.userId;
    const { tweets, bottomCursor } = parseTimeline(json);
    bucket.pages += 1;
    let added = 0;
    for (const { tweet } of tweets) {
      if (!bucket.tweets.has(tweet.id)) {
        bucket.tweets.set(tweet.id, tweet);
        added += 1;
      }
    }
    if (added) bucket.lastNewAt = Date.now();
    // An empty page answering our own bottom cursor is the end of the list.
    if (tweets.length === 0 && vars.cursor && vars.cursor === bucket.bottomCursor) bucket.ended = true;
    if (bottomCursor && (!vars.cursor || vars.cursor === bucket.bottomCursor)) bucket.bottomCursor = bottomCursor;
    ui.render();
  }

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__xeUrl = String(url);
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    const url = this.__xeUrl;
    if (url && opKind(url)) {
      this.addEventListener('loadend', () => {
        let body = '';
        try {
          body = this.responseType === 'json' ? JSON.stringify(this.response) : this.responseText;
        } catch {
          body = '';
        }
        ingest(url, this.status, body, this.getResponseHeader('x-rate-limit-reset'));
      });
    }
    return origSend.apply(this, arguments);
  };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const p = origFetch.apply(this, arguments);
    if (opKind(url)) {
      p.then((res) => res.clone().text().then((body) => {
        ingest(url, res.status, body, res.headers.get('x-rate-limit-reset'));
      })).catch(() => {});
    }
    return p;
  };

  // ---------- Page context ----------

  // X serves both lists on its History page; the old URLs redirect there.
  const PAGE = { likes: '/i/history/likes', bookmarks: '/i/history' };

  function currentKind() {
    const path = location.pathname.replace(/\/$/, '');
    if (path === '/i/history' || path === '/i/bookmarks') return 'bookmarks';
    if (path === '/i/history/likes' || /^\/[^/]+\/likes$/.test(path)) return 'likes';
    const me = viewerScreenName();
    if (me && path.toLowerCase() === `/${me.toLowerCase()}/with_replies`) return 'posts';
    return null;
  }

  // Prefer X's own tab link so the app navigates in place and captured data survives.
  function goTo(kind) {
    if (kind === 'posts') return location.assign(`/${viewerScreenName()}/with_replies`);
    const link = document.querySelector(`a[href="${PAGE[kind]}"][role="tab"]`);
    if (link) link.click();
    else location.assign(PAGE[kind]);
  }

  function viewerScreenName() {
    const href = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href');
    return href ? href.replace(/^\//, '') : null;
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function fileBase(kind) {
    const who = viewerScreenName() || 'me';
    const day = new Date().toISOString().slice(0, 10);
    return `x-${kind}-${who}-${day}`;
  }

  function exportPayload(kind) {
    const b = store[kind];
    return {
      kind,
      exported_at: new Date().toISOString(),
      account: viewerScreenName(),
      complete: b.ended,
      count: b.tweets.size,
      tweets: [...b.tweets.values()],
    };
  }

  function exportJson(kind) {
    download(`${fileBase(kind)}.json`, JSON.stringify(exportPayload(kind), null, 2), 'application/json');
  }

  function post(message) {
    window.postMessage({ source: 'xunwrapped-page', ...message }, location.origin);
  }

  // Lists are newest-action first, so a long run of old posts means the cutoff has passed.
  // Likes and bookmarks can hold old posts saved recently, hence the longer run for them.
  function pastCutoff(kind, cutoff) {
    const b = store[kind];
    const need = kind === 'posts' ? 5 : 40;
    let run = 0;
    const tweets = [...b.tweets.values()];
    for (let i = tweets.length - 1; i >= 0 && run < need; i--) {
      const t = tweets[i];
      if (t.unavailable || !t.created_at) continue;
      if (kind === 'posts' && t.author?.id !== b.ownerId) continue;
      if (Date.parse(t.created_at) >= cutoff) return false;
      run++;
    }
    return run >= need;
  }

  function exportCsv(kind) {
    download(`${fileBase(kind)}.csv`, toCsv([...store[kind].tweets.values()]), 'text/csv;charset=utf-8');
  }

  // ---------- Auto-scroll ----------

  const runner = {
    kind: null,
    timer: null,
    startedAt: 0,
    message: '',
    autoDownload: true,

    cutoff: 0,

    start(cutoff = 0) {
      const kind = currentKind();
      if (!kind) return;
      this.kind = kind;
      this.cutoff = cutoff;
      this.startedAt = Date.now();
      this.message = '';
      store[kind].lastNewAt = Date.now();
      this.timer = setInterval(() => this.tick(), 1200);
      this.tick();
    },

    stop(message) {
      clearInterval(this.timer);
      this.timer = null;
      this.message = message || 'Stopped.';
      if (AUTOMATED) post({ type: 'stopped', kind: this.kind, message: this.message });
      ui.render();
    },

    finish(message) {
      const kind = this.kind;
      clearInterval(this.timer);
      this.timer = null;
      this.message = message;
      if (AUTOMATED) return post({ type: 'done', kind, payload: exportPayload(kind) });
      ui.render();
      if (this.autoDownload && store[kind].tweets.size) exportJson(kind);
    },

    tick() {
      const kind = this.kind;
      const b = store[kind];
      if (currentKind() !== kind) return this.stop(`Stopped: left the ${LABEL[kind]} page.`);
      if (b.ended) return this.finish(`Done: reached the end of ${LABEL[kind]}.`);
      if (this.cutoff && pastCutoff(kind, this.cutoff)) return this.finish(`Done: reached ${LABEL[kind]} older than the cutoff.`);
      const now = Date.now();
      if (rateLimitedUntil > now) {
        b.lastNewAt = now;
        return ui.render();
      }
      if (rateLimitedUntil) {
        rateLimitedUntil = 0;
        clickRetry();
      }
      if (now - b.lastNewAt > IDLE_STOP_MS) {
        return this.finish(`Stopped: no new posts for ${IDLE_STOP_MS / 1000}s. Probably the end; "complete" is false in the file.`);
      }
      if (clickRetry()) return ui.render();
      // Nudge up then down so the timeline sees a fresh scroll when it is already at the bottom.
      const bottom = document.documentElement.scrollHeight;
      if (window.scrollY + window.innerHeight >= bottom - 4) window.scrollBy(0, -400);
      window.scrollTo(0, bottom);
      if (AUTOMATED) post({ type: 'progress', kind, count: b.tweets.size, rateLimitedUntil });
      ui.render();
    },
  };

  if (AUTOMATED) {
    window.addEventListener('message', (e) => {
      if (e.source !== window || e.data?.source !== 'xunwrapped-bridge') return;
      if (e.data.type === 'run' && !runner.timer) runner.start(e.data.cutoff);
    });
  }

  function clickRetry() {
    const col = document.querySelector('[data-testid="primaryColumn"]');
    const btn = [...(col?.querySelectorAll('button') || [])].find((b) => /^\s*retry\s*$/i.test(b.textContent));
    if (!btn) return false;
    btn.click();
    return true;
  }

  // ---------- UI ----------

  const ui = {
    root: null,
    collapsed: false,

    mount() {
      if (this.root || !document.body) return;
      try {
        this.collapsed = localStorage.getItem('xExport.collapsed') === '1';
      } catch {
        this.collapsed = false;
      }
      const host = document.createElement('div');
      host.id = 'x-export-host';
      document.body.appendChild(host);
      this.root = host.attachShadow({ mode: 'open' });
      this.root.addEventListener('click', (e) => this.onClick(e));
      this.render();
      let lastPath = location.pathname;
      setInterval(() => {
        if (location.pathname !== lastPath) {
          lastPath = location.pathname;
          this.render();
        }
      }, 800);
    },

    onClick(e) {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      const kind = currentKind();
      if (action === 'toggle') {
        this.collapsed = !this.collapsed;
        try {
          localStorage.setItem('xExport.collapsed', this.collapsed ? '1' : '0');
        } catch {
          // Storage blocked: the panel just forgets its state.
        }
      } else if (action === 'start') runner.start();
      else if (action === 'stop') runner.stop();
      else if (action === 'json') exportJson(kind);
      else if (action === 'csv') exportCsv(kind);
      else if (action === 'autodl') runner.autoDownload = e.target.checked;
      else if (action === 'go-likes') goTo('likes');
      else if (action === 'go-bookmarks') goTo('bookmarks');
      else if (action === 'go-posts') goTo('posts');
      this.render();
    },

    render() {
      if (!this.root) return;
      const kind = currentKind();
      const running = !!runner.timer;
      const b = kind ? store[kind] : null;
      const limited = rateLimitedUntil > Date.now();
      let status = runner.message;
      if (running) {
        status = limited
          ? `Rate limited by X. Resuming at ${new Date(rateLimitedUntil).toLocaleTimeString()}.`
          : `Scrolling ${LABEL[runner.kind]}... ${store[runner.kind].tweets.size} posts so far.`;
      } else if (!kind) {
        status = 'Open your Likes, Bookmarks or Posts to export.';
      } else if (!status) {
        status = b.ended ? 'Reached the end. Ready to download.' : 'Press Start to load everything.';
      }

      const body = this.collapsed ? '' : `
        <div class="body">
          ${kind ? `<div class="count"><b>${b.tweets.size}</b> ${LABEL[kind].toLowerCase()} captured${b.ended ? ' (complete)' : ''}</div>` : ''}
          <div class="status" role="status">${escapeHtml(status)}</div>
          ${kind ? `
            <div class="row">
              ${running
                ? '<button data-action="stop">Stop</button>'
                : '<button data-action="start" class="primary">Start</button>'}
              <button data-action="json" ${b.tweets.size ? '' : 'disabled'}>JSON</button>
              <button data-action="csv" ${b.tweets.size ? '' : 'disabled'}>CSV</button>
            </div>
            <label class="check"><input type="checkbox" data-action="autodl" ${runner.autoDownload ? 'checked' : ''}> Download JSON when done</label>
          ` : `
            <div class="row">
              <button data-action="go-likes">Likes</button>
              <button data-action="go-bookmarks">Bookmarks</button>
              <button data-action="go-posts">Posts</button>
            </div>
          `}
        </div>`;

      this.root.innerHTML = `
        <style>${STYLE}</style>
        <section class="panel" aria-label="X exporter">
          <button class="head" data-action="toggle" aria-expanded="${!this.collapsed}">
            <span>Exporter</span><span aria-hidden="true">${this.collapsed ? '+' : '-'}</span>
          </button>
          ${body}
        </section>`;
    },
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  const STYLE = `
    .panel { position: fixed; right: 88px; bottom: 16px; z-index: 2147483647; width: 240px;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #e7e9ea;
      background: #16181c; border: 1px solid #2f3336; border-radius: 12px; box-shadow: 0 8px 24px rgb(0 0 0 / 45%); }
    .head { all: unset; box-sizing: border-box; cursor: pointer; display: flex; justify-content: space-between;
      width: 100%; padding: 8px 12px; font-weight: 700; }
    .head:focus-visible, button:focus-visible { outline: 2px solid #1d9bf0; outline-offset: 2px; }
    .body { padding: 0 12px 12px; display: grid; gap: 8px; }
    .count b { font-size: 18px; }
    .status { color: #8b98a5; min-height: 18px; }
    .row { display: flex; gap: 6px; flex-wrap: wrap; }
    .row button { flex: 1; cursor: pointer; padding: 6px 8px; border-radius: 999px; border: 1px solid #536471;
      background: transparent; color: inherit; font: inherit; font-weight: 600; }
    .row button.primary { background: #1d9bf0; border-color: #1d9bf0; color: #fff; }
    .row button:disabled { opacity: 0.4; cursor: default; }
    .check { display: flex; gap: 6px; align-items: center; color: #8b98a5; cursor: pointer; }
  `;

  if (AUTOMATED) return;
  if (document.body) ui.mount();
  else document.addEventListener('DOMContentLoaded', () => ui.mount(), { once: true });
})();
