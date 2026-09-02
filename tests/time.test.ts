import { describe, expect, it } from 'vitest';
import { relativeTime } from '@/lib/time';

const NOW = new Date('2026-09-02T12:00:00.000Z').getTime();

describe('relativeTime', () => {
  it('1분 미만은 "방금 전"', () => {
    expect(relativeTime('2026-09-02T11:59:30.000Z', NOW)).toBe('방금 전');
  });

  it('분/시간/일 단위로 표시한다', () => {
    expect(relativeTime('2026-09-02T11:55:00.000Z', NOW)).toBe('5분 전');
    expect(relativeTime('2026-09-02T09:00:00.000Z', NOW)).toBe('3시간 전');
    expect(relativeTime('2026-08-31T12:00:00.000Z', NOW)).toBe('2일 전');
  });

  it('7일 이상은 날짜로 표시한다', () => {
    expect(relativeTime('2026-08-01T12:00:00.000Z', NOW)).toMatch(/2026/);
  });
});
