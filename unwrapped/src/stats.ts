// Turns x-export JSON files into the small summary that the story shows and the share link carries.
import { scriptLang, type Lang } from './i18n';

export interface Tweet {
  id: string;
  created_at?: string;
  author?: { id?: string | null; screen_name: string; name: string; avatar?: string | null };
  text?: string;
  lang?: string;
  reply_to?: { screen_name?: string | null } | null;
  metrics?: { likes?: number | null; views?: number | null };
  media?: { type: string }[];
  retweet_of?: unknown;
  quoted?: Tweet | null;
  unavailable?: boolean;
}

export type Kind = 'likes' | 'bookmarks' | 'posts';
export type Platform = 'x' | 'threads';

export const PLATFORMS: Record<Platform, { name: string; saves: string; save: string }> = {
  x: { name: 'X', saves: 'bookmarks', save: 'bookmark' },
  threads: { name: 'Threads', saves: 'saves', save: 'save' },
};

export interface ExportFile {
  // Missing on files from before Threads support, which are all X.
  platform?: Platform;
  kind: Kind;
  exported_at: string;
  account: string | null;
  // Archive uploads carry the profile picture separately, since posts there have no author block.
  avatar?: string | null;
  tweets: Tweet[];
}

export interface Account {
  h: string;
  n: string;
  a: string | null;
  likes: number;
  saves: number;
  replies: number;
}

export interface Summary {
  v: 1;
  p: Platform;
  // The story's language: the one most of the year's posts are written in.
  l: Lang;
  handle: string;
  avatar: string | null;
  from: string;
  to: string;
  likes: number;
  bookmarks: number;
  both: number;
  accounts: number;
  top: Account[];
  // 7 days (Mon first) x 24 hours, each 0-9, in the creator's time zone.
  clock: string;
  // 'you' when the clock comes from your own posts, 'feed' when from the posts you liked and saved.
  clockOf: 'you' | 'feed';
  peakHour: number;
  topics: { k: string; p: number }[];
  vault: { onlySaved: number; video: number; gems: number; oldest: { h: string; y: number } | null };
  months: { m: string; l: number; b: number; p: number }[];
  // Null when the source has no like counts (the X archive).
  taste: { median: number; niche: number; biggest: { h: string; views: number } | null } | null;
  posts: { count: number; replies: number; retweets: number; best: { text: string; likes: number; views: number } | null } | null;
  media: { video: number; photo: number; text: number };
  langs: number;
  persona: { id: PersonaId; traits: [number, number, number] };
}

export type PersonaId = 'curator' | 'builder' | 'visualist' | 'scout' | 'broadcaster' | 'wanderer';

const DAY_MS = 86_400_000;
const NICHE_LIKES = 1000;
const NON_LANGS = new Set(['zxx', 'qme', 'qam', 'qct', 'qht', 'qst', 'und', 'art']);

// Russian words change their endings, so a stem ending in * matches any ending; other words match whole.
// JavaScript's \b only knows Latin letters, hence the explicit letter lookarounds.
function ru(...words: string[]) {
  const alts = words.map((w) => (w.endsWith('*') ? `${w.slice(0, -1)}\\p{L}*` : w));
  return new RegExp(`(?<!\\p{L})(?:${alts.join('|')})(?!\\p{L})`, 'iu');
}

// Order matters only for display; a post can count toward several topics.
export const TOPICS: [string, RegExp, RegExp][] = [
  ['AI', /\b(ai|a\.i\.|llms?|gpt[-\d.o]*|openai|anthropic|claude|gemini|grok|chatgpt|agents?|agentic|models?|prompts?|inference|fine-?tun\w*|tokens?|transformer|diffusion|midjourney|sora|veo|karpathy|deepseek|qwen|mcp|rag|embeddings?|neural|agi)\b/i,
    ru('ии', 'нейросет*', 'нейронк*', 'искусственн*', 'промпт*', 'чатгпт', 'джипити')],
  ['Code', /\b(code|coding|coder|devs?|developers?|programming|typescript|javascript|python|rust|golang|react|nextjs|next\.js|vite|api|apis|github|open[- ]source|repo|cli|terminal|backend|frontend|database|postgres|sql|deploy\w*|bug|compiler|vibe ?cod\w*|npm|npx|linux|kernel)\b/i,
    ru('программист*', 'программирован*', 'код', 'кода', 'коде', 'кодинг*', 'разработчик*', 'айти', 'айтишн*', 'фронтенд*', 'бэкенд*')],
  ['Design', /\b(design\w*|ui|ux|figma|typography|fonts?|illustrat\w*|animation|motion|3d|blender|shaders?|art|artist|aesthetic|visuals?|render\w*|pixel|branding|logo|color|colour)\b/i,
    ru('дизайн*', 'иллюстрац*', 'шрифт*', 'анимац*', 'рисун*', 'рисова*', 'художни*', 'искусство', 'искусства', 'искусству', 'искусством', 'эстетик*', 'арт')],
  ['Startups', /\b(startups?|founders?|revenue|mrr|arr|saas|vcs?|funding|raised|seed|series [a-c]|yc|ycombinator|indie ?hack\w*|bootstrap\w*|customers?|growth|launch\w*|product hunt|ship(ped|ping)?|business)\b/i,
    ru('стартап*', 'бизнес*', 'предпринимател*', 'клиент*', 'продаж*', 'маркетинг*', 'бренд*', 'инвестиц*', 'инвестор*')],
  ['Crypto', /\b(crypto|bitcoin|btc|eth|ethereum|solana|sol|web3|defi|nfts?|tokenomics|memecoins?|blockchain|onchain|wallet|airdrop|stablecoins?)\b/i,
    ru('крипт*', 'биткоин*', 'биток*', 'блокчейн*', 'нфт')],
  ['Security', /\b(hack\w*|exploit\w*|malware|ransomware|vulnerab\w*|cve|0day|zero-day|breach\w*|infosec|cybersec\w*|phishing|backdoor|pentest\w*)\b/i,
    ru('хакер*', 'взлом*', 'мошенни*', 'скам*', 'фишинг*')],
  ['Games', /\b(games?|gaming|gamer|playstation|ps5|xbox|nintendo|switch 2|steam|unity|unreal|godot|indie game|esports|minecraft|gta)\b/i,
    ru('видеоигр*', 'геймер*', 'гейминг*', 'плейстейшн*', 'приставк*', 'дота*', 'доту', 'стример*')],
  ['Health', /\b(health\w*|sleep|fitness|workout|gym|longevity|diet|nutrition|protein|fasting|brain|biology|medic\w*|doctor|cancer|aging|blueprint|therapy|therapist)\b/i,
    ru('здоровь*', 'здоровый', 'здорового', 'трениров*', 'фитнес*', 'диет*', 'похуде*', 'врач*', 'болезн*', 'болит', 'лечени*', 'таблетк*', 'психолог*', 'терапи*', 'витамин*', 'калори*')],
  ['Science', /\b(science|scientists?|physics|space|nasa|spacex|rocket|starship|mars|quantum|research\w*|papers?|universe|telescope|math\w*)\b/i,
    ru('наук*', 'учён*', 'учен*', 'космос*', 'физик*', 'исследован*', 'вселенн*')],
  ['Sport', /\b(football|soccer|premier league|champions league|goal|nba|nfl|f1|formula 1|ufc|boxing|cricket|tennis|messi|ronaldo|arsenal|chelsea|liverpool|madrid|barcelona)\b/i,
    ru('футбол*', 'матч*', 'баскетбол*', 'бокс', 'боксе', 'боксом', 'боксёр*', 'боксер*', 'теннис*', 'хоккей*', 'олимпиад*', 'чемпионат*')],
  ['World', /\b(politic\w*|elections?|president|government|congress|senate|trump|biden|war|ukraine|russia|israel|gaza|china|economy|inflation|tariffs?|policy)\b/i,
    ru('политик*', 'выборы', 'выборах', 'выборов', 'президент*', 'правительств*', 'войн*', 'санкци*', 'депутат*', 'путин*', 'токаев*')],
  ['Love', /\b(relationships?|boyfriend|girlfriend|husband|wife|dating|crush|ex|breakup|broke up|wedding|married|love|in love)\b/i,
    ru('отношени*', 'парень', 'парня', 'парнем', 'девушк*', 'муж', 'мужа', 'мужу', 'мужем', 'жена', 'жену', 'жене', 'женой', 'бывш*', 'свидани*', 'любов*', 'люблю', 'влюб*', 'расстал*', 'измен*', 'свадьб*', 'краш*', 'замуж*', 'женат*')],
  ['Beauty', /\b(makeup|skincare|nails?|manicure|hair|haircut|lashes|brows|outfits?|dress|fashion|style|beauty|perfume|lipstick|shopping)\b/i,
    ru('макияж*', 'косметик*', 'маникюр*', 'ногт*', 'волос*', 'стрижк*', 'ресниц*', 'бров*', 'платье', 'платья', 'одежд*', 'шоппинг*', 'сумк*', 'туфл*', 'кроссовк*', 'стилист*', 'парфюм*', 'духи')],
  ['Food', /\b(food|recipes?|coffee|cafe|restaurants?|dinner|breakfast|lunch|cake|pizza|sushi|dessert|chocolate|cook\w*|baking|delicious|hungry)\b/i,
    ru('еда', 'еду', 'еды', 'едой', 'вкусн*', 'рецепт*', 'кофе', 'кафе', 'ресторан*', 'ужин*', 'завтрак*', 'обед*', 'торт*', 'пицц*', 'суши', 'десерт*', 'пирож*', 'шоколад*', 'поесть', 'голодн*')],
  ['Travel', /\b(travel\w*|trips?|vacation|holidays?|flights?|airport|hotels?|beach|passport)\b/i,
    ru('путешеств*', 'поездк*', 'отпуск', 'отпуска', 'отпуске', 'отпусках', 'отпуску', 'самол[её]т*', 'аэропорт*', 'перел[её]т*', 'отел*', 'гостиниц*', 'море', 'моря', 'морю', 'пляж*')],
  ['Music', /\b(music|songs?|albums?|concerts?|singer|rapper|playlists?|spotify|tracks?)\b/i,
    ru('музык*', 'песн*', 'песня', 'трек', 'трека', 'треки', 'треков', 'альбом*', 'концерт*', 'певиц*', 'певец', 'певца', 'рэп*', 'клип*', 'плейлист*')],
  ['Screen', /\b(movies?|films?|series|tv shows?|netflix|actor|actress|anime|episodes?|cinema)\b/i,
    ru('фильм*', 'кино', 'сериал*', 'акт[её]р*', 'актрис*', 'нетфликс*', 'мультик*', 'аниме', 'сезон*')],
  ['Family', /\b(mom|mum|dad|parents?|kids?|child|children|son|daughter|baby|babies|family|pregnan\w*|grandma|grandpa)\b/i,
    ru('мам*', 'папа', 'папы', 'папе', 'папу', 'родител*', 'реб[её]н*', 'дети', 'детей', 'детям', 'детьми', 'сын*', 'дочь', 'дочк*', 'дочер*', 'бабушк*', 'дедушк*', 'семья', 'семьи', 'семье', 'семью', 'семь[её]й', 'семейн*', 'беременн*', 'малыш*')],
  ['Pets', /\b(cats?|kittens?|dogs?|pupp(y|ies)|pets?)\b/i,
    ru('кот', 'кота', 'коту', 'котом', 'котик*', 'кошк*', 'кот[её]н*', 'котят*', 'собак*', 'собачк*', 'п[её]с', 'пса', 'щен*', 'питом*')],
  ['Money', /\b(money|salary|rent|mortgage|loans?|debt|budget|expensive|cheap|discount)\b/i,
    ru('деньг*', 'денег', 'зарплат*', 'кредит*', 'ипотек*', 'тенге', 'рубл*', 'доллар*', 'бюджет*', 'долг', 'долга', 'долги', 'долгов', 'долгу', 'дорого', 'дешево', 'дёшево', 'скидк*')],
];

export function parseExport(text: string): ExportFile {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.tweets) || !['likes', 'bookmarks', 'posts'].includes(data.kind)) {
    throw new Error('This is not an Unwrapped likes, bookmarks or posts JSON file.');
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
  return file.tweets.filter((t, i) => !t.unavailable && times[i] >= from);
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
    for (const [k, en, ruRe] of TOPICS) {
      if (en.test(t.text || '') || ruRe.test(t.text || '')) {
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

const sameHandle = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

// Profile pictures come small; ask X's CDN for the 400px version.
export const bigAvatar = (url?: string | null) => (url ? url.replace(/_normal(\.\w+)$/, '_400x400$1') : null);

export function summarize(files: ExportFile[], timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): Summary {
  const likesFile = files.find((f) => f.kind === 'likes');
  const savesFile = files.find((f) => f.kind === 'bookmarks');
  const postsFile = files.find((f) => f.kind === 'posts');
  if (!likesFile && !savesFile && !postsFile) throw new Error('Add a likes, bookmarks or posts export.');
  const platform = files[0].platform === 'threads' ? 'threads' : 'x';
  if (files.some((f) => (f.platform === 'threads' ? 'threads' : 'x') !== platform)) throw new Error('Pick files from X or from Threads, not both.');
  const handle = files.find((f) => f.account)?.account || 'you';

  const to = Math.max(...files.map((f) => Date.parse(f.exported_at)));
  const from = to - 365 * DAY_MS;
  const likes = likesFile ? inWindow(likesFile, from) : [];
  const saves = savesFile ? inWindow(savesFile, from) : [];
  const all = [...likes, ...saves];
  const likedIds = new Set(likes.map((t) => t.id));
  const both = saves.filter((t) => likedIds.has(t.id)).length;

  // The Replies tab also returns the posts you replied to, so keep only your own.
  const mine = (postsFile?.tweets || []).filter(
    (t) => !t.unavailable && sameHandle(t.author?.screen_name, handle) && t.created_at && Date.parse(t.created_at) >= from,
  );
  const own = mine.filter((t) => !t.retweet_of);
  const replies = own.filter((t) => t.reply_to && !sameHandle(t.reply_to.screen_name, handle));

  const avatars = new Map<string, string>();
  const seen = (t?: Tweet | null) => {
    const a = t?.author;
    if (a?.screen_name && a.avatar) avatars.set(a.screen_name.toLowerCase(), a.avatar);
    if (t?.quoted) seen(t.quoted);
  };
  files.forEach((f) => f.tweets.forEach(seen));

  const byAuthor = new Map<string, Account>();
  const tally = (h: string | null | undefined, n: string | null | undefined, key: 'likes' | 'saves' | 'replies') => {
    if (!h) return;
    const k = h.toLowerCase();
    const row = byAuthor.get(k) || { h, n: n || h, a: null, likes: 0, saves: 0, replies: 0 };
    row[key]++;
    byAuthor.set(k, row);
  };
  likes.forEach((t) => tally(t.author?.screen_name, t.author?.name, 'likes'));
  saves.forEach((t) => tally(t.author?.screen_name, t.author?.name, 'saves'));
  replies.forEach((t) => tally(t.reply_to!.screen_name, null, 'replies'));
  byAuthor.delete(handle.toLowerCase());
  const score = (a: Account) => a.likes + a.saves + a.replies;
  const top = [...byAuthor.values()]
    .sort((a, b) => score(b) - score(a) || b.likes - a.likes)
    .slice(0, 5)
    .map((a) => ({ ...a, a: bigAvatar(avatars.get(a.h.toLowerCase())) }));

  // Your own posting times when there are enough of them, else when the posts you liked and saved went live.
  const clockOf = own.length >= 20 ? 'you' : 'feed';
  const dayHour = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const grid = new Array(168).fill(0);
  const hours = new Array(24).fill(0);
  for (const t of clockOf === 'you' ? own : all) {
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
    months.push({ m: monthKey(d.getTime()), l: 0, b: 0, p: 0 });
  }
  const bucket = (ms: number) => months.find((r) => r.m === monthKey(ms));
  const bump = (file: ExportFile | undefined, key: 'l' | 'b') => {
    if (!file) return;
    const times = actionTimes(file.tweets);
    file.tweets.forEach((t, i) => {
      if (t.unavailable || times[i] < from) return;
      const row = bucket(times[i]);
      if (row) row[key]++;
    });
  };
  bump(likesFile, 'l');
  bump(savesFile, 'b');
  own.forEach((t) => {
    const row = bucket(Date.parse(t.created_at!));
    if (row) row.p++;
  });

  const oldestSave = saves.reduce<Tweet | null>((o, t) => (t.author && (!o || t.created_at! < o.created_at!) ? t : o), null);
  const hasVideo = (t: Tweet) => (t.media || []).some((m) => m.type === 'video' || m.type === 'animated_gif');
  const hasPhoto = (t: Tweet) => (t.media || []).some((m) => m.type === 'photo');

  const measured = all.filter((t) => t.metrics?.likes != null);
  const likeCounts = measured.map((t) => t.metrics!.likes!);
  const biggest = measured.reduce<Tweet | null>((b, t) => ((t.metrics?.views ?? 0) > (b?.metrics?.views ?? 0) ? t : b), null);
  const niche = pct(likeCounts.filter((c) => c < NICHE_LIKES).length, measured.length);

  const video = all.filter(hasVideo).length;
  const photo = all.filter((t) => !hasVideo(t) && hasPhoto(t)).length;

  const best = own.reduce<Tweet | null>((b, t) => ((t.metrics?.likes ?? 0) > (b?.metrics?.likes ?? -1) ? t : b), null);

  const topics = topicShares([...all, ...own]);
  const langOf = (t: Tweet) => t.lang || scriptLang(t.text || '');
  const votes = { en: 0, ru: 0 };
  for (const t of own.length >= 10 ? own : [...all, ...own]) {
    const l = scriptLang(t.text || '');
    if (l) votes[l]++;
  }
  const saveRatio = likes.length ? saves.length / likes.length : saves.length ? 1 : 0;
  const builderShare = topics.top.filter((t) => t.k === 'AI' || t.k === 'Code').reduce((s, t) => s + t.p, 0) / 100;
  const mediaShare = (video + photo) / Math.max(1, all.length);
  const postRatio = own.length / Math.max(1, likes.length + saves.length);
  const persona = pickPersona({ saveRatio, builderShare, mediaShare, niche: niche / 100, postRatio });

  return {
    v: 1,
    p: platform,
    l: votes.ru > votes.en ? 'ru' : 'en',
    handle,
    avatar: bigAvatar(files.find((f) => f.avatar)?.avatar || avatars.get(handle.toLowerCase())),
    from: new Date(from).toISOString().slice(0, 10),
    to: new Date(to).toISOString().slice(0, 10),
    likes: likes.length,
    bookmarks: saves.length,
    both,
    accounts: byAuthor.size,
    top,
    clock,
    clockOf,
    peakHour,
    topics: topics.top,
    vault: {
      onlySaved: pct(saves.length - both, saves.length),
      video: pct(saves.filter(hasVideo).length, saves.length),
      gems: saves.filter((t) => t.metrics?.likes != null && t.metrics.likes < NICHE_LIKES).length,
      oldest: oldestSave ? { h: oldestSave.author!.screen_name, y: new Date(oldestSave.created_at!).getUTCFullYear() } : null,
    },
    months,
    taste: measured.length
      ? {
          median: median(likeCounts),
          niche,
          biggest: biggest?.metrics?.views ? { h: biggest.author!.screen_name, views: biggest.metrics.views } : null,
        }
      : null,
    posts: postsFile
      ? {
          count: own.length,
          replies: replies.length,
          retweets: mine.length - own.length,
          best: best?.text
            ? { text: best.text.slice(0, 160), likes: best.metrics?.likes ?? 0, views: best.metrics?.views ?? 0 }
            : null,
        }
      : null,
    media: { video: pct(video, all.length), photo: pct(photo, all.length), text: pct(all.length - video - photo, all.length) },
    langs: new Set([...all, ...own].map(langOf).filter((l) => l && !NON_LANGS.has(l))).size,
    persona: {
      id: persona,
      traits: [topics.range, Math.min(100, niche * 2), Math.min(100, Math.round(saveRatio * 100))],
    },
  };
}

// Each signal is scaled so 1 means "clearly this type"; the strongest one wins.
export function pickPersona(s: { saveRatio: number; builderShare: number; mediaShare: number; niche: number; postRatio: number }): PersonaId {
  const scores: [PersonaId, number][] = [
    ['broadcaster', s.postRatio / 0.4],
    ['curator', s.saveRatio / 0.5],
    ['builder', s.builderShare / 0.45],
    ['visualist', s.mediaShare / 0.75],
    ['scout', s.niche / 0.35],
  ];
  const [id, score] = scores.reduce((a, b) => (b[1] > a[1] ? b : a));
  return score >= 1 ? id : 'wanderer';
}

export const PERSONA_IDS: PersonaId[] = ['curator', 'builder', 'visualist', 'scout', 'broadcaster', 'wanderer'];
