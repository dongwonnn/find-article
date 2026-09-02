'use client';

import type { NewsArticle, Portal } from '@/lib/types';
import { ArticleCard } from './ArticleCard';

const PORTAL_LABEL: Record<Portal, string> = { naver: '네이버', daum: '다음', google: '구글' };

export function ArticleList({
  articles,
  failedPortals,
}: {
  articles: NewsArticle[];
  failedPortals: Portal[];
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
        <div className="rounded-xl border border-dashed border-gray-300 px-6 py-14 text-center">
          <p className="text-sm font-medium text-gray-700">검색 결과가 없어요.</p>
          <p className="mt-1 text-sm text-gray-500">다른 검색어로 다시 찾아보세요.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </ul>
      )}
    </div>
  );
}
