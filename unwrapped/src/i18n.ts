// Story text in each supported language. The story speaks the language most of the year's posts are in.
// Russian copy avoids past-tense verbs about "you", which would need the viewer's gender.
import type { PersonaId } from './stats';

export type Lang = 'en' | 'ru';

const CYRILLIC = /\p{Script=Cyrillic}/gu;
const LATIN = /\p{Script=Latin}/gu;

// X and Threads often leave a post's language empty; the alphabet is a good enough guess for these two.
export function scriptLang(text: string): Lang | null {
  const cyr = text.match(CYRILLIC)?.length ?? 0;
  const lat = text.match(LATIN)?.length ?? 0;
  if (!cyr && !lat) return null;
  return cyr >= lat ? 'ru' : 'en';
}

type Forms = [one: string, few: string, many: string];

export interface Strings {
  locale: string;
  fmt(n: number): string;
  compact(n: number): string;
  // Number plus noun in the right form, e.g. "1 like", "2 лайка".
  plural(n: number, noun: Noun, num?: (n: number) => string): string;
  hour(h: number): string;
  days: string[];
  months: string[];
  monthInitials: string;
  moods: [string, string, string, string, string];
  topic(k: string): string;
  persona: Record<PersonaId, { name: string; line: string }>;
  traits: [string, string, string];
  intro: { title(platform: string, year: string): string; months: string };
  top: { title: string; foot(saves: string, accounts: string): string };
  posts: { title(count: string): string; biggest: string; newPosts: Noun; replies: Noun; reposts: Noun };
  clock: { mine(platform: string): string; feed: string; yourFeed: string; footMine: string; footFeed: string };
  topics: { title: string; foot(withPosts: boolean): string };
  vault: { title: string; lede(count: string): string; likedFirst: string; video: string; gems: string; oldest(handle: string): string };
  taste: { title: string; typical: string; underground: string; mainstream: string; video: string; photo: string; text: string; niche(p: number): string; biggest(handle: string, views: string): string; langs(n: number): string };
  wave: { title: string; likes: string; saves(platform: string): string; posts: string; foot(platform: string): string; peak(month: string, year: string): string };
  personaKicker(platform: string): string;
  outro: { title: string; copy: string; gif: string; png: string; replay: string; copied: string; rendering(p: number): string };
  card: { title(platform: string): string; footer(host: string, saves: string): string };
}

export type Noun = 'like' | 'save' | 'bookmark' | 'post' | 'account' | 'reply' | 'view' | 'newPost' | 'repost';

const EN_NOUNS: Record<Noun, [string, string]> = {
  like: ['like', 'likes'],
  save: ['save', 'saves'],
  bookmark: ['bookmark', 'bookmarks'],
  post: ['post', 'posts'],
  account: ['account', 'accounts'],
  reply: ['reply', 'replies'],
  view: ['view', 'views'],
  newPost: ['new post', 'new posts'],
  repost: ['repost', 'reposts'],
};

const RU_NOUNS: Record<Noun, Forms> = {
  like: ['лайк', 'лайка', 'лайков'],
  save: ['сохранение', 'сохранения', 'сохранений'],
  bookmark: ['закладка', 'закладки', 'закладок'],
  post: ['пост', 'поста', 'постов'],
  account: ['аккаунт', 'аккаунта', 'аккаунтов'],
  reply: ['ответ', 'ответа', 'ответов'],
  view: ['просмотр', 'просмотра', 'просмотров'],
  newPost: ['новый пост', 'новых поста', 'новых постов'],
  repost: ['репост', 'репоста', 'репостов'],
};

const ruRules = new Intl.PluralRules('ru');
const ruForm = (n: number, [one, few, many]: Forms) => {
  const r = ruRules.select(n);
  return r === 'one' ? one : r === 'few' ? few : many;
};

const enFmt = (n: number) => Number(n).toLocaleString('en-US');
const ruFmt = (n: number) => Number(n).toLocaleString('ru-RU');

const en: Strings = {
  locale: 'en-US',
  fmt: enFmt,
  compact: (n) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n),
  plural: (n, noun, num = enFmt) => `${num(n)} ${EN_NOUNS[noun][n === 1 ? 0 : 1]}`,
  hour: (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`,
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  monthInitials: 'JFMAMJJASOND',
  moods: ['Early Bird', 'Lunch Break', 'Golden Hour', 'Night Owl', 'After Hours'],
  topic: (k) => k,
  persona: {
    curator: { name: 'The Curator', line: 'Your bookmarks have bookmarks.' },
    builder: { name: 'The Builder', line: 'You scroll like you ship: fast, and for parts.' },
    visualist: { name: 'The Visualist', line: 'You read with your eyes. Mostly the pictures.' },
    scout: { name: 'The Scout', line: 'You liked it before it had likes.' },
    broadcaster: { name: 'The Broadcaster', line: 'You came to talk, not to scroll.' },
    wanderer: { name: 'The Wanderer', line: 'No algorithm can pin you down.' },
  },
  traits: ['Range', 'Underground', 'Hoarding'],
  intro: { title: (p, y) => `Your ${p}<br>Unwrapped<br>${y}`, months: '12 months.' },
  top: { title: 'Your top 5<br>accounts.', foot: (saves, n) => `Ranked by your likes, ${saves} and replies across ${n} accounts.` },
  posts: { title: (n) => `You posted<br><span class="grad">${n}</span> times.`, biggest: 'Your biggest post', newPosts: 'newPost', replies: 'reply', reposts: 'repost' },
  clock: {
    mine: (p) => `You live<br>on ${p} at`,
    feed: 'The posts you<br>love drop at',
    yourFeed: 'Your feed: ',
    footMine: 'When you posted and replied.',
    footFeed: 'When the posts you liked and saved went live.',
  },
  topics: { title: 'Your year<br>in topics.', foot: (posts) => `Share of topic mentions across everything you ${posts ? 'liked, saved and posted' : 'liked and saved'}.` },
  vault: {
    title: 'The Vault.',
    lede: (n) => `${n} posts saved for later.`,
    likedFirst: 'of your saves got a like first.',
    video: 'of the vault is video.',
    gems: 'hidden gems with under 1K likes.',
    oldest: (h) => `Oldest save: a post by @${h}.`,
  },
  taste: {
    title: 'Mainstream or<br>underground?',
    typical: 'likes on a typical post you loved',
    underground: 'Underground',
    mainstream: 'Mainstream',
    video: 'Video',
    photo: 'Photo',
    text: 'Text',
    niche: (p) => `${p}% had under 1K likes.`,
    biggest: (h, v) => `Biggest: a @${h} post with ${v} views.`,
    langs: (n) => `Posts in ${n} ${n === 1 ? 'language' : 'languages'}.`,
  },
  wave: {
    title: 'Your year<br>in a wave.',
    likes: 'Likes',
    saves: (p) => (p === 'X' ? 'Bookmarks' : 'Saves'),
    posts: 'Posts',
    foot: (p) => `${p} does not show when you liked a post, so each like is dated by its place in your list.`,
    peak: (m, y) => `Peak: ${m} ${y}`,
  },
  personaKicker: (p) => `Your ${p} personality`,
  outro: {
    title: "That's a wrap,",
    copy: 'Copy share link',
    gif: 'Save GIF',
    png: 'Save card',
    replay: 'Replay',
    copied: 'Link copied',
    rendering: (p) => `Rendering ${p}%`,
  },
  card: { title: (p) => `${p} Unwrapped`, footer: (host, saves) => `${host} · 12 months of likes and ${saves}` },
};

const RU_TOPICS: Record<string, string> = {
  AI: 'ИИ',
  Code: 'Код',
  Design: 'Дизайн',
  Startups: 'Бизнес',
  Crypto: 'Крипта',
  Security: 'Хакеры',
  Games: 'Игры',
  Health: 'Здоровье',
  Science: 'Наука',
  Sport: 'Спорт',
  World: 'Политика',
  Love: 'Любовь',
  Beauty: 'Красота',
  Food: 'Еда',
  Travel: 'Поездки',
  Music: 'Музыка',
  Screen: 'Кино',
  Family: 'Семья',
  Pets: 'Питомцы',
  Money: 'Деньги',
};

const ru: Strings = {
  locale: 'ru-RU',
  fmt: ruFmt,
  compact: (n) => Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(n),
  plural: (n, noun, num = ruFmt) => `${num(n)} ${ruForm(n, RU_NOUNS[noun])}`,
  hour: (h) => `${String(h).padStart(2, '0')}:00`,
  days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  months: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  monthInitials: 'ЯФМАМИИАСОНД',
  moods: ['Ранняя пташка', 'Обеденный перерыв', 'Золотой час', 'Ночная сова', 'После полуночи'],
  topic: (k) => RU_TOPICS[k] || k,
  persona: {
    curator: { name: 'Куратор', line: 'У твоих сохранений есть свои сохранения.' },
    builder: { name: 'Билдер', line: 'Листаешь так же, как запускаешь: быстро и по делу.' },
    visualist: { name: 'Визуал', line: 'Ты читаешь глазами. В основном картинки.' },
    scout: { name: 'Скаут', line: 'Тебе нравится то, что ещё не набрало лайков.' },
    broadcaster: { name: 'Голос', line: 'Ты здесь, чтобы говорить, а не листать.' },
    wanderer: { name: 'Странник', line: 'Ни один алгоритм тебя не раскусит.' },
  },
  traits: ['Разброс', 'Андеграунд', 'Запасливость'],
  intro: { title: (p, y) => `Итоги<br>${p}<br>${y}`, months: '12 месяцев.' },
  top: { title: 'Твой топ-5<br>аккаунтов.', foot: (_saves, n) => `По лайкам, сохранениям и ответам. Всего аккаунтов: ${n}.` },
  posts: { title: (n) => `<span class="grad">${n}</span><br>постов за год.`, biggest: 'Самый популярный пост', newPosts: 'newPost', replies: 'reply', reposts: 'repost' },
  clock: {
    mine: (p) => `Твой час<br>в ${p}:`,
    feed: 'Любимые посты<br>выходят в',
    yourFeed: 'Твоя лента: ',
    footMine: 'Когда ты постишь и отвечаешь.',
    footFeed: 'Когда выходят посты, которые ты лайкаешь и сохраняешь.',
  },
  topics: { title: 'Твой год<br>в темах.', foot: (posts) => `Доля упоминаний тем во всём, что ты ${posts ? 'лайкаешь, сохраняешь и постишь' : 'лайкаешь и сохраняешь'}.` },
  vault: {
    title: 'Тайник.',
    lede: (n) => `Сохранено на потом: ${n}.`,
    likedFirst: 'сохранений с твоим лайком.',
    video: 'тайника занимает видео.',
    gems: 'скрытых жемчужин до 1K лайков.',
    oldest: (h) => `Самое старое: пост @${h}.`,
  },
  taste: {
    title: 'Мейнстрим или<br>андеграунд?',
    typical: 'лайков у типичного поста, который тебе зашёл',
    underground: 'Андеграунд',
    mainstream: 'Мейнстрим',
    video: 'Видео',
    photo: 'Фото',
    text: 'Текст',
    niche: (p) => `У ${p}% меньше 1K лайков.`,
    biggest: (h, v) => `Самый громкий: пост @${h}, ${v} просмотров.`,
    langs: (n) => `Языков в ленте: ${n}.`,
  },
  wave: {
    title: 'Твой год<br>волной.',
    likes: 'Лайки',
    saves: (p) => (p === 'X' ? 'Закладки' : 'Сохранения'),
    posts: 'Посты',
    foot: (p) => `${p} не показывает время лайка, поэтому каждый лайк датирован по месту в списке.`,
    peak: (m, y) => `Пик: ${m} ${y}`,
  },
  personaKicker: (p) => `Твой типаж в ${p}`,
  outro: {
    title: 'Вот и всё,',
    copy: 'Скопировать ссылку',
    gif: 'GIF',
    png: 'Карточка',
    replay: 'Ещё раз',
    copied: 'Ссылка скопирована',
    rendering: (p) => `Рендер ${p}%`,
  },
  card: { title: (p) => `Итоги ${p}`, footer: (host, saves) => `${host} · 12 месяцев лайков и ${saves === 'bookmarks' ? 'закладок' : 'сохранений'}` },
};

export const STRINGS: Record<Lang, Strings> = { en, ru };
