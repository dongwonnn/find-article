import { XMLParser } from 'fast-xml-parser';
import { articleId } from '../merge';
import { pressFromUrl } from '../press-map';
import { stripHtml } from '../text';
import type { NewsArticle } from '../types';
import { COLLECT_TIMEOUT_MS } from './config';

// 구글 RSS의 <source>는 언론사명일 때도 있고 도메인일 때도 있다
// (예: '연합뉴스' vs 'mk.co.kr'). 도메인이면 매핑표를 태워 한글명으로 바꾼다.
function pressName(source: string): string {
  const value = source.trim();
  if (!value) return '구글 뉴스';
  const looksLikeDomain = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);
  return looksLikeDomain ? pressFromUrl(`https://${value}`) : value;
}

interface GoogleRssItem {
  title?: unknown;
  link?: unknown;
  pubDate?: unknown;
  source?: { '#text'?: unknown } | unknown;
}

export function parseGoogleRss(xml: string): NewsArticle[] {
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);
  let items: GoogleRssItem[] = doc?.rss?.channel?.item ?? [];
  if (!Array.isArray(items)) items = [items];

  return items
    .map((item) => {
      const rawTitle = String(item.title ?? '');
      const source = item.source;
      const press =
        source && typeof source === 'object'
          ? String((source as { '#text'?: unknown })['#text'] ?? '')
          : String(source ?? '');
      // 구글 RSS 제목은 "기사제목 - 언론사" 형태
      const title =
        press && rawTitle.endsWith(` - ${press}`)
          ? rawTitle.slice(0, -(press.length + 3))
          : rawTitle;
      const url = String(item.link ?? '');
      return {
        id: articleId(url),
        title: stripHtml(title),
        url,
        press: pressName(press),
        portals: ['google' as const],
        publishedAt: new Date(item.pubDate ? String(item.pubDate) : 0).toISOString(),
      };
    })
    .filter((a) => a.url && a.title);
}

export async function collectGoogle(query: string): Promise<NewsArticle[]> {
  const res = await fetch(
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR%3Ako`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; find-article/1.0)' },
      signal: AbortSignal.timeout(COLLECT_TIMEOUT_MS),
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`구글 뉴스 RSS 오류: ${res.status}`);
  return parseGoogleRss(await res.text()).slice(0, 20);
}
