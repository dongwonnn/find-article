'use client';

import { useState } from 'react';
import { ArticleList } from '@/components/ArticleList';
import { SearchBar } from '@/components/SearchBar';
import type { NewsArticle, Portal, SearchResponse } from '@/lib/types';

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function HomePage() {
  const [status, setStatus] = useState<Status>('idle');
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [failedPortals, setFailedPortals] = useState<Portal[]>([]);

  async function handleSearch(nextQuery: string) {
    setStatus('loading');
    setQuery(nextQuery);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(nextQuery)}`);
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data: SearchResponse = await res.json();
      setArticles(data.articles);
      setFailedPortals(data.failedPortals);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/85 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="mb-3 flex items-baseline gap-2">
            <h1 className="text-base font-bold tracking-tight">뉴스 통합 검색</h1>
            <p className="text-xs text-gray-500">네이버 · 다음 · 구글</p>
          </div>
          <SearchBar onSearch={handleSearch} disabled={status === 'loading'} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {status === 'idle' && (
          <div className="px-6 py-20 text-center">
            <p className="text-base font-semibold text-gray-800">무엇을 찾아볼까요?</p>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              검색어를 입력하면 네이버·다음·구글 뉴스를 최신순으로 모아 보여드려요.
            </p>
          </div>
        )}

        {status === 'loading' && <SkeletonList />}

        {status === 'error' && (
          <div role="alert" className="px-6 py-20 text-center">
            <p className="text-sm font-medium text-red-600">검색 중 문제가 생겼어요.</p>
            <p className="mt-1 text-sm text-gray-500">잠시 후 다시 검색해 주세요.</p>
          </div>
        )}

        {status === 'done' && (
          <>
            {articles.length > 0 && (
              <p role="status" className="mb-3 text-xs text-gray-500">
                ‘{query}’ 뉴스{' '}
                <span className="font-semibold text-gray-700">{articles.length}건</span> · 최신순
              </p>
            )}
            <ArticleList articles={articles} failedPortals={failedPortals} />
          </>
        )}
      </main>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul aria-hidden="true" className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="flex animate-pulse gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:gap-4 sm:p-4"
        >
          <div className="h-[68px] w-[92px] shrink-0 rounded-lg bg-gray-200 sm:h-[76px] sm:w-28" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-3.5 w-3/4 rounded bg-gray-200" />
            <div className="h-3 w-full rounded bg-gray-100" />
            <div className="h-3 w-1/3 rounded bg-gray-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}
