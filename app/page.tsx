'use client';

import { useMemo, useState } from 'react';
import { ArticleList } from '@/components/ArticleList';
import { DateFilterBar } from '@/components/DateFilterBar';
import { ExcelDownloadButton } from '@/components/ExcelDownloadButton';
import { SearchBar } from '@/components/SearchBar';
import { ALL_DATES, filterArticlesByDate, type DateFilterValue } from '@/lib/date-filter';
import {
  allSelected,
  NOTHING_EXCLUDED,
  selectedArticles,
  setAllSelected,
  setSelected,
  type ExcludedIds,
} from '@/lib/selection';
import type { NewsArticle, Portal, SearchResponse } from '@/lib/types';

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function HomePage() {
  const [status, setStatus] = useState<Status>('idle');
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [failedPortals, setFailedPortals] = useState<Portal[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(ALL_DATES);
  // 체크를 푼 기사 id만 담는다. 비어 있으면 전부 엑셀에 담긴다.
  const [excludedIds, setExcludedIds] = useState<ExcludedIds>(NOTHING_EXCLUDED);

  // 필터는 이미 받아 온 목록에만 건다. 포털을 다시 부르지 않는다.
  const visible = useMemo(() => filterArticlesByDate(articles, dateFilter), [articles, dateFilter]);
  const filtered = visible.length !== articles.length;
  // 엑셀에 담기는 건 '보이면서 체크된' 기사다. 날짜 필터로 가려진 기사는 애초에 빠진다.
  const forExcel = useMemo(() => selectedArticles(visible, excludedIds), [visible, excludedIds]);
  const everySelected = allSelected(visible, excludedIds);

  async function handleSearch(nextQuery: string) {
    setStatus('loading');
    setQuery(nextQuery);
    // 새 검색은 새 의도다. 앞선 기간 필터를 물고 가면 결과가 0건으로 나와도
    // 검색이 실패한 것처럼 보인다. 항상 '전체'로 되돌린다.
    setDateFilter(ALL_DATES);
    // 앞 검색에서 풀어 둔 체크는 새 결과와 아무 상관이 없다. 전부 체크된 상태로 시작한다.
    setExcludedIds(NOTHING_EXCLUDED);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(nextQuery)}`);
      if (res.status === 401) {
        // 세션이 끊긴 상황이라 클라이언트 라우팅 대신 전체 새로고침으로 넘긴다.
        // router.push는 만료된 상태를 그대로 안고 가서 다시 401을 맞는다.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
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
              검색어를 입력하면 네이버·다음 뉴스를 관련도순으로 모아 보여드려요.
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
              <>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <DateFilterBar value={dateFilter} onChange={setDateFilter} />
                  <div className="flex shrink-0 items-center gap-3">
                    {/* 필터가 다 걸러 내 목록이 비면 켜고 끌 대상이 없다. 그때는 감춘다. */}
                    {visible.length > 0 && (
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900">
                        <input
                          type="checkbox"
                          checked={everySelected}
                          // 일부만 체크된 상태를 '전부 해제'처럼 보여 주면 거짓말이 된다.
                          // 절반만 칠해진 표시는 속성으로만 켤 수 있어 ref로 건드린다.
                          ref={(el) => {
                            if (el) el.indeterminate = !everySelected && forExcel.length > 0;
                          }}
                          onChange={(event) =>
                            setExcludedIds(
                              setAllSelected(visible, excludedIds, event.target.checked),
                            )
                          }
                          className="h-4 w-4 cursor-pointer accent-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                        />
                        전체 선택
                      </label>
                    )}
                    <ExcelDownloadButton articles={forExcel} query={query} />
                  </div>
                </div>
                {/* role="status"라서 필터로 건수가 바뀌면 스크린리더가 바로 읽어 준다 */}
                <p role="status" className="mb-3 text-xs text-gray-500">
                  ‘{query}’ 뉴스{' '}
                  {filtered ? (
                    <>
                      전체 {articles.length}건 중{' '}
                      <span className="font-semibold text-gray-700">{visible.length}건</span>
                    </>
                  ) : (
                    <span className="font-semibold text-gray-700">{articles.length}건</span>
                  )}{' '}
                  · 관련도순
                  {forExcel.length !== visible.length && (
                    <>
                      {' '}
                      · 엑셀{' '}
                      <span className="font-semibold text-gray-700">{forExcel.length}건</span>
                    </>
                  )}
                </p>
              </>
            )}
            <ArticleList
              articles={visible}
              failedPortals={failedPortals}
              emptyReason={articles.length > 0 ? 'dateFilter' : 'search'}
              excludedIds={excludedIds}
              onSelectedChange={(id, selected) =>
                setExcludedIds((prev) => setSelected(prev, id, selected))
              }
            />
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
