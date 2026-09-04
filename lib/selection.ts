// 엑셀로 내보낼 기사 고르기. 기본값이 '전부 포함'이라 상태로는 체크된 id가 아니라
// '체크를 푼 id'만 들고 다닌다. 빈 집합이 곧 전부 포함이므로 검색 결과가 새로 와도
// 따로 초기화할 일이 없고, 날짜 필터로 잠깐 사라졌다 돌아온 기사도 해제 상태를
// 그대로 기억한다.

import type { NewsArticle } from './types';

export type ExcludedIds = ReadonlySet<string>;

export const NOTHING_EXCLUDED: ExcludedIds = new Set<string>();

export function isSelected(excluded: ExcludedIds, id: string): boolean {
  return !excluded.has(id);
}

/** 기사 한 건의 체크를 켜고 끈다. 원본 집합은 건드리지 않는다. */
export function setSelected(excluded: ExcludedIds, id: string, selected: boolean): ExcludedIds {
  const next = new Set(excluded);
  if (selected) next.delete(id);
  else next.add(id);
  return next;
}

/** 체크가 살아 있는 기사만 남긴다. 원본 순서(관련도순)는 그대로 둔다. */
export function selectedArticles(articles: NewsArticle[], excluded: ExcludedIds): NewsArticle[] {
  if (excluded.size === 0) return articles;
  return articles.filter((article) => isSelected(excluded, article.id));
}

/** 지금 화면에 보이는 기사가 하나도 빠짐없이 체크돼 있는가. */
export function allSelected(articles: NewsArticle[], excluded: ExcludedIds): boolean {
  return articles.every((article) => isSelected(excluded, article.id));
}

/**
 * 화면에 보이는 기사를 한꺼번에 체크하거나 해제한다. 날짜 필터에 걸려 지금 안 보이는
 * 기사의 해제 상태까지 건드리면, 필터를 되돌렸을 때 사용자가 만든 적 없는 선택이
 * 튀어나온다. 그래서 보이는 것만 손댄다.
 */
export function setAllSelected(
  articles: NewsArticle[],
  excluded: ExcludedIds,
  selected: boolean,
): ExcludedIds {
  const next = new Set(excluded);
  for (const article of articles) {
    if (selected) next.delete(article.id);
    else next.add(article.id);
  }
  return next;
}
