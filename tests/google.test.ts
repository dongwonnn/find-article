import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGoogleRss } from '@/lib/collectors/google';

const fixture = readFileSync('tests/fixtures/google.xml', 'utf8');

describe('parseGoogleRss', () => {
  it('RSS 아이템을 NewsArticle로 변환한다', () => {
    const articles = parseGoogleRss(fixture);
    expect(articles).toHaveLength(2);
    const first = articles[0];
    expect(first.title).toBe('손흥민, 시즌 10호골 폭발');            // " - 연합뉴스" 접미 제거
    expect(first.press).toBe('연합뉴스');                            // source 태그에서 추출
    expect(first.url).toBe('https://news.google.com/rss/articles/CBMiTEST1?oc=5');
    expect(first.portals).toEqual(['google']);
    expect(first.publishedAt).toBe('2026-09-02T00:30:00.000Z');
  });

  it('item이 하나뿐이어도 배열로 처리한다', () => {
    const single = fixture.replace(/<item>[\s\S]*?<\/item>\s*(?=<item>)/, '');
    expect(parseGoogleRss(single)).toHaveLength(1);
  });

  it('item이 없으면 빈 배열을 돌려준다', () => {
    expect(parseGoogleRss('<rss><channel></channel></rss>')).toEqual([]);
  });
});
