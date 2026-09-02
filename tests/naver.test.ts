import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNaverResponse } from '@/lib/collectors/naver';

const fixture = JSON.parse(readFileSync('tests/fixtures/naver.json', 'utf8'));

describe('parseNaverResponse', () => {
  it('기사 목록을 NewsArticle로 변환한다', () => {
    const articles = parseNaverResponse(fixture);
    expect(articles).toHaveLength(2);
    const first = articles[0];
    expect(first.title).toBe('손흥민, 시즌 10호골 폭발');           // <b> 제거
    expect(first.summary).toContain('"대단하다"');                  // 엔티티 디코드
    expect(first.url).toBe('https://www.yna.co.kr/view/AKR20260902000001007');
    expect(first.press).toBe('연합뉴스');
    expect(first.portals).toEqual(['naver']);
    expect(first.publishedAt).toBe('2026-09-02T00:30:00.000Z');
  });

  it('originallink가 없으면 link(네이버 뉴스)를 쓴다', () => {
    const articles = parseNaverResponse(fixture);
    expect(articles[1].url).toBe('https://n.news.naver.com/mnews/article/001/0022222222');
  });

  it('items가 없으면 빈 배열을 돌려준다', () => {
    expect(parseNaverResponse({})).toEqual([]);
  });
});
