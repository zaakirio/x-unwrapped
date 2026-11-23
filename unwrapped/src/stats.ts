// Turns x-export JSON files into the small summary that the story shows and the share link carries.

export interface Tweet {
  id: string;
  created_at?: string;
  author?: { screen_name: string; name: string };
  text?: string;
  lang?: string;
  reply_to?: unknown;
  metrics?: { likes?: number; views?: number };
  media?: { type: string }[];
  unavailable?: boolean;
}

export interface ExportFile {
  kind: 'likes' | 'bookmarks';
  exported_at: string;
  account: string | null;
  tweets: Tweet[];
}

export interface Summary {
  v: 1;
  handle: string;
  from: string;
  to: string;
  likes: number;
  bookmarks: number;
  both: number;
  accounts: number;
  top: { h: string; n: string; likes: number; saves: number }[];
  // 7 days (Mon first) x 24 hours, each 0-9, in the creator's time zone.
  clock: string;
  peakHour: number;
  topics: { k: string; p: number }[];
  vault: { onlySaved: number; video: number; gems: number; oldest: { h: string; y: number } | null };
  months: { m: string; l: number; b: number }[];
  taste: { median: number; niche: number; biggest: { h: string; views: number } | null };
  media: { video: number; photo: number; text: number };
  langs: number;
  persona: { id: PersonaId; traits: [number, number, number] };
}

export type PersonaId = 'curator' | 'builder' | 'visualist' | 'scout' | 'wanderer';

const DAY_MS = 86_400_000;
const NICHE_LIKES = 1000;
const NON_LANGS = new Set(['zxx', 'qme', 'qam', 'qct', 'qht', 'qst', 'und', 'art']);

// Order matters only for display; a post can count toward several topics.
export const TOPICS: [string, RegExp][] = [
  ['AI', /\b(ai|a\.i\.|llms?|gpt[-\d.o]*|openai|anthropic|claude|gemini|grok|chatgpt|agents?|agentic|models?|prompts?|inference|fine-?tun\w*|tokens?|transformer|diffusion|midjourney|sora|veo|karpathy|deepseek|qwen|mcp|rag|embeddings?|neural|agi)\b/i],
  ['Code', /\b(code|coding|coder|devs?|developers?|programming|typescript|javascript|python|rust|golang|react|nextjs|next\.js|vite|api|apis|github|open[- ]source|repo|cli|terminal|backend|frontend|database|postgres|sql|deploy\w*|bug|compiler|vibe ?cod\w*|npm|npx|linux|kernel)\b/i],
  ['Design', /\b(design\w*|ui|ux|figma|typography|fonts?|illustrat\w*|animation|motion|3d|blender|shaders?|art|artist|aesthetic|visuals?|render\w*|pixel|branding|logo|color|colour)\b/i],
  ['Startups', /\b(startups?|founders?|revenue|mrr|arr|saas|vcs?|funding|raised|seed|series [a-c]|yc|ycombinator|indie ?hack\w*|bootstrap\w*|customers?|growth|launch\w*|product hunt|ship(ped|ping)?|business)\b/i],
  ['Crypto', /\b(crypto|bitcoin|btc|eth|ethereum|solana|sol|web3|defi|nfts?|tokenomics|memecoins?|blockchain|onchain|wallet|airdrop|stablecoins?)\b/i],
  ['Security', /\b(hack\w*|exploit\w*|malware|ransomware|vulnerab\w*|cve|0day|zero-day|breach\w*|infosec|cybersec\w*|phishing|backdoor|pentest\w*)\b/i],
  ['Games', /\b(games?|gaming|gamer|playstation|ps5|xbox|nintendo|switch 2|steam|unity|unreal|godot|indie game|esports|minecraft|gta)\b/i],
  ['Health', /\b(health\w*|sleep|fitness|workout|gym|longevity|diet|nutrition|protein|fasting|brain|biology|medic\w*|doctor|cancer|aging|blueprint)\b/i],
  ['Science', /\b(science|scientists?|physics|space|nasa|spacex|rocket|starship|mars|quantum|research\w*|papers?|universe|telescope|math\w*)\b/i],
  ['Sport', /\b(football|soccer|premier league|champions league|goal|nba|nfl|f1|formula 1|ufc|boxing|cricket|tennis|messi|ronaldo|arsenal|chelsea|liverpool|madrid|barcelona)\b/i],
  ['World', /\b(politic\w*|elections?|president|government|congress|senate|trump|biden|war|ukraine|russia|israel|gaza|china|economy|inflation|tariffs?|policy)\b/i],
];

export function parseExport(text: string): ExportFile {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.tweets) || (data.kind !== 'likes' && data.kind !== 'bookmarks')) {
    throw new Error('This is not an x-export likes or bookmarks JSON file.');
  }
  return data as ExportFile;
}

// X does not say when you liked or saved a post, only the list order (newest action first).
// An action cannot be older than any post below it in the list, so the running maximum of
// created_at from the bottom is the earliest moment each action could have happened.
export function actionTimes(tweets: Tweet[]): number[] {
  const out = new Array<number>(tweets.length);
  let max = -Infinity;
  for (let i = tweets.length - 1; i >= 0; i--) {
    const t = tweets[i].created_at ? Date.parse(tweets[i].created_at!) : NaN;
    if (t > max) max = t;
    out[i] = max;
  }
  return out;
}

function inWindow(file: ExportFile, from: number): Tweet[] {
  const times = actionTimes(file.tweets);
  return file.tweets.filter((t, i) => !t.unavailable && t.author && times[i] >= from);
}

function monthKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 7);
}

function pct(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function topicShares(tweets: Tweet[]) {
  const counts = new Map<string, number>();
  let tagged = 0;
  for (const t of tweets) {
    let hit = false;
    for (const [k, re] of TOPICS) {
      if (re.test(t.text || '')) {
        counts.set(k, (counts.get(k) || 0) + 1);
        hit = true;
      }
    }
    if (hit) tagged++;
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const all = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => ({ k, p: pct(c, total) }));
  // Normalised entropy over all topics: 0 = one topic only, 100 = evenly spread.
  const entropy = all.reduce((s, { p }) => (p ? s - (p / 100) * Math.log(p / 100) : s), 0);
  return { top: all.slice(0, 5), tagged, range: Math.round((entropy / Math.log(TOPICS.length)) * 100) };
}

export function summarize(files: ExportFile[], timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): Summary {
  const likesFile = files.find((f) => f.kind === 'likes');
  const savesFile = files.find((f) => f.kind === 'bookmarks');
  if (!likesFile && !savesFile) throw new Error('Add a likes or bookmarks export.');

  const to = Math.max(...files.map((f) => Date.parse(f.exported_at)));
  const from = to - 365 * DAY_MS;
  const likes = likesFile ? inWindow(likesFile, from) : [];
  const saves = savesFile ? inWindow(savesFile, from) : [];
  const all = [...likes, ...saves];
  const likedIds = new Set(likes.map((t) => t.id));
  const both = saves.filter((t) => likedIds.has(t.id)).length;

  const byAuthor = new Map<string, { h: string; n: string; likes: number; saves: number }>();
  const tally = (t: Tweet, key: 'likes' | 'saves') => {
    const h = t.author!.screen_name;
    const row = byAuthor.get(h) || { h, n: t.author!.name, likes: 0, saves: 0 };
    row[key]++;
    byAuthor.set(h, row);
  };
  likes.forEach((t) => tally(t, 'likes'));
  saves.forEach((t) => tally(t, 'saves'));
  const top = [...byAuthor.values()]
    .sort((a, b) => b.likes + b.saves - (a.likes + a.saves) || b.likes - a.likes)
    .slice(0, 5);

  // When the posts you engaged with were published, in the creator's local time.
  const dayHour = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const grid = new Array(168).fill(0);
  const hours = new Array(24).fill(0);
  for (const t of all) {
    if (!t.created_at) continue;
    const parts = dayHour.formatToParts(new Date(t.created_at));
    const d = DAYS.indexOf(parts.find((p) => p.type === 'weekday')!.value);
    const h = Number(parts.find((p) => p.type === 'hour')!.value);
    grid[d * 24 + h]++;
    hours[h]++;
  }
  const gridMax = Math.max(1, ...grid);
  const clock = grid.map((c) => Math.min(9, Math.round((c / gridMax) * 9))).join('');
  const peakHour = hours.indexOf(Math.max(...hours));

  const months: Summary['months'] = [];
  for (let d = new Date(from); monthKey(d.getTime()) <= monthKey(to); d.setUTCMonth(d.getUTCMonth() + 1, 1)) {
    months.push({ m: monthKey(d.getTime()), l: 0, b: 0 });
  }
  const bump = (file: ExportFile | undefined, key: 'l' | 'b') => {
    if (!file) return;
    const times = actionTimes(file.tweets);
    file.tweets.forEach((t, i) => {
      if (t.unavailable || !t.author || times[i] < from) return;
      const row = months.find((r) => r.m === monthKey(times[i]));
      if (row) row[key]++;
    });
  };
  bump(likesFile, 'l');
  bump(savesFile, 'b');

  const oldestSave = saves.reduce<Tweet | null>((o, t) => (!o || t.created_at! < o.created_at! ? t : o), null);
  const hasVideo = (t: Tweet) => (t.media || []).some((m) => m.type === 'video' || m.type === 'animated_gif');
  const hasPhoto = (t: Tweet) => (t.media || []).some((m) => m.type === 'photo');

  const likeCounts = all.map((t) => t.metrics?.likes ?? 0);
  const biggest = all.reduce<Tweet | null>((b, t) => ((t.metrics?.views ?? 0) > (b?.metrics?.views ?? 0) ? t : b), null);
  const niche = pct(likeCounts.filter((c) => c < NICHE_LIKES).length, all.length);

  const video = all.filter(hasVideo).length;
  const photo = all.filter((t) => !hasVideo(t) && hasPhoto(t)).length;

  const topics = topicShares(all);
  const saveRatio = likes.length ? saves.length / likes.length : saves.length ? 1 : 0;
  const builderShare = topics.top.filter((t) => t.k === 'AI' || t.k === 'Code').reduce((s, t) => s + t.p, 0) / 100;
  const mediaShare = (video + photo) / Math.max(1, all.length);
  const persona = pickPersona({ saveRatio, builderShare, mediaShare, niche: niche / 100 });

  return {
    v: 1,
    handle: likesFile?.account || savesFile?.account || 'you',
    from: new Date(from).toISOString().slice(0, 10),
    to: new Date(to).toISOString().slice(0, 10),
    likes: likes.length,
    bookmarks: saves.length,
    both,
    accounts: byAuthor.size,
    top,
    clock,
    peakHour,
    topics: topics.top,
    vault: {
      onlySaved: pct(saves.length - both, saves.length),
      video: pct(saves.filter(hasVideo).length, saves.length),
      gems: saves.filter((t) => (t.metrics?.likes ?? 0) < NICHE_LIKES).length,
      oldest: oldestSave ? { h: oldestSave.author!.screen_name, y: new Date(oldestSave.created_at!).getUTCFullYear() } : null,
    },
    months,
    taste: {
      median: median(likeCounts),
      niche,
      biggest: biggest?.metrics?.views ? { h: biggest.author!.screen_name, views: biggest.metrics.views } : null,
    },
    media: { video: pct(video, all.length), photo: pct(photo, all.length), text: pct(all.length - video - photo, all.length) },
    langs: new Set(all.map((t) => t.lang).filter((l) => l && !NON_LANGS.has(l))).size,
    persona: {
      id: persona,
      traits: [topics.range, Math.min(100, niche * 2), Math.min(100, Math.round(saveRatio * 100))],
    },
  };
}

// Each signal is scaled so 1 means "clearly this type"; the strongest one wins.
export function pickPersona(s: { saveRatio: number; builderShare: number; mediaShare: number; niche: number }): PersonaId {
  const scores: [PersonaId, number][] = [
    ['curator', s.saveRatio / 0.5],
    ['builder', s.builderShare / 0.45],
    ['visualist', s.mediaShare / 0.75],
    ['scout', s.niche / 0.35],
  ];
  const [id, score] = scores.reduce((a, b) => (b[1] > a[1] ? b : a));
  return score >= 1 ? id : 'wanderer';
}

export const TRAITS = ['Range', 'Underground', 'Hoarding'] as const;

export const PERSONAS: Record<PersonaId, { name: string; line: string }> = {
  curator: { name: 'The Curator', line: 'Your bookmarks have bookmarks.' },
  builder: { name: 'The Builder', line: 'You scroll like you ship: fast, and for parts.' },
  visualist: { name: 'The Visualist', line: 'You read with your eyes. Mostly the pictures.' },
  scout: { name: 'The Scout', line: 'You liked it before it had likes.' },
  wanderer: { name: 'The Wanderer', line: 'No algorithm can pin you down.' },
};
