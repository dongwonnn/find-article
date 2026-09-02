import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EPOCH_ISO, parseKoreanTime } from '@/lib/collectors/korean-time';
import { parseNaverHtml } from '@/lib/collectors/naver';

// 네이버 뉴스탭 내부 엔드포인트(s.search.naver.com/p/newssearch/3/api/tab/more)의
// 실제 응답을 손대지 않고 그대로 저장한 것이다. 기사 마크업은 collection[0].html에 있다.
const response = JSON.parse(readFileSync('tests/fixtures/naver-search.json', 'utf8'));
const fixture: string = response.collection[0].html;
const NOW = new Date('2026-09-02T12:00:00.000Z');

describe('parseKoreanTime (네이버 표기)', () => {
  it('상대 시간을 ISO로 변환한다', () => {
    expect(parseKoreanTime('5분 전', NOW)).toBe('2026-09-02T11:55:00.000Z');
    expect(parseKoreanTime('3시간 전', NOW)).toBe('2026-09-02T09:00:00.000Z');
    expect(parseKoreanTime('4일 전', NOW)).toBe('2026-08-29T12:00:00.000Z');
    expect(parseKoreanTime('2주 전', NOW)).toBe('2026-08-19T12:00:00.000Z');
  });

  it('오래된 기사의 절대 날짜(KST)를 ISO로 변환한다', () => {
    // 네이버는 자리수를 채워 '2026.08.02.'로 쓴다.
    expect(parseKoreanTime('2026.08.02.', NOW)).toBe('2026-08-01T15:00:00.000Z');
  });

  it('해석 불가 문자열은 epoch로 떨어뜨려 최신순 맨 뒤로 보낸다', () => {
    expect(parseKoreanTime('???', NOW)).toBe(EPOCH_ISO);
    // 시각 칸에 함께 들어오는 지면 정보를 시각으로 오인하지 않는다.
    expect(parseKoreanTime('A27면 1단', NOW)).toBe(EPOCH_ISO);
  });
});

describe('parseNaverHtml', () => {
  it('기사를 1건 이상 추출한다', () => {
    expect(parseNaverHtml(fixture, NOW).length).toBeGreaterThan(0);
  });

  it('모든 기사에 필수 필드가 채워진다', () => {
    for (const a of parseNaverHtml(fixture, NOW)) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.url).toMatch(/^https?:\/\//);
      expect(a.press.length).toBeGreaterThan(0);
      expect(a.portals).toEqual(['naver']);
      expect(new Date(a.publishedAt).getTime()).not.toBeNaN();
    }
  });

  it('썸네일이 있는 기사가 존재한다', () => {
    const withImage = parseNaverHtml(fixture, NOW).filter((a) => a.imageUrl);
    expect(withImage.length).toBeGreaterThan(0);
  });

  // 링크가 n.news.naver.com으로 가면 다음·구글이 주는 언론사 원문 URL과 절대
  // 겹치지 않아, mergeArticles가 같은 기사를 포털별로 따로 카드에 담게 된다.
  it('원문 URL이 네이버 뉴스가 아니라 언론사 도메인을 가리킨다', () => {
    const articles = parseNaverHtml(fixture, NOW);
    expect(articles.length).toBeGreaterThan(0);
    for (const a of articles) {
      expect(new URL(a.url).hostname).not.toMatch(/(^|\.)naver\.com$/);
    }
  });

  it('요약에서 검색어 강조(<mark>) 태그가 사라진다', () => {
    const withSummary = parseNaverHtml(fixture, NOW).filter((a) => a.summary);
    expect(withSummary.length).toBeGreaterThan(0);
    for (const a of withSummary) expect(a.summary).not.toContain('<');
  });

  it('빈 HTML은 빈 배열을 돌려준다', () => {
    expect(parseNaverHtml('', NOW)).toEqual([]);
  });

  // 시각·언론사 셀렉터가 깨지면 각각 epoch와 '네이버 뉴스'로 조용히 떨어져
  // 위의 필수 필드 검사를 그대로 통과한다. 그 폴백값이 실제로 안 나오는지 직접 본다.
  it('시각 셀렉터가 살아있다 (epoch로 떨어진 기사가 없다)', () => {
    const unparsed = parseNaverHtml(fixture, NOW).filter((a) => a.publishedAt === EPOCH_ISO);
    expect(unparsed).toHaveLength(0);
  });

  it('언론사 셀렉터가 살아있다 (폴백값이 쓰인 기사가 없다)', () => {
    const fallback = parseNaverHtml(fixture, NOW).filter((a) => a.press === '네이버 뉴스');
    expect(fallback).toHaveLength(0);
  });
});
