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

export function ArticleCard({
  article,
  /** 엑셀에 담을지 여부. 체크를 풀면 다운로드에서 빠진다. */
  selected,
  onSelectedChange,
}: {
  article: NewsArticle;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
}) {
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
    <li
      className={`flex items-stretch overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:border-gray-300 hover:shadow-sm ${
        // 빠질 기사라는 걸 목록을 훑기만 해도 알아채게 흐리게 눌러 둔다.
        selected ? '' : 'opacity-55'
      }`}
    >
      {/* 체크박스는 <a> 바깥에 둔다. 앵커 안에 넣으면 체크하려던 클릭이 기사 링크로
          새고, 마크업도 어긋난다. label로 감싸 원문 링크만큼 넉넉한 과녁을 준다. */}
      <label className="flex shrink-0 cursor-pointer items-center py-3 pl-3 sm:py-4 sm:pl-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelectedChange(event.target.checked)}
          className="h-4 w-4 cursor-pointer accent-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        />
        <span className="sr-only">엑셀에 포함: {article.title}</span>
      </label>
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        // ring-inset가 없으면 li의 overflow-hidden에 포커스 링이 잘려 보이지 않는다.
        className="group flex min-w-0 flex-1 gap-3 p-3 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset focus-visible:outline-none sm:gap-4 sm:p-4"
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
            // 대표 이미지는 언론사 CDN 어디서든 올 수 있어 next/image의 도메인 등록을
            // 유지할 수 없다. 핫링크 차단을 피하려 referrer도 떼야 한다.
            // eslint-disable-next-line @next/next/no-img-element
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
            {/* 포털이 하나뿐일 때는 모든 카드에 같은 배지가 붙어 아무 정보도 주지
                못한다. 여러 포털에서 함께 잡힌 기사일 때만 어디서 왔는지 보여준다. */}
            {article.portals.length > 1 && (
              <>
                <span className="sr-only">출처</span>
                {article.portals.map((portal) => (
                  <span
                    key={portal}
                    className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${PORTAL_DOT[portal]}`}
                    />
                    {PORTAL_LABEL[portal]}
                  </span>
                ))}
              </>
            )}
          </div>
        </div>
      </a>
    </li>
  );
}
