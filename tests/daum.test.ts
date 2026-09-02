import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDaumHtml, parseDaumTime } from '@/lib/collectors/daum';

const fixture = readFileSync('tests/fixtures/daum.html', 'utf8');
const NOW = new Date('2026-09-02T12:00:00.000Z');

describe('parseDaumTime', () => {
  it('상대 시간을 ISO로 변환한다', () => {
    expect(parseDaumTime('5분전', NOW)).toBe('2026-09-02T11:55:00.000Z');
    expect(parseDaumTime('3시간전', NOW)).toBe('2026-09-02T09:00:00.000Z');
    expect(parseDaumTime('어제', NOW)).toBe('2026-09-01T12:00:00.000Z');
  });

  it('날짜 표기(KST)를 ISO로 변환한다', () => {
    expect(parseDaumTime('2026.9.1.', NOW)).toBe('2026-08-31T15:00:00.000Z');
  });

  it('해석 불가 문자열은 now를 돌려준다', () => {
    expect(parseDaumTime('???', NOW)).toBe(NOW.toISOString());
  });
});

describe('parseDaumHtml', () => {
  it('기사를 1건 이상 추출한다', () => {
    const articles = parseDaumHtml(fixture, NOW);
    expect(articles.length).toBeGreaterThan(0);
  });

  it('모든 기사에 필수 필드가 채워진다', () => {
    for (const a of parseDaumHtml(fixture, NOW)) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.url).toMatch(/^https?:\/\//);
      expect(a.press.length).toBeGreaterThan(0);
      expect(a.portals).toEqual(['daum']);
      expect(new Date(a.publishedAt).getTime()).not.toBeNaN();
    }
  });

  it('썸네일이 있는 기사가 존재한다', () => {
    const withImage = parseDaumHtml(fixture, NOW).filter((a) => a.imageUrl);
    expect(withImage.length).toBeGreaterThan(0);
  });

  // 시각·언론사 셀렉터가 깨지면 각각 now와 '다음 뉴스'로 조용히 떨어져
  // 위의 필수 필드 검사를 그대로 통과한다. 그 폴백값이 실제로 안 나오는지 직접 본다.
  it('시각 셀렉터가 살아있다 (now로 떨어진 기사가 없다)', () => {
    const stampedNow = parseDaumHtml(fixture, NOW).filter(
      (a) => a.publishedAt === NOW.toISOString(),
    );
    expect(stampedNow).toHaveLength(0);
  });

  it('언론사 셀렉터가 살아있다 (폴백값이 쓰인 기사가 없다)', () => {
    const fallback = parseDaumHtml(fixture, NOW).filter((a) => a.press === '다음 뉴스');
    expect(fallback).toHaveLength(0);
  });
});
