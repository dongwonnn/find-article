import { describe, expect, it } from 'vitest';
import { articleId, mergeArticles, normalizeTitle, normalizeUrl } from '@/lib/merge';
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
  it('www·추적 파라미터·트레일링 슬래시를 제거한다', () => {
    expect(normalizeUrl('https://www.a.com/news/1/?ref=x&utm=y')).toBe('a.com/news/1');
    expect(normalizeUrl('http://a.com/news/1')).toBe('a.com/news/1');
  });

  it('기사 번호가 담긴 쿼리는 남긴다', () => {
    expect(normalizeUrl('https://interfootball.co.kr/news/articleView.html?idxno=711111')).not.toBe(
      normalizeUrl('https://interfootball.co.kr/news/articleView.html?idxno=722222'),
    );
  });

  it('쿼리 순서가 달라도 같은 키가 된다', () => {
    expect(normalizeUrl('https://a.com/v?b=2&a=1')).toBe(normalizeUrl('https://a.com/v?a=1&b=2'));
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

  it('제목으로 합쳐진 기사의 URL도 색인되어, 이후 그 URL로 오는 기사가 같은 항목으로 합쳐진다', () => {
    // A: url1/titleX, B: url2/titleX (title merges into A), C: url2/titleY
    // (should merge into A via url2 — only possible if B's merge registered
    // url2 in byUrl, since url2 was never indexed before that).
    const a = article({ url: 'https://a.com/1', title: '가나다 뉴스', portals: ['naver'] });
    const b = article({ url: 'https://b.com/2', title: '가나다 뉴스', portals: ['daum'] });
    const c = article({ url: 'https://b.com/2', title: '마바사 속보', portals: ['google'] });
    const merged = mergeArticles([[a], [b], [c]]);
    expect(merged).toHaveLength(1);
    expect(merged[0].portals).toEqual(['naver', 'daum', 'google']);
  });

  it('URL로 합쳐진 기사의 제목도 색인되어, 이후 그 제목으로 오는 기사가 같은 항목으로 합쳐진다', () => {
    // A: url1/titleX, B: url1/titleY (url merges into A), C: url3/titleY
    // (should merge into A via titleY — only possible if B's merge
    // registered titleY in byTitle, since titleY was never indexed before that).
    const a = article({ url: 'https://a.com/1', title: '가나다 뉴스', portals: ['naver'] });
    const b = article({ url: 'https://a.com/1', title: '마바사 속보', portals: ['daum'] });
    const c = article({ url: 'https://c.com/3', title: '마바사 속보', portals: ['google'] });
    const merged = mergeArticles([[a], [b], [c]]);
    expect(merged).toHaveLength(1);
    expect(merged[0].portals).toEqual(['naver', 'daum', 'google']);
  });

  it('정규화된 제목이 둘 다 빈 문자열이어도 URL이 다르면 별개 기사로 남는다', () => {
    const a = article({ url: 'https://a.com/1', title: '!!!' });
    const b = article({ url: 'https://b.com/2', title: '???' });
    expect(normalizeTitle(a.title)).toBe('');
    expect(normalizeTitle(b.title)).toBe('');
    const merged = mergeArticles([[a], [b]]);
    expect(merged).toHaveLength(2);
  });
});

describe('articleId', () => {
  it('같은 입력이면 같은 값을 반환한다', () => {
    expect(articleId('https://a.com/1')).toBe(articleId('https://a.com/1'));
  });

  it('normalizeUrl이 제거하는 요소(www, 쿼리스트링, 트레일링 슬래시)에 영향받지 않는다', () => {
    expect(articleId('https://www.a.com/1/?ref=x')).toBe(articleId('http://a.com/1'));
  });

  it('URL이 다르면 다른 값을 반환한다', () => {
    expect(articleId('https://a.com/1')).not.toBe(articleId('https://a.com/2'));
  });

  it('16진수 문자열(1~8자)을 반환한다', () => {
    expect(articleId('https://a.com/1')).toMatch(/^[0-9a-f]{1,8}$/);
    expect(articleId('https://very-long-domain-name.example.com/some/long/path/1')).toMatch(/^[0-9a-f]{1,8}$/);
  });
});
