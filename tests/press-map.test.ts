import { describe, expect, it } from 'vitest';
import { pressFromUrl } from '@/lib/press-map';

describe('pressFromUrl', () => {
  it('등록된 도메인은 언론사명을 돌려준다', () => {
    expect(pressFromUrl('https://www.yna.co.kr/view/AKR123')).toBe('연합뉴스');
  });

  it('서브도메인도 매칭한다', () => {
    expect(pressFromUrl('https://sports.donga.com/article/1')).toBe('동아일보');
  });

  it('미등록 도메인은 도메인 문자열을 돌려준다', () => {
    expect(pressFromUrl('https://www.example-news.co.kr/a/1')).toBe('example-news.co.kr');
  });

  it('URL이 아니면 "알 수 없음"을 돌려준다', () => {
    expect(pressFromUrl('not-a-url')).toBe('알 수 없음');
  });
});
