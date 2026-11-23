import { describe, expect, it } from 'vitest';
import { STRINGS, scriptLang } from '../src/i18n';
import { decodeSummary, encodeSummary } from '../src/link';
import { summarize, topicShares, type Tweet } from '../src/stats';

const post = (id: string, text: string, author = 'friend'): Tweet => ({
  id,
  created_at: '2026-10-01T12:00:00Z',
  author: { screen_name: author, name: author },
  text,
  metrics: { likes: 10, views: null },
});

describe('language detection', () => {
  it('reads the alphabet when the post has no language tag', () => {
    expect(scriptLang('Не понял, вы платите 50$?')).toBe('ru');
    expect(scriptLang('Finally, some peace on earth.')).toBe('en');
    expect(scriptLang('🎮 👾 123')).toBeNull();
  });

  it('tells the story in Russian when most posts are Russian', () => {
    const tweets = [post('1', 'Какие цветы тебе нравятся?'), post('2', 'Баба тут только ты!'), post('3', 'Nice one')];
    const s = summarize([{ platform: 'threads', kind: 'likes', exported_at: '2026-11-22T00:00:00Z', account: 'me', tweets }], 'UTC');
    expect([s.l, s.langs]).toEqual(['ru', 2]);
  });

  it('keeps the story language through a share link', async () => {
    const s = summarize([{ kind: 'likes', exported_at: '2026-11-22T00:00:00Z', account: 'me', tweets: [post('1', 'Привет, мир')] }], 'UTC');
    expect((await decodeSummary(await encodeSummary(s))).l).toBe('ru');
  });
});

describe('Russian topics', () => {
  it('matches word stems with any ending, and only whole words', () => {
    const tag = (text: string) => topicShares([post('1', text)]).top.map((t) => t.k);
    expect(tag('Мой парень опять забыл про свидание')).toEqual(['Love']);
    expect(tag('Купила новое платье и сходила на маникюр')).toEqual(['Beauty']);
    expect(tag('Нейросети пишут код лучше меня')).toEqual(['AI', 'Code']);
    // "кот" (cat) must not fire inside "который" (which).
    expect(tag('Пост, который я видела')).toEqual([]);
  });
});

describe('Russian copy', () => {
  it('uses the right noun form for each number', () => {
    const ru = STRINGS.ru;
    expect([1, 3, 5, 21, 1145].map((n) => ru.plural(n, 'like'))).toEqual(['1 лайк', '3 лайка', '5 лайков', '21 лайк', '1\u00a0145 лайков']);
    expect(ru.hour(9)).toBe('09:00');
  });
});
