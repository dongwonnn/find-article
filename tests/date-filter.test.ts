import { describe, expect, it } from 'vitest';
import {
  ALL_DATES,
  filterArticlesByDate,
  toDateRange,
  toKstDate,
  type DateFilterValue,
} from '@/lib/date-filter';
import type { NewsArticle } from '@/lib/types';

// KST 2026-09-03 목요일 오전 9시.
const NOW = new Date('2026-09-03T00:00:00.000Z');

function article(publishedAt: string, id = publishedAt): NewsArticle {
  return {
    id,
    title: `기사 ${id}`,
    url: `https://example.com/${id}`,
    press: '테스트일보',
    portals: ['naver'],
    publishedAt,
  };
}

function custom(start: string, end: string): DateFilterValue {
  return { mode: 'custom', start, end };
}

describe('toKstDate', () => {
  it('UTC 자정 직전은 KST로 이미 다음 날이다', () => {
    // 이 한 줄이 UTC로 자른 구현과 KST로 자른 구현을 가른다.
    expect(toKstDate('2026-09-02T23:00:00.000Z')).toBe('2026-09-03');
  });

  it('KST 자정 직후·직전을 각각 맞는 날짜로 본다', () => {
    expect(toKstDate('2026-09-02T15:00:00.000Z')).toBe('2026-09-03'); // KST 09-03 00:00
    expect(toKstDate('2026-09-02T14:59:59.999Z')).toBe('2026-09-02'); // KST 09-02 23:59
  });

  it('해석할 수 없는 값은 빈 문자열', () => {
    expect(toKstDate('없는날짜')).toBe('');
  });
});

describe('toDateRange — 프리셋', () => {
  it("'오늘'은 KST 하루 전체다 (UTC로는 전날 15시부터)", () => {
    const { from, to } = toDateRange({ ...ALL_DATES, mode: 'today' }, NOW);
    expect(new Date(from).toISOString()).toBe('2026-09-02T15:00:00.000Z');
    expect(new Date(to).toISOString()).toBe('2026-09-03T15:00:00.000Z');
  });

  it("'3일'은 오늘을 포함한 3일, '1주'는 7일이다", () => {
    expect(new Date(toDateRange({ ...ALL_DATES, mode: 'days3' }, NOW).from).toISOString()).toBe(
      '2026-08-31T15:00:00.000Z',
    );
    expect(new Date(toDateRange({ ...ALL_DATES, mode: 'week' }, NOW).from).toISOString()).toBe(
      '2026-08-27T15:00:00.000Z',
    );
  });

  it("'전체'는 경계를 두지 않는다", () => {
    expect(toDateRange(ALL_DATES, NOW)).toEqual({ from: -Infinity, to: Infinity });
  });

  it('now가 KST 자정을 갓 넘겼어도 오늘은 그 새 날짜다', () => {
    const justAfterMidnightKst = new Date('2026-09-02T15:00:01.000Z');
    const { from } = toDateRange({ ...ALL_DATES, mode: 'today' }, justAfterMidnightKst);
    expect(new Date(from).toISOString()).toBe('2026-09-02T15:00:00.000Z');
  });
});

describe('toDateRange — 직접 입력', () => {
  it('시작일·종료일 모두 그날 전체를 포함한다', () => {
    const { from, to } = toDateRange(custom('2026-09-01', '2026-09-02'), NOW);
    expect(new Date(from).toISOString()).toBe('2026-08-31T15:00:00.000Z');
    expect(new Date(to).toISOString()).toBe('2026-09-02T15:00:00.000Z');
  });

  it('한쪽만 넣으면 반대쪽 경계는 열어 둔다', () => {
    expect(toDateRange(custom('2026-09-01', ''), NOW).to).toBe(Infinity);
    expect(toDateRange(custom('', '2026-09-01'), NOW).from).toBe(-Infinity);
  });

  it('시작일이 종료일보다 뒤면 두 값을 바꿔 읽는다', () => {
    expect(toDateRange(custom('2026-09-02', '2026-09-01'), NOW)).toEqual(
      toDateRange(custom('2026-09-01', '2026-09-02'), NOW),
    );
  });

  it('형식이 깨진 날짜는 그쪽 경계를 열어 둔다', () => {
    expect(toDateRange(custom('2026-09', ''), NOW).from).toBe(-Infinity);
  });
});

describe('filterArticlesByDate', () => {
  // KST 09-02 23:30 / 09-03 00:30 — UTC로 보면 둘 다 09-02이지만 KST로는 다른 날이다.
  const lateOn2nd = article('2026-09-02T14:30:00.000Z', 'late-2nd');
  const earlyOn3rd = article('2026-09-02T15:30:00.000Z', 'early-3rd');
  const noon3rd = article('2026-09-03T03:00:00.000Z', 'noon-3rd');
  const old = article('2026-08-20T03:00:00.000Z', 'old');
  const all = [noon3rd, earlyOn3rd, lateOn2nd, old];

  it("'오늘'은 KST 자정 기준으로 자른다 (UTC로 잘랐다면 9시간이 새어 나간다)", () => {
    const ids = filterArticlesByDate(all, { ...ALL_DATES, mode: 'today' }, NOW).map((a) => a.id);
    expect(ids).toEqual(['noon-3rd', 'early-3rd']);
    expect(ids).not.toContain('late-2nd');
  });

  it("'3일'은 어제·그저께까지 담는다", () => {
    const ids = filterArticlesByDate(all, { ...ALL_DATES, mode: 'days3' }, NOW).map((a) => a.id);
    expect(ids).toEqual(['noon-3rd', 'early-3rd', 'late-2nd']);
  });

  it("'전체'는 원본 배열을 그대로 돌려준다", () => {
    expect(filterArticlesByDate(all, ALL_DATES, NOW)).toBe(all);
  });

  it('직접 입력한 하루만 고르면 그날 KST 기사만 남는다', () => {
    const ids = filterArticlesByDate(all, custom('2026-09-02', '2026-09-02'), NOW).map((a) => a.id);
    expect(ids).toEqual(['late-2nd']);
  });

  it('최신순 원본 순서를 흐트러뜨리지 않는다', () => {
    const kept = filterArticlesByDate(all, { ...ALL_DATES, mode: 'week' }, NOW);
    expect(kept.map((a) => a.id)).toEqual(['noon-3rd', 'early-3rd', 'late-2nd']);
  });

  it('시각을 해석할 수 없는 기사는 기간 필터에서 빠진다', () => {
    const broken = article('언제인지 모름', 'broken');
    expect(filterArticlesByDate([broken], { ...ALL_DATES, mode: 'week' }, NOW)).toEqual([]);
  });
});
