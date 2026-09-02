import { describe, expect, it } from 'vitest';
import { mergeArticles, normalizeTitle, normalizeUrl } from '@/lib/merge';
import type { NewsArticle } from '@/lib/types';

function article(over: Partial<NewsArticle>): NewsArticle {
  return {
    id: 'x',
    title: '기본 제목',
    url: 'https://a.com/base',
    press: '테스트일보',
    portals: ['naver'],
    publishedAt: '2026-09-02T00:00:00.000Z',
    ...over,
  };
}

describe('normalizeUrl', () => {
  it('www·쿼리스트링·트레일링 슬래시를 제거한다', () => {
    expect(normalizeUrl('https://www.a.com/news/1/?ref=x&utm=y')).toBe('a.com/news/1');
    expect(normalizeUrl('http://a.com/news/1')).toBe('a.com/news/1');
  });
});

describe('normalizeTitle', () => {
  it('공백과 문장부호를 제거하고 소문자화한다', () => {
    expect(normalizeTitle('손흥민, "10호골"!')).toBe(normalizeTitle('손흥민 10호골'));
  });
});

describe('mergeArticles', () => {
  it('같은 URL이면 하나로 합치고 포털 배지를 병합한다', () => {
    const merged = mergeArticles([
      [article({ url: 'https://www.a.com/1?ref=n', portals: ['naver'] })],
      [article({ url: 'https://a.com/1', portals: ['google'], imageUrl: 'https://img/1.jpg' })],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].portals).toEqual(['naver', 'google']);
    expect(merged[0].imageUrl).toBe('https://img/1.jpg');
  });

  it('URL이 달라도 정규화된 제목이 같으면 합친다', () => {
    const merged = mergeArticles([
      [article({ url: 'https://a.com/1', title: '손흥민 10호골 폭발' })],
      [article({ url: 'https://b.com/2', title: '손흥민, 10호골 "폭발"', portals: ['daum'] })],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].portals).toEqual(['naver', 'daum']);
  });

  it('합칠 때 publishedAt은 더 이른 시각을 쓴다', () => {
    const merged = mergeArticles([
      [article({ url: 'https://a.com/1', publishedAt: '2026-09-02T05:00:00.000Z' })],
      [article({ url: 'https://a.com/1', portals: ['daum'], publishedAt: '2026-09-02T03:00:00.000Z' })],
    ]);
    expect(merged[0].publishedAt).toBe('2026-09-02T03:00:00.000Z');
  });

  it('최신순으로 정렬한다', () => {
    const merged = mergeArticles([[
      article({ url: 'https://a.com/old', publishedAt: '2026-09-01T00:00:00.000Z' }),
      article({ url: 'https://a.com/new', title: '다른 제목', publishedAt: '2026-09-02T00:00:00.000Z' }),
    ]]);
    expect(merged[0].url).toBe('https://a.com/new');
  });

  it('입력 배열을 변형하지 않는다', () => {
    const original = article({ portals: ['naver'] });
    mergeArticles([[original], [article({ portals: ['google'] })]]);
    expect(original.portals).toEqual(['naver']);
  });
});
