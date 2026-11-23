// Reads the official "Download an archive of your data" zip from X.
// Archives are often gigabytes of media, so the zip is streamed and only the few small data files are inflated.
import { Unzip, UnzipInflate } from 'fflate';
import type { ExportFile, Tweet } from './stats';

const WANTED = /(?:^|\/)data\/(manifest|account|profile|like|tweets?(?:-part\d+)?)\.js$/;
const TWITTER_EPOCH = 1288834974657n;

// Post ids encode their creation time, which is more reliable than the archive's date strings.
export function idTime(id: string) {
  return new Date(Number((BigInt(id) >> 22n) + TWITTER_EPOCH)).toISOString();
}

// Each file is `window.YTD.<name>.part0 = [ ... ]`.
export function parseYtd(text: string): any {
  return JSON.parse(text.slice(text.indexOf('=') + 1));
}

async function unzipDataFiles(file: Blob) {
  const found = new Map<string, string>();
  const pending: Promise<void>[] = [];
  const unzip = new Unzip((entry) => {
    const m = WANTED.exec(entry.name);
    if (!m) return; // Entries that are never started are skipped without inflating.
    pending.push(
      new Promise((ok, fail) => {
        const decoder = new TextDecoder();
        let text = '';
        entry.ondata = (err, chunk, final) => {
          if (err) return fail(err);
          text += decoder.decode(chunk, { stream: !final });
          if (final) {
            found.set(m[1], text);
            ok();
          }
        };
        entry.start();
      }),
    );
  });
  unzip.register(UnzipInflate);
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    unzip.push(value);
  }
  unzip.push(new Uint8Array(0), true);
  await Promise.all(pending);
  return found;
}

export function archiveToExports(files: Map<string, string>): ExportFile[] {
  const account = files.has('account') ? parseYtd(files.get('account')!)[0]?.account : null;
  if (!account?.username) throw new Error('This zip is not an X data archive (no data/account.js).');
  const profile = files.has('profile') ? parseYtd(files.get('profile')!)[0]?.profile : null;
  const manifest = files.has('manifest') ? parseYtd(files.get('manifest')!) : null;
  const exported_at = manifest?.archiveInfo?.generationDate || new Date().toISOString();
  const avatar: string | null = profile?.avatarMediaUrl || null;
  const author = { id: account.accountId, screen_name: account.username, name: account.accountDisplayName || account.username, avatar };

  const likes: Tweet[] = (files.has('like') ? parseYtd(files.get('like')!) : []).map(({ like }: any) => ({
    id: like.tweetId,
    created_at: idTime(like.tweetId),
    text: like.fullText || '',
  }));

  const raw = [...files.entries()].filter(([k]) => /^tweets?(-part\d+)?$/.test(k)).flatMap(([, v]) => parseYtd(v));
  const posts: Tweet[] = raw
    .map(({ tweet }: any) => ({
      id: tweet.id_str,
      created_at: idTime(tweet.id_str),
      author,
      text: tweet.full_text || '',
      lang: tweet.lang,
      reply_to: tweet.in_reply_to_screen_name ? { screen_name: tweet.in_reply_to_screen_name } : null,
      metrics: { likes: Number(tweet.favorite_count) || 0, views: null },
      media: (tweet.extended_entities?.media || []).map((m: any) => ({ type: m.type })),
      retweet_of: /^RT @\w+:/.test(tweet.full_text || '') ? {} : null,
    }))
    .sort((a: Tweet, b: Tweet) => (a.created_at! < b.created_at! ? 1 : -1));

  const base = { exported_at, account: account.username, avatar };
  return [
    { ...base, kind: 'likes', tweets: likes },
    { ...base, kind: 'posts', tweets: posts },
  ];
}

export async function readArchive(file: Blob) {
  return archiveToExports(await unzipDataFiles(file));
}
