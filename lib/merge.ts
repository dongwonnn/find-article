import type { NewsArticle } from './types';

// 유입 경로 추적용 파라미터. 이것만 떼고 나머지 쿼리는 남긴다.
// 국내 중소 언론사 CMS는 기사 번호를 쿼리에 담는 경우가 많아
// (예: articleView.html?idxno=711111) 쿼리를 통째로 버리면 서로 다른 기사가
// 같은 키가 되어 조용히 하나로 합쳐진다.
const TRACKING_PARAMS = /^(utm(_.*)?|ref|referrer|oc|fbclid|gclid|igshid|from|sid)$/i;

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname.replace(/\/$/, '');
    const params = [...u.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAMS.test(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    return `${host}${path}${params ? `?${params}` : ''}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

// \p{S}(기호)는 남긴다. ▲▼↑↓ 를 떼면 "코스피 ▲2.3%"와 "코스피 ▼2.3%"가
// 같은 제목이 되어 정반대 기사끼리 합쳐진다.
export function normalizeTitle(title: string): string {
  return title.replace(/[\s\p{P}]/gu, '').toLowerCase();
}

export function articleId(url: string): string {
  const key = normalizeUrl(url);
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash * 33) ^ key.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

// 네이버 검색결과는 긴 제목을 잘라서 준다("…이민성..."). 그래서 다른 포털이 준
// 전체 제목과 글자가 달라 같은 기사가 두 장의 카드로 남는다.
const TRUNCATED = /(…|\.{2,})\s*$/;

// 잘린 제목을 앞부분 일치로 이어붙일 때 쓰는 최소 길이(정규화 후 글자 수).
// 짧은 제목끼리 우연히 앞부분이 겹쳐 엉뚱하게 합쳐지는 것을 막는다.
const MIN_PREFIX = 20;

interface Entry {
  article: NewsArticle;
  titleKey: string;
  truncated: boolean;
  /** 포털이 매긴 순위(목록 내 인덱스). 여러 포털에 걸린 기사는 가장 앞선 순위를 쓴다. */
  rank: number;
}

// 잘린 제목 ↔ 전체 제목을 앞부분 일치로 이어준다. 어느 쪽이 잘렸든 잡히도록
// 양방향으로 본다. 목록이 60건 남짓이라 전체 훑어도 부담이 없다.
function findByPrefix(entries: Entry[], titleKey: string, truncated: boolean): Entry | undefined {
  if (!titleKey) return undefined;
  return entries.find((entry) => {
    if (truncated && titleKey.length >= MIN_PREFIX && entry.titleKey.startsWith(titleKey)) return true;
    if (entry.truncated && entry.titleKey.length >= MIN_PREFIX && titleKey.startsWith(entry.titleKey))
      return true;
    return false;
  });
}

export function mergeArticles(lists: NewsArticle[][]): NewsArticle[] {
  const byUrl = new Map<string, NewsArticle>();
  const byTitle = new Map<string, NewsArticle>();
  const entries: Entry[] = [];
  const entryOf = new Map<NewsArticle, Entry>();
  const result: NewsArticle[] = [];

  for (const list of lists) {
    list.forEach((incoming, rank) => {
      const urlKey = normalizeUrl(incoming.url);
      const titleKey = normalizeTitle(incoming.title);
      const truncated = TRUNCATED.test(incoming.title);
      // An empty normalized key (e.g. a title that is only punctuation, or
      // a URL that normalizes to '') must never act as a match key: two
      // unrelated articles that both happen to normalize to '' should not
      // be treated as the same article.
      const exact =
        (urlKey ? byUrl.get(urlKey) : undefined) ?? (titleKey ? byTitle.get(titleKey) : undefined);
      const matched = exact
        ? entryOf.get(exact)
        : findByPrefix(entries, titleKey, truncated);
      const existing = matched?.article;

      if (existing && matched) {
        for (const portal of incoming.portals) {
          if (!existing.portals.includes(portal)) existing.portals.push(portal);
        }
        if (!existing.imageUrl && incoming.imageUrl) existing.imageUrl = incoming.imageUrl;
        if (!existing.summary && incoming.summary) existing.summary = incoming.summary;
        if (incoming.publishedAt < existing.publishedAt) existing.publishedAt = incoming.publishedAt;
        // 잘리지 않은 제목이 들어오면 그걸로 갈아끼운다. 화면에 "…" 로 끝나는
        // 반쪽 제목 대신 온전한 제목이 보이도록.
        if (matched.truncated && !truncated) {
          existing.title = incoming.title;
          matched.truncated = false;
          matched.titleKey = titleKey;
        }
        // Keep the title-key index consistent so a later article matching
        // the incoming article's own title (which may differ from the
        // existing entry's title) still resolves to the same merged entry.
        if (urlKey) byUrl.set(urlKey, existing);
        if (titleKey) byTitle.set(titleKey, existing);
        // 여러 포털이 함께 집은 기사는 그만큼 관련도가 높다고 보고
        // 가장 앞선 순위를 취한다.
        if (rank < matched.rank) matched.rank = rank;
      } else {
        const copy: NewsArticle = { ...incoming, portals: [...incoming.portals] };
        const entry: Entry = { article: copy, titleKey, truncated, rank };
        if (urlKey) byUrl.set(urlKey, copy);
        if (titleKey) byTitle.set(titleKey, copy);
        entries.push(entry);
        entryOf.set(copy, entry);
        result.push(copy);
      }
    });
  }

  // 포털이 매긴 관련도 순서를 유지한다. 날짜순으로 다시 정렬하면 관련 없는
  // 최근 기사가 위로 올라와, 관련도순으로 수집한 의미가 사라진다.
  // 순위가 같으면 최신 기사를 앞에 둔다.
  const rankOf = (article: NewsArticle) => entryOf.get(article)?.rank ?? Number.MAX_SAFE_INTEGER;
  return result.sort(
    (a, b) => rankOf(a) - rankOf(b) || b.publishedAt.localeCompare(a.publishedAt),
  );
}
