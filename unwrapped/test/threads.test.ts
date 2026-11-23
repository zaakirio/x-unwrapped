import { describe, expect, it } from 'vitest';
import { decodeSummary, encodeSummary } from '../src/link';
import { summarize, type ExportFile } from '../src/stats';
import captureSource from '../extension/threads-capture.js?raw';

// The capture script is a plain browser script that exports its parsers when there is no window.
const mod = { exports: {} as any };
new Function('module', captureSource)(mod);
const { extractPosts, parseBodies } = mod.exports;

// Field names as served by threads.com (BarcelonaProfileThreadsTabDirectQuery, checked on a public profile).
const user = (username: string) => ({
  pk: `${username}-pk`,
  username,
  full_name: username.toUpperCase(),
  profile_pic_url: `https://scontent-lhr11-1.cdninstagram.com/v/${username}.jpg?oe=1`,
});
const post = (pk: string, username: string, takenAt: string, extra: Record<string, unknown> = {}) => ({
  pk,
  code: `C${pk}`,
  taken_at: Date.parse(takenAt) / 1000,
  user: user(username),
  caption: { text: `post ${pk} about Claude agents` },
  like_count: 42,
  media_type: 19,
  detected_language: 'en',
  text_post_app_info: { direct_reply_count: 3, repost_count: 1, quote_count: 0, reply_to_author: null, share_info: { quoted_post: null, reposted_post: null } },
  ...extra,
});
const page = (threads: unknown[][], hasNext: boolean) => ({
  data: {
    mediaData: {
      edges: threads.map((items) => ({ node: { thread_items: items.map((p) => ({ post: p })) } })),
      page_info: { has_next_page: hasNext, end_cursor: hasNext ? 'abc' : null },
    },
  },
});

describe('Threads capture parsing', () => {
  const reply = post('2', 'me', '2026-10-02T09:00:00Z', {
    text_post_app_info: { direct_reply_count: 0, reply_to_author: { username: 'bob' }, share_info: {} },
  });
  const liked = page([[post('1', 'bob', '2026-10-01T08:00:00Z'), reply], [post('3', 'carol', '2026-09-01T08:00:00Z', { media_type: 2 })]], false);

  it('takes the last post of each thread in Liked and Saved, and every post on a profile', () => {
    expect(extractPosts(liked, true).posts.map((p: any) => p.id)).toEqual(['2', '3']);
    expect(extractPosts(liked, false).posts.map((p: any) => p.id)).toEqual(['1', '2', '3']);
  });

  it('normalises a post into the export shape', () => {
    const [, mine, video] = extractPosts(liked, false).posts;
    expect(mine).toMatchObject({
      url: 'https://www.threads.com/@me/post/C2',
      created_at: '2026-10-02T09:00:00.000Z',
      author: { screen_name: 'me', name: 'ME' },
      reply_to: { screen_name: 'bob' },
      metrics: { likes: 42, views: null },
    });
    expect(video.media).toEqual([{ type: 'video' }]);
  });

  it('spots the end of the list', () => {
    expect(extractPosts(liked, true).ended).toBe(true);
    expect(extractPosts(page([[post('4', 'bob', '2026-10-01T08:00:00Z')]], true), true).ended).toBe(false);
  });

  it('reads guarded and streamed response bodies', () => {
    expect(parseBodies('for (;;);{"a":1}')).toEqual([{ a: 1 }]);
    expect(parseBodies('{"a":1}\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

describe('Threads summary', () => {
  const file = (kind: ExportFile['kind'], tweets: unknown[]): ExportFile => ({
    platform: 'threads',
    kind,
    exported_at: '2026-11-22T00:00:00.000Z',
    account: 'me',
    tweets: tweets as ExportFile['tweets'],
  });
  const likes = extractPosts(page([[post('1', 'bob', '2026-10-01T08:00:00Z')], [post('3', 'carol', '2026-09-01T08:00:00Z')]], false), true).posts;
  const s = summarize([file('likes', likes), file('bookmarks', likes.slice(0, 1))], 'UTC');

  it('tags the summary as Threads and keeps profile pictures for local playback', () => {
    expect([s.p, s.likes, s.bookmarks, s.top[0].h]).toEqual(['threads', 2, 1, 'bob']);
    expect(s.top[0].a).toMatch(/^https:\/\/scontent/);
  });

  it('leaves the signed Threads picture URLs out of share links', async () => {
    const back = await decodeSummary(await encodeSummary(s));
    expect(back.p).toBe('threads');
    expect(back.top.map((a) => a.a)).toEqual([null, null]);
  });

  it('refuses to mix X and Threads files', () => {
    expect(() => summarize([file('likes', likes), { ...file('bookmarks', []), platform: 'x' }])).toThrow('not both');
  });
});
