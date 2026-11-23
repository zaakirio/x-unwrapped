// The share link carries the summary in the URL fragment, which browsers never send to the server.
import { PERSONAS, type PersonaId, type Summary } from './stats';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array) {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function encodeSummary(s: Summary) {
  return toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(s)), new CompressionStream('deflate-raw')));
}

export async function decodeSummary(token: string): Promise<Summary> {
  const json = new TextDecoder().decode(await pipe(fromBase64Url(token), new DecompressionStream('deflate-raw')));
  return clean(JSON.parse(json));
}

// Anyone can craft a link, so rebuild the summary with strict types before any of it reaches the page.
function clean(s: any): Summary {
  if (s?.v !== 1) throw new Error('Unknown link version.');
  const num = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error('Bad number in link.');
    return n;
  };
  const str = (v: unknown, max = 80) => String(v ?? '').slice(0, max);
  // Only X's own image CDN, so a crafted link cannot point viewers at another host.
  const avatar = (v: unknown) => (typeof v === 'string' && /^https:\/\/pbs\.twimg\.com\/profile_images\/[\w/.-]+$/.test(v) ? v : null);
  const date = (v: unknown) => {
    const d = str(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Bad date in link.');
    return d;
  };
  const clock = String(s.clock);
  if (!/^[0-9]{168}$/.test(clock)) throw new Error('Bad clock in link.');
  if (!(s.persona?.id in PERSONAS)) throw new Error('Bad persona in link.');
  return {
    v: 1,
    handle: str(s.handle),
    avatar: avatar(s.avatar),
    from: date(s.from),
    to: date(s.to),
    likes: num(s.likes),
    bookmarks: num(s.bookmarks),
    both: num(s.both),
    accounts: num(s.accounts),
    top: (s.top || []).slice(0, 5).map((a: any) => ({
      h: str(a.h),
      n: str(a.n),
      a: avatar(a.a),
      likes: num(a.likes),
      saves: num(a.saves),
      replies: num(a.replies ?? 0),
    })),
    clock,
    clockOf: s.clockOf === 'you' ? 'you' : 'feed',
    peakHour: num(s.peakHour) % 24,
    topics: (s.topics || []).slice(0, 5).map((t: any) => ({ k: str(t.k), p: num(t.p) })),
    vault: {
      onlySaved: num(s.vault?.onlySaved),
      video: num(s.vault?.video),
      gems: num(s.vault?.gems),
      oldest: s.vault?.oldest ? { h: str(s.vault.oldest.h), y: num(s.vault.oldest.y) } : null,
    },
    months: (s.months || []).slice(0, 13).map((m: any) => ({ m: date(`${str(m.m)}-01`).slice(0, 7), l: num(m.l), b: num(m.b), p: num(m.p ?? 0) })),
    taste: s.taste
      ? {
          median: num(s.taste.median),
          niche: num(s.taste.niche),
          biggest: s.taste.biggest ? { h: str(s.taste.biggest.h), views: num(s.taste.biggest.views) } : null,
        }
      : null,
    posts: s.posts
      ? {
          count: num(s.posts.count),
          replies: num(s.posts.replies),
          retweets: num(s.posts.retweets),
          best: s.posts.best ? { text: str(s.posts.best.text, 160), likes: num(s.posts.best.likes), views: num(s.posts.best.views) } : null,
        }
      : null,
    media: { video: num(s.media?.video), photo: num(s.media?.photo), text: num(s.media?.text) },
    langs: num(s.langs),
    persona: { id: s.persona.id as PersonaId, traits: [0, 1, 2].map((i) => num(s.persona.traits?.[i])) as [number, number, number] },
  };
}
