import { STRINGS, type Noun, type Strings } from './i18n';
import type { Pose } from './ribbon';
import { PLATFORMS, type Account, type Summary } from './stats';

export interface Slide {
  id: string;
  pose: Pose;
  html: string;
  // The last slide waits for the viewer instead of auto-advancing.
  hold?: boolean;
}

export function esc(v: unknown) {
  return String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export const fmt = (n: number) => STRINGS.en.fmt(n);

// Index into Strings.moods, with its icon.
export function feedMood(h: number): [string, number] {
  if (h >= 5 && h < 11) return ['☀', 0];
  if (h >= 11 && h < 16) return ['◐', 1];
  if (h >= 16 && h < 20) return ['◒', 2];
  if (h >= 20) return ['☾', 3];
  return ['✦', 4];
}

// Stable gradient orb per handle, shown under the profile picture and in its place when there is none.
export function orb(handle: string) {
  let h = 0;
  for (const c of handle) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = 200 + (h % 80);
  const b = (a + 60 + ((h >> 8) % 70)) % 360;
  return `background: radial-gradient(circle at 30% 25%, hsl(${b} 100% 72% / .9), transparent 55%), conic-gradient(from ${h % 360}deg, hsl(${a} 95% 55%), hsl(${b} 95% 60%), hsl(${(b + 40) % 360} 100% 62%), hsl(${a} 95% 55%))`;
}

const STOPS = [[29, 107, 255], [154, 60, 255], [255, 106, 74]];

// Brand gradient (blue, violet, coral) sampled at x in 0..1.
export function gradientAt(x: number) {
  const seg = x < 0.5 ? 0 : 1;
  const f = x < 0.5 ? x * 2 : x * 2 - 1;
  const [a, b] = [STOPS[seg], STOPS[seg + 1]];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(' ')})`;
}

export const yearOf = (s: Summary) => s.to.slice(0, 4);


export function avatar(handle: string, url: string | null, cls = '') {
  const img = url ? `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : '';
  return `<div class="orb ${cls}" style="${orb(handle)}">${img}</div>`;
}

// Shrinks long handles to one line across the frame (the large title is 12.6cqw).
const fitHandle = (h: string) => Math.min(12.6, 86 / (0.58 * (h.length + 1))).toFixed(2);

// Entrance animation hook; an attribute, not a class, so it can sit next to an element's own class.
const anim = (i: number) => `data-in style="--d:${(0.15 + i * 0.12).toFixed(2)}s"`;

export function buildSlides(s: Summary, shareCard: string): Slide[] {
  const T = STRINGS[s.l];
  const fmt = T.fmt;
  // Animated number; the player counts it up from 0 when the slide opens.
  const count = (n: number) => `<span data-count="${Number(n)}">${fmt(n)}</span>`;
  const plural = (n: number, noun: Noun) => T.plural(n, noun, count);
  // A count tile: the number on top, the noun in its matching form below.
  const tile = (i: number, n: number, noun: Noun) =>
    `<div class="glass tile" ${anim(i)}><b>${count(n)}</b><span>${T.plural(n, noun, () => '').trim()}</span></div>`;
  const year = yearOf(s);
  const [first, ...rest] = s.top;
  const [moodIcon, moodIndex] = feedMood(s.peakHour);
  const mood = T.moods[moodIndex];
  const mine = s.clockOf === 'you';
  const persona = T.persona[s.persona.id];
  const site = PLATFORMS[s.p];
  const saveNoun = site.save as Noun;

  const intro: Slide = {
    id: 'intro',
    pose: [0.1, -0.06, 0.85, 1.15],
    html: `
      <h1 class="display xl" ${anim(0)}>${T.intro.title(site.name, esc(year))}</h1>
      <div class="spacer"></div>
      <div class="glass stat-line" ${anim(3)}>${T.intro.months} ${[
        s.likes && plural(s.likes, 'like'),
        s.bookmarks && plural(s.bookmarks, saveNoun),
        s.posts?.count && plural(s.posts.count, 'post'),
        !s.posts?.count && s.accounts && plural(s.accounts, 'account'),
      ].filter(Boolean).join('. ')}.</div>
      <div class="handle me" ${anim(4)}>${avatar(s.handle, s.avatar)}@${esc(s.handle)}</div>`,
  };

  const top: Slide = {
    id: 'top',
    pose: [0.2, 0.18, 0.55, 1.0],
    html: `
      <h2 class="display l" ${anim(0)}>${T.top.title}</h2>
      ${first ? `
      <div class="glass hero-account" ${anim(1)}>
        ${avatar(first.h, first.a, 'big')}
        <div class="hero-meta">
          <p class="rank">#1 @${esc(first.h)}</p>
          <p class="name">${esc(first.n)}</p>
          <p class="mega">${count(score(first))}</p>
          <p class="sub">${breakdown(T, first)}</p>
        </div>
      </div>` : ''}
      <ol class="accounts">
        ${rest.map((a, i) => `
        <li class="glass" ${anim(i + 2)}>
          ${avatar(a.h, a.a)}
          <span class="who">#${i + 2} @${esc(a.h)}</span>
          <span class="num">${fmt(score(a))}</span>
        </li>`).join('')}
      </ol>
      <p class="foot" ${anim(7)}>${T.top.foot(site.saves, fmt(s.accounts))}</p>`,
  };

  const cells = [...s.clock].map((v, i) => {
    const h = i % 24;
    return `<i style="--v:${Number(v) / 9};--c:${gradientAt(h / 23)};--i:${h + Math.floor(i / 24) * 2}"></i>`;
  });
  const clock: Slide = {
    id: 'clock',
    pose: [0.15, 0.08, 0.6, 1.05],
    html: `
      <h2 class="display l" ${anim(0)}>${mine ? T.clock.mine(site.name) : T.clock.feed}<br><span class="grad">${T.hour(s.peakHour)}</span></h2>
      <div class="spacer"></div>
      <div class="glass heatmap" ${anim(2)}>
        <div class="days">${T.days.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="grid">${cells.join('')}</div>
        <div class="hours"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
      </div>
      <div class="pill" ${anim(4)}><span class="pill-icon">${moodIcon}</span>${mine ? '' : T.clock.yourFeed}${mood}</div>
      <p class="foot" ${anim(5)}>${mine ? T.clock.footMine : T.clock.footFeed}</p>`,
  };

  const maxP = Math.max(1, ...s.topics.map((t) => t.p));
  const SLOTS = [[34, 30], [72, 22], [70, 56], [27, 66], [58, 84]];
  const topics: Slide = {
    id: 'topics',
    pose: [-0.25, -0.35, 0.3, 0.9],
    html: `
      <h2 class="display l" ${anim(0)}>${T.topics.title}</h2>
      <div class="bubbles">
        ${s.topics.map((t, i) => `
        <div class="bubble b${i}" style="--size:${(14 + 30 * Math.sqrt(t.p / maxP)).toFixed(1)}cqw;left:${SLOTS[i][0]}%;top:${SLOTS[i][1]}%;--d:${(0.3 + i * 0.15).toFixed(2)}s">
          <span class="t" style="--len:${T.topic(t.k).length}">${esc(T.topic(t.k))}</span><span class="p">${Number(t.p)}%</span>
        </div>`).join('')}
      </div>
      <p class="foot" ${anim(6)}>${T.topics.foot(!!s.posts)}</p>`,
  };

  const v = s.vault;
  const vault: Slide = {
    id: 'vault',
    pose: [-0.1, 0.3, -0.4, 1.0],
    html: `
      <h2 class="display l" ${anim(0)}>${T.vault.title}</h2>
      <p class="lede" ${anim(1)}>${T.vault.lede(count(s.bookmarks))}</p>
      <div class="stack">
        <div class="glass card c0"><span class="big">${100 - v.onlySaved}%</span>${T.vault.likedFirst}</div>
        <div class="glass card c1"><span class="big">${v.video}%</span>${T.vault.video}</div>
        ${s.taste ? `<div class="glass card c2"><span class="big">${fmt(v.gems)}</span>${T.vault.gems}</div>` : ''}
        ${v.oldest ? `<div class="glass card c3"><span class="big">${esc(v.oldest.y)}</span>${T.vault.oldest(esc(v.oldest.h))}</div>` : ''}
      </div>`,
  };

  const t = s.taste;
  const taste: Slide | null = t && {
    id: 'taste',
    pose: [0.3, -0.25, 1.1, 1.1],
    html: `
      <h2 class="display l" ${anim(0)}>${T.taste.title}</h2>
      <div class="glass meter-card" ${anim(1)}>
        <p class="mega">${count(t.median)}</p>
        <p class="sub">${T.taste.typical}</p>
        <div class="meter"><div class="track"></div><div class="dot" style="--x:${100 - Math.min(100, t.niche * 2)}%"></div></div>
        <div class="meter-labels"><span>${T.taste.underground}</span><span>${T.taste.mainstream}</span></div>
      </div>
      <div class="glass mix" ${anim(2)}>
        <div class="mixbar"><i style="--w:${s.media.video}%"></i><i style="--w:${s.media.photo}%"></i><i style="--w:${s.media.text}%"></i></div>
        <div class="mixlegend"><span>${T.taste.video} ${s.media.video}%</span><span>${T.taste.photo} ${s.media.photo}%</span><span>${T.taste.text} ${s.media.text}%</span></div>
      </div>
      <p class="facts" ${anim(3)}>${T.taste.niche(t.niche)} ${t.biggest ? T.taste.biggest(esc(t.biggest.h), T.compact(t.biggest.views)) : ''} ${T.taste.langs(s.langs)}</p>`,
  };

  const wave: Slide = {
    id: 'wave',
    pose: [0.05, -0.38, 0.12, 0.95],
    html: `
      <h2 class="display l" ${anim(0)}>${T.wave.title}</h2>
      ${waveChart(T, s)}
      <div class="legend" ${anim(4)}><span class="k likes">${T.wave.likes}</span><span class="k saves">${T.wave.saves(site.name)}</span>${s.posts ? `<span class="k posts">${T.wave.posts}</span>` : ''}</div>
      <p class="foot" ${anim(5)}>${T.wave.foot(site.name)}</p>`,
  };

  const personaSlide: Slide = {
    id: 'persona',
    pose: [0.05, 0.12, 2.2, 0.75],
    html: `
      <p class="kicker" ${anim(0)}>${T.personaKicker(site.name)}</p>
      <h2 class="display xl" ${anim(1)}>${esc(persona.name).replace(' ', '<br>')}</h2>
      <div class="spacer"></div>
      <div class="traits">
        ${T.traits.map((name, i) => `
        <div class="glass trait" ${anim(i + 2)}>
          <div class="trait-top"><span>${name}</span><span>${count(s.persona.traits[i])}%</span></div>
          <div class="bar"><i style="--w:${Number(s.persona.traits[i])}%"></i></div>
        </div>`).join('')}
      </div>
      <div class="glass quip" ${anim(6)}>${esc(persona.line)}</div>`,
  };

  const outro: Slide = {
    id: 'outro',
    pose: [0.2, 0.0, 0.8, 1.2],
    hold: true,
    html: `
      <h2 class="display l" ${anim(0)}>${T.outro.title}<br><span class="grad" style="font-size:${fitHandle(s.handle)}cqw">@${esc(s.handle)}</span></h2>
      <div class="share-preview" ${anim(1)}>${shareCard}</div>
      <div class="actions" ${anim(2)}>
        <button data-action="copy" class="primary">${T.outro.copy}</button>
        <button data-action="gif">${T.outro.gif}</button>
        <button data-action="png">${T.outro.png}</button>
        <button data-action="replay">${T.outro.replay}</button>
      </div>`,
  };

  const p = s.posts;
  const postsSlide: Slide | null = p && p.count ? {
    id: 'posts',
    pose: [-0.2, 0.32, -0.9, 1.05],
    html: `
      <h2 class="display l" ${anim(0)}>${T.posts.title(count(p.count))}</h2>
      ${p.best ? `
      <p class="kicker" ${anim(1)}>${T.posts.biggest}</p>
      <div class="glass tweet" ${anim(2)}>
        <div class="tweet-head">${avatar(s.handle, s.avatar)}<span>@${esc(s.handle)}</span></div>
        <p class="tweet-text">${esc(p.best.text)}</p>
        <p class="tweet-meta">${T.plural(p.best.likes, 'like', (n) => `<b>${T.compact(n)}</b>`)}${p.best.views ? ` · ${T.plural(p.best.views, 'view', (n) => `<b>${T.compact(n)}</b>`)}` : ''}</p>
      </div>` : ''}
      <div class="tiles">
        ${tile(3, p.count - p.replies, 'newPost')}
        ${tile(4, p.replies, 'reply')}
        ${p.retweets ? tile(5, p.retweets, 'repost') : ''}
      </div>`,
  } : null;

  return [
    intro,
    s.top.length ? top : null,
    postsSlide,
    clock,
    s.topics.length ? topics : null,
    s.bookmarks ? vault : null,
    taste,
    wave,
    personaSlide,
    outro,
  ].filter((x): x is Slide => !!x);
}

const score = (a: Account) => a.likes + a.saves + a.replies;

function breakdown(T: Strings, a: Account) {
  return [
    a.likes && T.plural(a.likes, 'like'),
    a.saves && T.plural(a.saves, 'save'),
    a.replies && T.plural(a.replies, 'reply'),
  ].filter(Boolean).join(' · ');
}

function waveChart(T: Strings, s: Summary) {
  const fmt = T.fmt;
  const monthName = (key: string) => T.months[Number(key.slice(5, 7)) - 1];
  const W = 320, H = 200, P = 8;
  const rows = s.months;
  const sum = (r: Summary['months'][number]) => r.l + r.b + r.p;
  const max = Math.max(1, ...rows.map(sum));
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, rows.length - 1);
  const y = (v: number) => H - 24 - (v / max) * (H - 60);
  const smooth = (pts: [number, number][]) =>
    pts.reduce((d, [px, py], i) => {
      if (i === 0) return `M${px},${py}`;
      const [qx, qy] = pts[i - 1];
      const mx = (qx + px) / 2;
      return `${d} C${mx},${qy} ${mx},${py} ${px},${py}`;
    }, '');
  const total = rows.map((r, i) => [x(i), y(sum(r))] as [number, number]);
  const posts = rows.map((r, i) => [x(i), y(r.p)] as [number, number]);
  const saves = rows.map((r, i) => [x(i), y(r.b)] as [number, number]);
  const base = H - 24;
  const area = (pts: [number, number][]) => `${smooth(pts)} L${x(rows.length - 1)},${base} L${x(0)},${base} Z`;
  const peakI = rows.reduce((b, r, i) => (sum(r) > sum(rows[b]) ? i : b), 0);
  const peak = rows[peakI];
  const [px, py] = total[peakI];
  const ticks = [0, Math.round(max / 2), max];
  return `
    <svg class="wave" viewBox="0 0 ${W} ${H}" ${anim(1)}>
      <defs>
        <linearGradient id="wg" x1="0" x2="1"><stop offset="0" stop-color="#1366ff"/><stop offset=".5" stop-color="#8e38ff"/><stop offset="1" stop-color="#ff6645"/></linearGradient>
        <linearGradient id="wf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <mask id="wm"><rect width="${W}" height="${H}" fill="url(#wf)"/></mask>
      </defs>
      ${ticks.map((v) => `<line class="gridline" x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${P}" y="${y(v) - 3}">${fmt(v)}</text>`).join('')}
      <path class="area" d="${area(total)}" fill="url(#wg)" mask="url(#wm)"/>
      <path class="area saves" d="${area(saves)}" fill="url(#wg)" opacity=".55"/>
      <path class="line" d="${smooth(total)}" stroke="url(#wg)" pathLength="1"/>
      ${s.posts ? `<path class="line posts" d="${smooth(posts)}" pathLength="1"/>` : ''}
      ${rows.map((r, i) => `<text class="month" x="${x(i)}" y="${H - 6}" text-anchor="middle">${T.monthInitials[Number(r.m.slice(5, 7)) - 1]}</text>`).join('')}
      <g class="peak"><circle cx="${px}" cy="${py}" r="4"/><circle cx="${px}" cy="${py}" r="9" class="halo"/></g>
    </svg>
    <div class="glass callout" ${anim(3)}><b>${T.wave.peak(monthName(peak.m), peak.m.slice(0, 4))}</b><span>${[T.plural(peak.l, 'like'), T.plural(peak.b, 'save'), s.posts && T.plural(peak.p, 'post')].filter(Boolean).join(' · ')}</span></div>`;
}
