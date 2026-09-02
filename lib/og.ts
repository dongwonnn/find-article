import * as cheerio from 'cheerio';

export function extractOgImage(html: string): string | null {
  const $ = cheerio.load(html);
  const content =
    $('meta[property="og:image"]').attr('content') ??
    $('meta[name="twitter:image"]').attr('content');
  const trimmed = content?.trim();
  return trimmed ? trimmed : null;
}

const BLOCKED_HOST = /^(localhost$|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|\[)/i;

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
