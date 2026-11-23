import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readArchive } from '../src/archive';
import { decodeSummary, encodeSummary } from '../src/link';
import { actionTimes, pickPersona, summarize, topicShares, type ExportFile, type Tweet } from '../src/stats';

const tweet = (id: string, created: string, author = 'alice', text = '', extra: Partial<Tweet> = {}): Tweet => ({
  id,
  created_at: created,
  author: { screen_name: author, name: author.toUpperCase() },
  text,
  lang: 'en',
  metrics: { likes: 5000, views: 10000 },
  media: [],
  ...extra,
});

const file = (kind: ExportFile['kind'], tweets: Tweet[]): ExportFile => ({
  kind,
  exported_at: '2026-11-22T00:00:00.000Z',
  account: 'me',
  tweets,
});

describe('actionTimes', () => {
  it('dates each action no earlier than any post below it in the list', () => {
    const times = actionTimes([
      tweet('3', '2014-01-01T00:00:00Z'), // an old post liked recently
      tweet('2', '2026-06-01T00:00:00Z'),
      tweet('1', '2026-01-01T00:00:00Z'),
    ]);
    expect(times.map((t) => new Date(t).toISOString().slice(0, 10))).toEqual(['2026-06-01', '2026-06-01', '2026-01-01']);
  });
});

describe('summarize', () => {
  const likes = file('likes', [
    tweet('5', '2026-10-01T17:30:00Z', 'bob', 'New AI agent model', { media: [{ type: 'video' }] }),
    tweet('4', '2026-09-01T17:10:00Z', 'bob', 'Rust code for the api'),
    tweet('3', '2026-03-01T09:00:00Z', 'alice', 'Figma design tips', { metrics: { likes: 12, views: 50 } }),
    tweet('2', '2024-05-01T09:00:00Z', 'old', 'Too old to count'),
    { id: '9', unavailable: true },
  ]);
  const saves = file('bookmarks', [tweet('5', '2026-10-01T17:30:00Z', 'bob', 'New AI agent model'), tweet('7', '2026-02-01T08:00:00Z', 'carol')]);
  const s = summarize([likes, saves], 'UTC');

  it('keeps only the last 12 months and skips unavailable posts', () => {
    expect([s.likes, s.bookmarks, s.both, s.accounts]).toEqual([3, 2, 1, 3]);
    expect(s.from).toBe('2025-11-22');
    expect(s.months).toHaveLength(13);
    expect(s.months.reduce((n, m) => n + m.l, 0)).toBe(3);
  });

  it('ranks accounts by likes plus saves', () => {
    expect(s.top[0]).toEqual({ h: 'bob', n: 'BOB', a: null, likes: 2, saves: 1, replies: 0 });
  });

  it('builds a full day-by-hour clock and finds the peak hour', () => {
    expect(s.clock).toMatch(/^[0-9]{168}$/);
    expect(s.peakHour).toBe(17);
  });

  it('reports vault and taste numbers', () => {
    expect(s.vault).toEqual({ onlySaved: 50, video: 0, gems: 0, oldest: { h: 'carol', y: 2026 } });
    expect(s.taste?.niche).toBe(20);
    expect(s.media.video).toBe(20);
  });
});

describe('topics and persona', () => {
  it('tags a post with every matching topic', () => {
    const { top } = topicShares([tweet('1', '2026-01-01T00:00:00Z', 'a', 'Claude writes TypeScript code')]);
    expect(top.map((t) => t.k)).toEqual(['AI', 'Code']);
  });

  it('picks the strongest signal, or Wanderer when none is clear', () => {
    const base = { saveRatio: 0.1, builderShare: 0.1, mediaShare: 0.1, niche: 0.1, postRatio: 0.05 };
    expect(pickPersona({ ...base, saveRatio: 0.65, builderShare: 0.3 })).toBe('curator');
    expect(pickPersona({ ...base, builderShare: 0.6 })).toBe('builder');
    expect(pickPersona({ ...base, postRatio: 0.8 })).toBe('broadcaster');
    expect(pickPersona(base)).toBe('wanderer');
  });
});

describe('share link', () => {
  it('round-trips the summary through the URL token', async () => {
    const s = summarize([file('likes', [tweet('1', '2026-11-01T00:00:00Z', 'a', '<script>x</script>')])], 'UTC');
    const token = await encodeSummary(s);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeSummary(token)).toEqual(s);
  });

  it('rejects a crafted link that smuggles markup into a number field', async () => {
    const s = summarize([file('likes', [tweet('1', '2026-11-01T00:00:00Z')])], 'UTC');
    const evil = await encodeSummary({ ...s, media: { ...s.media, video: '"><img src=x onerror=alert(1)>' as never } });
    await expect(decodeSummary(evil)).rejects.toThrow('Bad number');
  });
});

describe('posts and avatars', () => {
  const me = { id: '1', screen_name: 'me', name: 'Me', avatar: 'https://pbs.twimg.com/profile_images/1/me_normal.jpg' };
  const bobAvatar = 'https://pbs.twimg.com/profile_images/2/bob_normal.png';
  const posts = file(
    'posts',
    Array.from({ length: 24 }, (_, i) =>
      tweet(`p${i}`, `2026-10-${String(1 + i).padStart(2, '0')}T23:15:00Z`, 'me', i === 0 ? 'my big AI post' : 'hello', {
        author: me,
        metrics: { likes: i === 0 ? 900 : 3, views: 5000 },
        reply_to: i < 4 ? { screen_name: 'bob' } : null,
      }),
    ).concat([
      // The Replies tab also returns the post being replied to.
      tweet('parent', '2026-10-01T10:00:00Z', 'bob', 'parent post', { author: { screen_name: 'bob', name: 'Bob', avatar: bobAvatar } }),
      tweet('rt', '2026-10-02T10:00:00Z', 'me', 'RT', { author: me, retweet_of: { id: '9' } }),
    ]),
  );
  const s = summarize([posts], 'UTC');

  it('counts only your own posts and keeps reposts apart', () => {
    expect(s.posts).toEqual({ count: 24, replies: 4, retweets: 1, best: { text: 'my big AI post', likes: 900, views: 5000 } });
  });

  it('uses your own posting times for the clock when there are enough posts', () => {
    expect(s.clockOf).toBe('you');
    expect(s.peakHour).toBe(23);
  });

  it('ranks reply partners and attaches large profile pictures', () => {
    expect(s.top[0]).toMatchObject({ h: 'bob', replies: 4, a: 'https://pbs.twimg.com/profile_images/2/bob_400x400.png' });
    expect(s.avatar).toBe('https://pbs.twimg.com/profile_images/1/me_400x400.jpg');
  });

  it('drops avatar urls that are not on X image hosting', async () => {
    const token = await encodeSummary({ ...s, avatar: 'https://evil.example/a.png' });
    expect((await decodeSummary(token)).avatar).toBeNull();
  });
});

describe('X data archive', () => {
  const ytd = (name: string, data: unknown) => strToU8(`window.YTD.${name}.part0 = ${JSON.stringify(data)}`);
  const recent = (BigInt(Date.parse('2026-10-01T12:00:00Z') - 1288834974657) << 22n).toString();
  const zip = zipSync({
    'data/manifest.js': strToU8(`window.__THAR_CONFIG = ${JSON.stringify({ archiveInfo: { generationDate: '2026-11-20T00:00:00.000Z' } })}`),
    'data/account.js': ytd('account', [{ account: { username: 'me', accountId: '1', accountDisplayName: 'Me' } }]),
    'data/profile.js': ytd('profile', [{ profile: { avatarMediaUrl: 'https://pbs.twimg.com/profile_images/1/me.jpg' } }]),
    'data/like.js': ytd('like', [{ like: { tweetId: recent, fullText: 'Claude agents' } }]),
    'data/tweets.js': ytd('tweets', [
      { tweet: { id_str: recent, full_text: '@bob agreed', in_reply_to_screen_name: 'bob', favorite_count: '7', lang: 'en' } },
    ]),
    'data/tweets_media/huge.mp4': new Uint8Array(1024),
  });

  it('reads likes, posts, account and avatar from the zip', async () => {
    const files = await readArchive(new Blob([zip as BlobPart]));
    expect(files.map((f) => [f.kind, f.account, f.tweets.length])).toEqual([['likes', 'me', 1], ['posts', 'me', 1]]);
    expect(files[0].tweets[0].created_at).toBe('2026-10-01T12:00:00.000Z');
    const s = summarize(files, 'UTC');
    expect([s.likes, s.posts?.count, s.posts?.replies, s.top[0].h, s.taste]).toEqual([1, 1, 1, 'bob', null]);
    expect(s.avatar).toBe('https://pbs.twimg.com/profile_images/1/me.jpg');
  });
});
