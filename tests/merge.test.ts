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

  it('포털이 매긴 관련도 순서를 유지한다 (날짜가 더 최신이어도 뒤집지 않는다)', () => {
    const merged = mergeArticles([[
      article({ url: 'https://a.com/1st', publishedAt: '2026-09-01T00:00:00.000Z' }),
      article({ url: 'https://a.com/2nd', title: '다른 제목', publishedAt: '2026-09-02T00:00:00.000Z' }),
    ]]);
    expect(merged.map((a) => a.url)).toEqual(['https://a.com/1st', 'https://a.com/2nd']);
  });

  it('순위가 같으면 최신 기사를 앞에 둔다', () => {
    // 서로 다른 포털의 1순위 기사끼리는 rank가 같다.
    const merged = mergeArticles([
      [article({ url: 'https://a.com/old', publishedAt: '2026-09-01T00:00:00.000Z' })],
      [
        article({
          url: 'https://b.com/new',
          title: '다른 제목',
          portals: ['daum'],
          publishedAt: '2026-09-02T00:00:00.000Z',
        }),
      ],
    ]);
    expect(merged[0].url).toBe('https://b.com/new');
  });

  it('여러 포털에 걸린 기사는 가장 앞선 순위를 가져간다', () => {
    // 네이버에서 3위인 기사가 다음에서 1위면, 1위로 취급해 위로 올린다.
    const shared = { title: '공통 기사', url: 'https://a.com/shared' };
    const merged = mergeArticles([
      [
        article({ url: 'https://a.com/1', title: '가' }),
        article({ url: 'https://a.com/2', title: '나' }),
        article({ ...shared }),
      ],
      [article({ ...shared, portals: ['daum'] })],
    ]);
    const order = merged.map((a) => a.url);
    // 네이버에서 3순위였지만 다음 1순위를 물려받아, 네이버 2순위 기사보다 앞에 온다.
    expect(order.indexOf('https://a.com/shared')).toBeLessThan(order.indexOf('https://a.com/2'));
    expect(merged.find((a) => a.url === 'https://a.com/shared')?.portals).toEqual(['naver', 'daum']);
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

describe('잘린 제목 합치기', () => {
  it('네이버가 자른 제목과 다음의 전체 제목을 같은 기사로 본다', () => {
    const merged = mergeArticles([
      [
        article({
          url: 'https://osen.co.kr/article/G111',
          title: '‘월드컵 삼총사’ 이기혁-양현준-엄지성, 와일드카드 믿는다…이민성...',
          portals: ['naver'],
        }),
      ],
      [
        article({
          url: 'https://v.daum.net/v/2026',
          title: '‘월드컵 삼총사’ 이기혁-양현준-엄지성, 와일드카드 믿는다…이민성 감독 "리더 역할"',
          portals: ['daum'],
        }),
      ],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].portals).toEqual(['naver', 'daum']);
    // 화면에는 반쪽이 아니라 온전한 제목이 남아야 한다.
    expect(merged[0].title).not.toMatch(/\.\.\.$/);
    expect(merged[0].title).toContain('리더 역할');
  });

  it('앞부분이 짧게 겹치는 다른 기사는 합치지 않는다', () => {
    const merged = mergeArticles([
      [article({ url: 'https://a.com/1', title: '손흥민 골...', portals: ['naver'] })],
      [article({ url: 'https://b.com/2', title: '손흥민 골든부트 수상 소식과 인터뷰 전문', portals: ['daum'] })],
    ]);
    expect(merged).toHaveLength(2);
  });
});
