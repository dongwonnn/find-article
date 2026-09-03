import * as cheerio from 'cheerio';
import { articleId } from '../merge';
import type { NewsArticle } from '../types';
import { EPOCH_ISO, parseKoreanTime } from './korean-time';
import { COLLECT_TIMEOUT_MS } from './config';

// 네이버 뉴스 검색은 결과를 클라이언트에서 그린다. 검색 페이지 HTML을 받아봐야
// 기사가 하나도 없고, 그 페이지가 호출하는 아래 내부 엔드포인트가 기사 마크업
// 조각을 JSON으로 내려준다. 공식 API가 아니므로 네이버가 마크업을 바꾸면 깨진다.
// (공식 검색 API는 2026-07-31자로 NAVER API HUB 유료 계정으로 이관됐다.)
const ENDPOINT = 'https://s.search.naver.com/p/newssearch/3/api/tab/more';

// sort=1이 최신순, start는 1부터 10건씩. nso/ssc/sm/field/pd는 검색 페이지가
// 그대로 붙여 보내는 값이라 함께 보낸다.
function pageUrl(encodedQuery: string, start: number): string {
  return `${ENDPOINT}?query=${encodedQuery}&sort=1&start=${start}&ssc=tab.news.all&nso=so%3Add%2Cp%3Aall%2Ca%3Aall&sm=tab_smr&field=0&pd=-1`;
}

// 클래스 상당수가 빌드 해시(fender-ui_228e3bd1, ZdTBe0dB_G0DGXFC)라 셀렉터로 쓸 수 없다.
// 대신 클릭 로깅용 표식인 data-heatmap-target과 디자인 시스템의 sds-comps-* 의미
// 클래스만 쓴다. 둘 다 마크업 리빌드에 휘둘리지 않는다.
const TITLE_LINK = 'a[data-heatmap-target=".tit"]';
const SUMMARY_LINK = 'a[data-heatmap-target=".body"]';
const THUMB_LINK = 'a[data-heatmap-target=".img"]';
const TITLE_TEXT = '.sds-comps-text-type-headline1';
const SUMMARY_TEXT = '.sds-comps-text-type-body1';
const PRESS_TEXT = '.sds-comps-profile-info-title-text';
const SUBTEXT = '.sds-comps-profile-info-subtext';
const ITEM_LIST = '.fds-news-item-list-tab';

const PRESS_FALLBACK = '네이버 뉴스';

// 새 창으로 열리는 링크마다 스크린리더용 '새 창 열림' 문구가 숨겨져 있어
// text()로 읽으면 언론사명 뒤에 그대로 따라붙는다.
const SCREEN_READER_SUFFIX = /새\s*창\s*열림$/;

// cheerio가 노드 타입(domhandler의 Element)을 재노출하지 않아 메서드에서 끌어온다.
type Selection = ReturnType<cheerio.Cheerio<never>['parent']>;

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function absoluteImageUrl(src: string | undefined): string | undefined {
  if (!src) return undefined;
  if (src.startsWith('http')) return src;
  if (src.startsWith('//')) return `https:${src}`;
  return undefined;
}

/**
 * 기사 한 건을 감싸는 컨테이너의 클래스는 빌드 해시(NFVvjX8P3nMtRfPx)라 직접 집을 수
 * 없다. 그래서 제목 링크에서 위로 올라가며 언론사 블록까지 함께 담은 첫 조상을 기사
 * 단위로 삼는다. 제목 링크가 둘 이상 들어오는 높이는 이미 여러 기사를 삼킨 것이므로
 * 거기서 멈춘다 — 그러면 언론사·시각이 폴백값으로 떨어져 회귀 테스트가 잡아낸다.
 */
function articleScope(titleLink: Selection): Selection {
  let node = titleLink.parent();
  for (let depth = 0; depth < 8 && node.length > 0; depth++) {
    if (node.find(TITLE_LINK).length > 1) break;
    if (node.find(PRESS_TEXT).length > 0) return node;
    node = node.parent();
  }
  return titleLink.parent();
}

function pressName(item: Selection): string {
  const holder = item.find(PRESS_TEXT).first();
  // <span class="…title-text"><a><span>OSEN</span><span>새 창 열림</span></a></span>
  // 구조라 첫 span만 읽는다. 링크가 없는 언론사를 위해 접미사도 한 번 더 떼어낸다.
  const inner = holder.find('span').first();
  const text = collapse((inner.length > 0 ? inner : holder).text());
  return text.replace(SCREEN_READER_SUFFIX, '').trim();
}

/**
 * 시각 칸(.sds-comps-profile-info-subtext)에는 시각만 오지 않는다. 신문 지면에도
 * 실린 기사는 첫 칸이 지면 위치('18면 1단', 'A27면 1단')로 채워지고 실제 시각은
 * 그 다음 칸에 있으며, 마지막에 '네이버뉴스' 링크가 붙기도 한다. 칸 수와 순서가
 * 기사마다 달라서 인덱스로 집으면 안 되고, 실제로 해석되는 첫 항목을 시각으로 본다.
 *
 * 지면 기사가 실제로 어떻게 오는지 2026-09-03에 다시 확인했다 — 최신순 검색
 * 16개 질의 310건 중 지면 기사 32건이었고, 전부 지면 위치 바로 옆 칸에 상대
 * 시각('12분 전', '3일 전')이 있었다. 지면 위치만 있고 시각이 없는 기사는 없었다.
 * 그래서 여기서 옆 칸을 읽는 것으로 충분하다(tests/naver.test.ts의 '지면 기사' 참고).
 *
 * 하나도 해석되지 않으면 epoch로 떨어진다. now로 올려 두면 시각을 못 읽은 기사가
 * 최신순 맨 앞을 차지하고, 무엇보다 '셀렉터가 깨졌다'는 신호가 사라진다 —
 * 회귀 테스트가 바로 그 epoch를 보고 마크업 변경을 잡아낸다.
 */
function publishedAt(item: Selection, now: Date): string {
  const subtexts = item.find(SUBTEXT);
  for (let i = 0; i < subtexts.length; i++) {
    const iso = parseKoreanTime(collapse(subtexts.eq(i).text()), now);
    if (iso !== EPOCH_ISO) return iso;
  }
  return EPOCH_ISO;
}

export function parseNaverHtml(html: string, now: Date = new Date()): NewsArticle[] {
  const $ = cheerio.load(html);
  const articles: NewsArticle[] = [];

  $(TITLE_LINK).each((_, el) => {
    const titleLink = $(el);
    // 제목 링크의 href는 네이버 뉴스(n.news.naver.com)가 아니라 언론사 원문 주소다.
    // 다음·구글도 원문 도메인을 주기 때문에 이 덕분에 mergeArticles가 포털 간
    // 중복 기사를 한 장의 카드로 합칠 수 있다.
    const url = titleLink.attr('href') ?? '';
    const title = collapse(titleLink.find(TITLE_TEXT).first().text());
    if (!title || !url.startsWith('http')) return;

    const item = articleScope(titleLink);
    const summary =
      collapse(item.find(SUMMARY_LINK).find(SUMMARY_TEXT).first().text()) || undefined;
    // 썸네일은 .img 링크 안에만 있다. 범위를 좁히지 않으면 언론사 로고를 집는다.
    const imageUrl = absoluteImageUrl(item.find(THUMB_LINK).find('img').first().attr('src'));
    const press = pressName(item);

    articles.push({
      id: articleId(url),
      title,
      summary,
      url,
      press: press || PRESS_FALLBACK,
      portals: ['naver'],
      publishedAt: publishedAt(item, now),
      imageUrl,
    });
  });

  return articles;
}

// 0건이 '검색 결과가 없다'인지 '마크업이 바뀌어 못 읽는다'인지 구분한다.
// 결과가 없으면 네이버는 목록 컨테이너를 자식 없이 빈 채로 내려준다(응답 1KB 미만).
// 컨테이너에 자식이 남아 있거나 기사 링크 표식이 보이는데 0건이면 셀렉터가 깨진 것이다.
// 두 표식을 OR로 묶어 둘 중 하나만 살아남아도 조용히 넘어가지 않게 한다.
function looksLikeResults(html: string): boolean {
  if (html.includes('data-heatmap-target=".tit"')) return true;
  return cheerio.load(html)(ITEM_LIST).children().length > 0;
}

async function fetchPage(encodedQuery: string, start: number): Promise<NewsArticle[]> {
  const res = await fetch(pageUrl(encodedQuery, start), {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      // 지금은 없어도 응답이 같지만, 검색 페이지가 부르는 내부 엔드포인트인 만큼
      // 네이버가 언제든 출처를 따질 수 있어 실제 호출과 똑같이 맞춰 둔다.
      Referer: `https://search.naver.com/search.naver?where=news&query=${encodedQuery}&sort=1`,
    },
    signal: AbortSignal.timeout(COLLECT_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`네이버 검색 오류: ${res.status}`);
  const json = (await res.json()) as { collection?: { html?: string }[] };
  const html = json.collection?.[0]?.html ?? '';
  const articles = parseNaverHtml(html);
  if (articles.length === 0 && looksLikeResults(html)) {
    throw new Error('네이버 검색 파싱 결과 0건 — 마크업 변경 가능성. fixture를 다시 캡처해 셀렉터를 갱신할 것.');
  }
  return articles;
}

export async function collectNaver(query: string): Promise<NewsArticle[]> {
  const encodedQuery = encodeURIComponent(query);
  // 한 번에 10건씩만 내려와서 1·11 두 페이지를 동시에 부른다.
  const [first, second] = await Promise.allSettled([
    fetchPage(encodedQuery, 1),
    fetchPage(encodedQuery, 11),
  ]);
  if (first.status === 'rejected') throw first.reason;
  // 2페이지가 실패해도 1페이지 10건은 그대로 돌려준다.
  const rest = second.status === 'fulfilled' ? second.value : [];
  return [...first.value, ...rest].slice(0, 20);
}
