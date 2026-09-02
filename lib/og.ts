import * as cheerio from 'cheerio';

export function extractOgImage(html: string): string | null {
  const $ = cheerio.load(html);
  const content =
    $('meta[property="og:image"]').attr('content') ??
    $('meta[name="twitter:image"]').attr('content');
  const trimmed = content?.trim();
  return trimmed ? trimmed : null;
}

// 169.254.는 클라우드 인스턴스 메타데이터 주소(169.254.169.254)를 포함한 링크로컬 대역이다.
const BLOCKED_HOST =
  /^(localhost$|127\.|0\.|10\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|\[)/i;

export function isFetchableUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (BLOCKED_HOST.test(u.hostname)) return false;
    if (!u.hostname.includes('.')) return false;
    return true;
  } catch {
    return false;
  }
}

// 구글 뉴스 링크는 리다이렉트 페이지라 og:image에 기사 사진이 아니라 구글 로고가 들어 있다.
// 그걸 대표 이미지로 걸면 기사와 무관한 그림이 붙으므로 아예 긁지 않는다.
export function isOgWorthFetching(raw: string): boolean {
  try {
    return new URL(raw).hostname !== 'news.google.com';
  } catch {
    return false;
  }
}
