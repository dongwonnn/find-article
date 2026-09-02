import * as cheerio from 'cheerio';
import { articleId } from '../merge';
import type { NewsArticle } from '../types';

export function parseDaumTime(text: string, now: Date): string {
  const t = text.trim();
  let m = t.match(/^(\d+)분\s*전$/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 60_000).toISOString();
  m = t.match(/^(\d+)시간\s*전$/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 3_600_000).toISOString();
  m = t.match(/^(\d+)일\s*전$/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 86_400_000).toISOString();
  if (t === '어제') return new Date(now.getTime() - 86_400_000).toISOString();
  if (t === '방금전' || t === '방금 전') return now.toISOString();
  // 다음이 표시하는 절대 날짜는 KST 기준이다.
  m = t.match(/^(\d{4})\.\s?(\d{1,2})\.\s?(\d{1,2})\.?$/);
  if (m) {
    const [, y, mo, d] = m;
    return new Date(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00+09:00`).toISOString();
  }
  return now.toISOString();
}

function absoluteImageUrl(src: string | undefined): string | undefined {
  if (!src) return undefined;
  if (src.startsWith('http')) return src;
  if (src.startsWith('//')) return `https:${src}`;
  return undefined;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// 셀렉터는 tests/fixtures/daum.html의 실제 구조에 맞춰 확정했다.
// 기사 한 건 = ul.c-list-basic > li[data-docid]:
//   언론사   .c-tit-doc .txt_info   (기사 본문 밖의 채널 헤더에 있다)
//   제목/링크 .item-title a
//   요약     p.conts-desc
//   시간     .gem-subinfo .txt_info:first  (두 번째 .txt_info는 댓글 수라 반드시 first)
//   썸네일   .item-thumb img[data-original-src]  (src는 base64 placeholder, lazy-load)
export function parseDaumHtml(html: string, now: Date = new Date()): NewsArticle[] {
  const $ = cheerio.load(html);
  const articles: NewsArticle[] = [];

  $('li[data-docid]').each((_, el) => {
    const item = $(el);
    const titleLink = item.find('.item-title a').first();
    const title = collapse(titleLink.text());
    const url = titleLink.attr('href') ?? '';
    if (!title || !url.startsWith('http')) return;

    // .txt_info는 언론사와 시간 양쪽에 쓰이므로 각각 조상으로 범위를 좁힌다.
    const press = collapse(item.find('.c-tit-doc .txt_info').first().text());
    const timeText = collapse(item.find('.gem-subinfo .txt_info').first().text());
    const summary = collapse(item.find('p.conts-desc').first().text()) || undefined;
    // 기사 썸네일은 .item-thumb 안에만 있다. 범위를 좁히지 않으면 언론사 로고를 집는다.
    const thumb = item.find('.item-thumb img').first();
    const imageUrl = absoluteImageUrl(thumb.attr('data-original-src') ?? thumb.attr('src'));

    articles.push({
      id: articleId(url),
      title,
      summary,
      url,
      press: press || '다음 뉴스',
      portals: ['daum'],
      publishedAt: parseDaumTime(timeText, now),
      imageUrl,
    });
  });

  return articles;
}

export async function collectDaum(query: string): Promise<NewsArticle[]> {
  const res = await fetch(
    `https://search.daum.net/search?w=news&q=${encodeURIComponent(query)}&sort=recency&cluster=n`,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`다음 검색 오류: ${res.status}`);
  const articles = parseDaumHtml(await res.text());
  if (articles.length === 0) {
    throw new Error('다음 검색 파싱 결과 0건 — 마크업 변경 가능성. fixture를 다시 캡처해 셀렉터를 갱신할 것.');
  }
  return articles.slice(0, 20);
}
