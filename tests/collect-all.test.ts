import { describe, expect, it } from 'vitest';
import { collectAll } from '@/lib/collectors';
import type { NewsArticle } from '@/lib/types';

const ok = (portal: 'naver' | 'daum' | 'google'): NewsArticle[] => [{
  id: portal,
  title: `${portal} 기사`,
  url: `https://example.com/${portal}`,
  press: '테스트',
  portals: [portal],
  publishedAt: '2026-09-02T00:00:00.000Z',
}];

describe('collectAll', () => {
  it('모든 수집기가 성공하면 세 목록을 돌려준다', async () => {
    const { lists, failedPortals } = await collectAll('손흥민', {
      naver: async () => ok('naver'),
      daum: async () => ok('daum'),
      google: async () => ok('google'),
    });
    expect(lists).toHaveLength(3);
    expect(failedPortals).toEqual([]);
  });

  it('일부 수집기가 실패해도 나머지는 돌려주고 실패 포털을 기록한다', async () => {
    const { lists, failedPortals } = await collectAll('손흥민', {
      naver: async () => ok('naver'),
      daum: async () => { throw new Error('차단됨'); },
      google: async () => ok('google'),
    });
    expect(lists).toHaveLength(2);
    expect(failedPortals).toEqual(['daum']);
  });
});
