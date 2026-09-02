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

// 구글은 클라우드 IP에서 오는 요청에 503을 자주 돌려준다. 매번은 아니라
// 한 번만 다시 시도한다. 그래도 안 되면 실패로 올려 배너를 띄운다.
export async function collectGoogle(query: string): Promise<NewsArticle[]> {
  try {
    return await fetchGoogle(query);
  } catch (error) {
    if (!isRetryable(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return fetchGoogle(query);
  }
}

function isRetryable(error: unknown): boolean {
  return error instanceof Error && /오류: 5\d\d/.test(error.message);
}

async function fetchGoogle(query: string): Promise<NewsArticle[]> {
  const res = await fetch(
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR%3Ako`,
    {
      headers: {
        // 자체 UA(find-article/1.0)로 부르면 클라우드 IP에서 503이 잦다.
        // 네이버·다음 수집기와 같은 브라우저 UA로 맞춘다.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
      },
      signal: AbortSignal.timeout(COLLECT_TIMEOUT_MS),
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`구글 뉴스 RSS 오류: ${res.status}`);
  return parseGoogleRss(await res.text()).slice(0, 20);
}
