'use client';

import { isSelected, type ExcludedIds } from '@/lib/selection';
import type { NewsArticle, Portal } from '@/lib/types';
import { ArticleCard } from './ArticleCard';

const PORTAL_LABEL: Record<Portal, string> = { naver: '네이버', daum: '다음', google: '구글' };

export function ArticleList({
  articles,
  failedPortals,
  /** 0건인 이유. 검색 자체가 빈손인지, 날짜 필터가 다 걸러 낸 것인지에 따라 안내가 달라진다. */
  emptyReason = 'search',
  /** 엑셀에서 뺄 기사 id. 비어 있으면 전부 담긴다. */
  excludedIds,
  onSelectedChange,
}: {
  articles: NewsArticle[];
  failedPortals: Portal[];
  emptyReason?: 'search' | 'dateFilter';
  excludedIds: ExcludedIds;
  onSelectedChange: (id: string, selected: boolean) => void;
}) {
  return (
    <div>
      {failedPortals.length > 0 && (
        <p
          role="status"
          className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-px h-4 w-4 shrink-0 text-amber-500">
            <circle cx="8" cy="8" r="7" fill="currentColor" />
            <path d="M8 4.5v4.2M8 11.2v.6" stroke="#fffbeb" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>
            {failedPortals.map((p) => PORTAL_LABEL[p]).join('·')} 결과를 가져오지 못했어요. 나머지 포털
            결과만 보여드릴게요.
          </span>
        </p>
      )}
      {articles.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-dashed border-gray-300 px-6 py-14 text-center"
        >
          {emptyReason === 'dateFilter' ? (
            <>
              <p className="text-sm font-medium text-gray-700">선택한 기간에는 기사가 없어요.</p>
              <p className="mt-1 text-sm text-gray-500">기간을 넓혀서 다시 확인해 보세요.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700">검색 결과가 없어요.</p>
              <p className="mt-1 text-sm text-gray-500">다른 검색어로 다시 찾아보세요.</p>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {articles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              selected={isSelected(excludedIds, article.id)}
              onSelectedChange={(selected) => onSelectedChange(article.id, selected)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
