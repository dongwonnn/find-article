import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from '@/lib/cache';

describe('TtlCache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('저장한 값을 TTL 안에서는 돌려준다', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('a', '값');
    expect(cache.get('a')).toBe('값');
  });

  it('TTL이 지나면 undefined를 돌려준다', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('a', '값');
    vi.advanceTimersByTime(1001);
    expect(cache.get('a')).toBeUndefined();
  });

  it('null도 유효한 값으로 캐시한다 (미스와 구분)', () => {
    const cache = new TtlCache<string | null>(1000);
    cache.set('a', null);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('없는키')).toBeUndefined();
  });

  it('maxSize 초과 시 가장 오래된 항목을 밀어낸다', () => {
    const cache = new TtlCache<number>(60_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });
});
