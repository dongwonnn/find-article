'use client';

import { useEffect, useState } from 'react';
import { relativeTime } from '@/lib/time';
import type { NewsArticle, Portal } from '@/lib/types';

const PORTAL_LABEL: Record<Portal, string> = { naver: '네이버', daum: '다음', google: '구글' };
// 포털 식별은 브랜드 색 점 하나로만 하고, 글자는 회색으로 눌러 제목이 먼저 읽히게 한다.
const PORTAL_DOT: Record<Portal, string> = {
  naver: 'bg-[#03C75A]',
  daum: 'bg-[#0074E9]',
  google: 'bg-[#EA4335]',
};

export function ArticleCard({ article }: { article: NewsArticle }) {
  const [imageUrl, setImageUrl] = useState<string | null>(article.imageUrl ?? null);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // 이미지가 없는 기사(네이버·구글)는 og:image를 지연 로드
  useEffect(() => {
    if (imageUrl) return;
    let cancelled = false;
    fetch(`/api/og?url=${encodeURIComponent(article.url)}`)
      .then((res) => (res.ok ? res.json() : { imageUrl: null }))
      .then((data) => {
        if (!cancelled && data.imageUrl) setImageUrl(data.imageUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [article.url, imageUrl]);

  const showImage = imageUrl && !imageFailed;

  return (
    <li className="overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:border-gray-300 hover:shadow-sm">
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex gap-3 p-3 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none sm:gap-4 sm:p-4"
      >
        {/* 이미지 자리는 처음부터 잡아 두고, 늦게 도착한 썸네일은 부드럽게 겹쳐 올린다 */}
        <div className="relative h-[68px] w-[92px] shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:h-[76px] sm:w-28">
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-gray-400"
          >
            {article.press.slice(0, 1)}
          </span>
          {showImage && (
            <img
              src={imageUrl}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageFailed(true)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-[15px] leading-snug font-semibold text-gray-900 group-hover:text-blue-700">
            {article.title}
          </h2>
          {article.summary && (
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-gray-500">
              {article.summary}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{article.press}</span>
            <span aria-hidden="true" className="text-gray-300">
              ·
            </span>
            <span className="tabular-nums">{relativeTime(article.publishedAt)}</span>
            <span className="sr-only">출처</span>
            {article.portals.map((portal) => (
              <span
                key={portal}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600"
              >
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PORTAL_DOT[portal]}`} />
                {PORTAL_LABEL[portal]}
              </span>
            ))}
          </div>
        </div>
      </a>
    </li>
  );
}
