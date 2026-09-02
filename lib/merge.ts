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

export function mergeArticles(lists: NewsArticle[][]): NewsArticle[] {
  const byUrl = new Map<string, NewsArticle>();
  const byTitle = new Map<string, NewsArticle>();
  const result: NewsArticle[] = [];

  for (const list of lists) {
    for (const incoming of list) {
      const urlKey = normalizeUrl(incoming.url);
      const titleKey = normalizeTitle(incoming.title);
      // An empty normalized key (e.g. a title that is only punctuation, or
      // a URL that normalizes to '') must never act as a match key: two
      // unrelated articles that both happen to normalize to '' should not
      // be treated as the same article.
      const existing = (urlKey ? byUrl.get(urlKey) : undefined) ?? (titleKey ? byTitle.get(titleKey) : undefined);

      if (existing) {
        for (const portal of incoming.portals) {
          if (!existing.portals.includes(portal)) existing.portals.push(portal);
        }
        if (!existing.imageUrl && incoming.imageUrl) existing.imageUrl = incoming.imageUrl;
        if (!existing.summary && incoming.summary) existing.summary = incoming.summary;
        if (incoming.publishedAt < existing.publishedAt) existing.publishedAt = incoming.publishedAt;
        // Keep the title-key index consistent so a later article matching
        // the incoming article's own title (which may differ from the
        // existing entry's title) still resolves to the same merged entry.
        if (urlKey) byUrl.set(urlKey, existing);
        if (titleKey) byTitle.set(titleKey, existing);
      } else {
        const copy: NewsArticle = { ...incoming, portals: [...incoming.portals] };
        if (urlKey) byUrl.set(urlKey, copy);
        if (titleKey) byTitle.set(titleKey, copy);
        result.push(copy);
      }
    }
  }

  return result.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
