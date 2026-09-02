import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createToken, verifyToken } from '@/lib/auth';

const SECRET = 'test-secret';

describe('auth token', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('발급한 토큰은 검증을 통과한다', async () => {
    const token = await createToken(SECRET, 60_000);
    expect(await verifyToken(SECRET, token)).toBe(true);
  });

  it('다른 시크릿으로 서명한 토큰은 거부한다', async () => {
    const token = await createToken('다른시크릿', 60_000);
    expect(await verifyToken(SECRET, token)).toBe(false);
  });

  it('만료된 토큰은 거부한다', async () => {
    const token = await createToken(SECRET, 1000);
    vi.advanceTimersByTime(1001);
    expect(await verifyToken(SECRET, token)).toBe(false);
  });

  it('형식이 깨진 토큰과 undefined는 거부한다', async () => {
    expect(await verifyToken(SECRET, 'abc')).toBe(false);
    expect(await verifyToken(SECRET, '123.')).toBe(false);
    expect(await verifyToken(SECRET, undefined)).toBe(false);
  });

  it('만료 시각을 조작한 토큰은 거부한다', async () => {
    const token = await createToken(SECRET, 1000);
    const [, sig] = token.split('.');
    expect(await verifyToken(SECRET, `9999999999999.${sig}`)).toBe(false);
  });
});
