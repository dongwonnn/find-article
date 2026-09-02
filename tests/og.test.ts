import { describe, expect, it } from 'vitest';
import { extractOgImage, isFetchableUrl, isOgWorthFetching } from '@/lib/og';

describe('extractOgImage', () => {
  it('og:image를 추출한다', () => {
    const html = '<html><head><meta property="og:image" content="https://img.example.com/a.jpg"/></head></html>';
    expect(extractOgImage(html)).toBe('https://img.example.com/a.jpg');
  });

  it('og:image가 없으면 twitter:image로 폴백한다', () => {
    const html = '<html><head><meta name="twitter:image" content="https://img.example.com/t.jpg"/></head></html>';
    expect(extractOgImage(html)).toBe('https://img.example.com/t.jpg');
  });

  it('둘 다 없으면 null을 돌려준다', () => {
    expect(extractOgImage('<html><head></head></html>')).toBeNull();
  });
});

describe('isFetchableUrl', () => {
  it('일반 http(s) URL은 허용한다', () => {
    expect(isFetchableUrl('https://www.yna.co.kr/view/1')).toBe(true);
  });

  it('내부망·localhost·비http는 차단한다', () => {
    expect(isFetchableUrl('http://localhost:3000/admin')).toBe(false);
    expect(isFetchableUrl('http://127.0.0.1/x')).toBe(false);
    expect(isFetchableUrl('http://192.168.0.1/x')).toBe(false);
    expect(isFetchableUrl('http://10.0.0.5/x')).toBe(false);
    expect(isFetchableUrl('ftp://a.com/x')).toBe(false);
    expect(isFetchableUrl('주소아님')).toBe(false);
  });

  it('클라우드 메타데이터 주소를 차단한다', () => {
    expect(isFetchableUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isFetchableUrl('http://169.254.1.1/x')).toBe(false);
  });

  it('사설 대역 밖의 172 주소는 허용한다', () => {
    expect(isFetchableUrl('http://172.32.0.1/x')).toBe(true);
  });
});

describe('isOgWorthFetching', () => {
  it('구글 뉴스 리다이렉트 링크는 건너뛴다', () => {
    expect(isOgWorthFetching('https://news.google.com/rss/articles/CBMiabc?oc=5')).toBe(false);
  });

  it('언론사 기사 링크는 긁는다', () => {
    expect(isOgWorthFetching('https://v.daum.net/v/20260902123456789')).toBe(true);
    expect(isOgWorthFetching('https://www.yna.co.kr/view/AKR1')).toBe(true);
  });
});
