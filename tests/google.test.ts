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

  it('pubDate가 없으면 epoch로 떨어져 최신순 정렬에서 뒤로 밀린다', () => {
    const noDate = fixture.replace(/<pubDate>[^<]*<\/pubDate>/g, '');
    const articles = parseGoogleRss(noDate);
    expect(articles).toHaveLength(2);
    expect(articles[0].publishedAt).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('언론사명 정규화', () => {
  it('source가 도메인이면 한글 언론사명으로 바꾼다', () => {
    const xml = fixture.replace(
      '<source url="https://www.yna.co.kr">연합뉴스</source>',
      '<source url="https://www.mk.co.kr">mk.co.kr</source>',
    );
    expect(parseGoogleRss(xml)[0].press).toBe('매일경제');
  });

  it('source가 이미 언론사명이면 그대로 쓴다', () => {
    expect(parseGoogleRss(fixture)[0].press).toBe('연합뉴스');
  });
});
