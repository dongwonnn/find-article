'use client';

import { useState } from 'react';
import { downloadArticlesXlsx } from '@/lib/excel-download';
import type { NewsArticle } from '@/lib/types';

type Status = 'idle' | 'working' | 'error';

/** 지금 화면에 보이는(=필터를 통과한) 기사만 엑셀로 내려받는다. */
export function ExcelDownloadButton({
  articles,
  query,
}: {
  articles: NewsArticle[];
  query: string;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const empty = articles.length === 0;

  async function handleClick() {
    setStatus('working');
    try {
      await downloadArticlesXlsx(articles, query);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status === 'error' && (
        <span role="alert" className="text-xs text-red-600">
          엑셀 파일을 만들지 못했어요.
        </span>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={empty || status === 'working'}
        // 보이는 글자('엑셀 다운로드')를 그대로 품으면서 몇 건이 담기는지까지 읽어 준다.
        aria-label={`${articles.length}건 엑셀 다운로드`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-400 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-300"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 text-emerald-600">
          <path
            d="M8 2v8m0 0 3-3m-3 3L5 7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M3 12.5h10"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
        {status === 'working' ? '만드는 중…' : '엑셀 다운로드'}
      </button>
    </div>
  );
}
