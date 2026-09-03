import * as cheerio from 'cheerio';
import { articleId } from '../merge';
import type { NewsArticle } from '../types';
import { parseKoreanTime } from './korean-time';
import { COLLECT_TIMEOUT_MS } from './config';

/** 다음이 쓰는 시각 표기는 네이버와 같아서 공통 파서에 위임한다. */
export function parseDaumTime(text: string, now: Date): string {
  return parseKoreanTime(text, now);
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

  $('ul.c-list-basic > li[data-docid]').each((_, el) => {
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

async function fetchDaumPage(query: string, page: number): Promise<NewsArticle[]> {
  const res = await fetch(
    `https://search.daum.net/search?w=news&q=${encodeURIComponent(query)}&sort=accuracy&cluster=n&p=${page}`,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(COLLECT_TIMEOUT_MS),
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`다음 검색 오류: ${res.status}`);
  const html = await res.text();
  const articles = parseDaumHtml(html);
  // 0건이 "검색 결과가 없다"인지 "마크업이 바뀌어 못 읽는다"인지 구분한다.
  // 목록 컨테이너 자체가 사라졌으면 후자이므로 실패로 올려 배너를 띄운다.
  if (articles.length === 0 && html.includes('c-list-basic')) {
    throw new Error('다음 검색 파싱 결과 0건 — 마크업 변경 가능성. fixture를 다시 캡처해 셀렉터를 갱신할 것.');
  }
  return articles;
}

// 네이버와 같은 이유로 상한을 두지 않고 10페이지(약 100건)까지 가져온다.
// 페이지당 10건씩 나오고, 9페이지 동시 요청도 막히지 않는 것을 확인했다.
const MAX_PAGES = 10;

export async function collectDaum(query: string): Promise<NewsArticle[]> {
  const pages = Array.from({ length: MAX_PAGES }, (_, i) => i + 1);
  const settled = await Promise.allSettled(pages.map((page) => fetchDaumPage(query, page)));

  // 첫 페이지가 실패하면 다음 자체가 막힌 것으로 보고 실패로 올린다.
  // 뒤쪽 페이지 하나가 빠지는 건 결과가 조금 줄 뿐이라 그대로 진행한다.
  const [first] = settled;
  if (first.status === 'rejected') throw first.reason;

  return settled.flatMap((page) => (page.status === 'fulfilled' ? page.value : []));
}
