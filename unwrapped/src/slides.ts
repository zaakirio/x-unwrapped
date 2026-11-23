import type { Pose } from './ribbon';
import { PERSONAS, TRAITS, type Summary } from './stats';

export interface Slide {
  id: string;
  pose: Pose;
  html: string;
  // The last slide waits for the viewer instead of auto-advancing.
  hold?: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function esc(v: unknown) {
  return String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export const fmt = (n: number) => Number(n).toLocaleString('en-US');

export function compact(n: number) {
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

// Animated number; the player counts it up from 0 when the slide opens.
const count = (n: number) => `<span data-count="${Number(n)}">${fmt(n)}</span>`;

export function hourLabel(h: number) {
  const hh = h % 12 || 12;
  return `${hh}${h < 12 ? 'am' : 'pm'}`;
}

export function feedMood(h: number) {
  if (h >= 5 && h < 11) return ['☀', 'Early Bird'];
  if (h >= 11 && h < 16) return ['◐', 'Lunch Break'];
  if (h >= 16 && h < 20) return ['◒', 'Golden Hour'];
  if (h >= 20) return ['☾', 'Night Owl'];
  return ['✦', 'After Hours'];
}

// Stable gradient orb per handle, standing in for avatars we do not have.
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

function monthName(key: string) {
  return MONTHS[Number(key.slice(5, 7)) - 1];
}

const anim = (i: number) => `class="in" style="--d:${(0.15 + i * 0.12).toFixed(2)}s"`;

export function buildSlides(s: Summary, shareCard: string): Slide[] {
  const year = yearOf(s);
  const [first, ...rest] = s.top;
  const [moodIcon, mood] = feedMood(s.peakHour);
  const persona = PERSONAS[s.persona.id];

  const intro: Slide = {
    id: 'intro',
    pose: [0.1, -0.06, 0.85, 1.15],
    html: `
      <h1 class="display xl" ${anim(0)}>Your X<br>Unwrapped<br>${esc(year)}</h1>
      <div class="spacer"></div>
      <div class="glass stat-line" ${anim(3)}>12 months. ${count(s.likes)} likes.<br>${count(s.bookmarks)} bookmarks. ${count(s.accounts)} accounts.</div>
      <p class="handle" ${anim(4)}>@${esc(s.handle)}</p>`,
  };

  const top: Slide = {
    id: 'top',
    pose: [0.2, 0.18, 0.55, 1.0],
    html: `
      <h2 class="display l" ${anim(0)}>Your top 5<br>accounts.</h2>
      ${first ? `
      <div class="glass hero-account" ${anim(1)}>
        <div class="orb big" style="${orb(first.h)}"></div>
        <div class="hero-meta">
          <p class="rank">#1 @${esc(first.h)}</p>
          <p class="name">${esc(first.n)}</p>
          <p class="mega">${count(first.likes + first.saves)}</p>
          <p class="sub">${fmt(first.likes)} likes · ${fmt(first.saves)} saves</p>
        </div>
      </div>` : ''}
      <ol class="accounts">
        ${rest.map((a, i) => `
        <li class="glass" ${anim(i + 2)}>
          <div class="orb" style="${orb(a.h)}"></div>
          <span class="who">#${i + 2} @${esc(a.h)}</span>
          <span class="num">${fmt(a.likes + a.saves)}</span>
        </li>`).join('')}
      </ol>
      <p class="foot" ${anim(7)}>Ranked by likes + bookmarks from ${fmt(s.accounts)} accounts.</p>`,
  };

  const cells = [...s.clock].map((v, i) => {
    const h = i % 24;
    return `<i style="--v:${Number(v) / 9};--c:${gradientAt(h / 23)};--i:${h + Math.floor(i / 24) * 2}"></i>`;
  });
  const clock: Slide = {
    id: 'clock',
    pose: [0.15, 0.08, 0.6, 1.05],
    html: `
      <h2 class="display l" ${anim(0)}>The posts you<br>love drop at<br><span class="grad">${hourLabel(s.peakHour)}</span></h2>
      <div class="spacer"></div>
      <div class="glass heatmap" ${anim(2)}>
        <div class="days">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="grid">${cells.join('')}</div>
        <div class="hours"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
      </div>
      <div class="pill" ${anim(4)}><span class="pill-icon">${moodIcon}</span>Your feed: ${mood}</div>
      <p class="foot" ${anim(5)}>When the posts you liked and saved went live.</p>`,
  };

  const maxP = Math.max(1, ...s.topics.map((t) => t.p));
  const SLOTS = [[34, 30], [72, 22], [70, 56], [27, 66], [58, 84]];
  const topics: Slide = {
    id: 'topics',
    pose: [-0.25, -0.35, 0.3, 0.9],
    html: `
      <h2 class="display l" ${anim(0)}>Your year<br>in topics.</h2>
      <div class="bubbles">
        ${s.topics.map((t, i) => `
        <div class="bubble b${i}" style="--size:${(14 + 30 * Math.sqrt(t.p / maxP)).toFixed(1)}cqw;left:${SLOTS[i][0]}%;top:${SLOTS[i][1]}%;--d:${(0.3 + i * 0.15).toFixed(2)}s">
          <span class="t">${esc(t.k)}</span><span class="p">${Number(t.p)}%</span>
        </div>`).join('')}
      </div>
      <p class="foot" ${anim(6)}>Share of topic mentions across everything you liked and saved.</p>`,
  };

  const v = s.vault;
  const vault: Slide = {
    id: 'vault',
    pose: [-0.1, 0.3, -0.4, 1.0],
    html: `
      <h2 class="display l" ${anim(0)}>The Vault.</h2>
      <p class="lede" ${anim(1)}>${count(s.bookmarks)} posts saved for later.</p>
      <div class="stack">
        <div class="glass card c0"><span class="big">${100 - v.onlySaved}%</span>of your saves got a like first.</div>
        <div class="glass card c1"><span class="big">${v.video}%</span>of the vault is video.</div>
        <div class="glass card c2"><span class="big">${fmt(v.gems)}</span>hidden gems with under 1K likes.</div>
        ${v.oldest ? `<div class="glass card c3"><span class="big">${esc(v.oldest.y)}</span>Oldest save: a post by @${esc(v.oldest.h)}.</div>` : ''}
      </div>`,
  };

  const t = s.taste;
  const taste: Slide = {
    id: 'taste',
    pose: [0.3, -0.25, 1.1, 1.1],
    html: `
      <h2 class="display l" ${anim(0)}>Mainstream or<br>underground?</h2>
      <div class="glass meter-card" ${anim(1)}>
        <p class="mega">${count(t.median)}</p>
        <p class="sub">likes on a typical post you loved</p>
        <div class="meter"><div class="track"></div><div class="dot" style="--x:${100 - Math.min(100, t.niche * 2)}%"></div></div>
        <div class="meter-labels"><span>Underground</span><span>Mainstream</span></div>
      </div>
      <div class="glass mix" ${anim(2)}>
        <div class="mixbar"><i style="--w:${s.media.video}%"></i><i style="--w:${s.media.photo}%"></i><i style="--w:${s.media.text}%"></i></div>
        <div class="mixlegend"><span>Video ${s.media.video}%</span><span>Photo ${s.media.photo}%</span><span>Text ${s.media.text}%</span></div>
      </div>
      <p class="facts" ${anim(3)}>${t.niche}% had under 1K likes. ${t.biggest ? `Biggest: a @${esc(t.biggest.h)} post with ${compact(t.biggest.views)} views.` : ''} Posts in ${fmt(s.langs)} languages.</p>`,
  };

  const wave: Slide = {
    id: 'wave',
    pose: [0.05, -0.38, 0.12, 0.95],
    html: `
      <h2 class="display l" ${anim(0)}>Your year<br>in a wave.</h2>
      ${waveChart(s)}
      <div class="legend" ${anim(4)}><span class="k likes">Likes</span><span class="k saves">Bookmarks</span></div>
      <p class="foot" ${anim(5)}>X does not log when you liked a post, so each like is dated by its place in your list.</p>`,
  };

  const personaSlide: Slide = {
    id: 'persona',
    pose: [0.05, 0.12, 2.2, 0.75],
    html: `
      <p class="kicker" ${anim(0)}>Your X personality</p>
      <h2 class="display xl" ${anim(1)}>${esc(persona.name).replace(' ', '<br>')}</h2>
      <div class="spacer"></div>
      <div class="traits">
        ${TRAITS.map((name, i) => `
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
      <h2 class="display l" ${anim(0)}>That's a wrap,<br><span class="grad">@${esc(s.handle)}</span></h2>
      <div class="share-preview" ${anim(1)}>${shareCard}</div>
      <div class="actions" ${anim(2)}>
        <button data-action="copy" class="primary">Copy share link</button>
        <button data-action="gif">Save GIF</button>
        <button data-action="png">Save card</button>
        <button data-action="replay">Replay</button>
      </div>`,
  };

  return [intro, top, clock, topics, vault, taste, wave, personaSlide, outro];
}

function waveChart(s: Summary) {
  const W = 320, H = 200, P = 8;
  const rows = s.months;
  const max = Math.max(1, ...rows.map((r) => r.l + r.b));
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, rows.length - 1);
  const y = (v: number) => H - 24 - (v / max) * (H - 60);
  const smooth = (pts: [number, number][]) =>
    pts.reduce((d, [px, py], i) => {
      if (i === 0) return `M${px},${py}`;
      const [qx, qy] = pts[i - 1];
      const mx = (qx + px) / 2;
      return `${d} C${mx},${qy} ${mx},${py} ${px},${py}`;
    }, '');
  const total = rows.map((r, i) => [x(i), y(r.l + r.b)] as [number, number]);
  const saves = rows.map((r, i) => [x(i), y(r.b)] as [number, number]);
  const base = H - 24;
  const area = (pts: [number, number][]) => `${smooth(pts)} L${x(rows.length - 1)},${base} L${x(0)},${base} Z`;
  const peakI = rows.reduce((b, r, i) => (r.l + r.b > rows[b].l + rows[b].b ? i : b), 0);
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
      ${rows.map((r, i) => `<text class="month" x="${x(i)}" y="${H - 6}" text-anchor="middle">${monthName(r.m)[0]}</text>`).join('')}
      <g class="peak"><circle cx="${px}" cy="${py}" r="4"/><circle cx="${px}" cy="${py}" r="9" class="halo"/></g>
    </svg>
    <div class="glass callout" ${anim(3)}><b>Peak: ${monthName(peak.m)} ${peak.m.slice(0, 4)}</b><span>${fmt(peak.l)} likes · ${fmt(peak.b)} saves</span></div>`;
}
