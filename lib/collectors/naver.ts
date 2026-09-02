import { articleId } from '../merge';
import { pressFromUrl } from '../press-map';
import { stripHtml } from '../text';
import type { NewsArticle } from '../types';

interface NaverItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

function toIsoOrEpoch(raw: string): string {
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

export function parseNaverResponse(json: unknown): NewsArticle[] {
  const items = (json as { items?: NaverItem[] })?.items ?? [];
  return items.map((item) => {
    const url = item.originallink || item.link;
    return {
      id: articleId(url),
      title: stripHtml(item.title),
      summary: stripHtml(item.description) || undefined,
      url,
      press: pressFromUrl(url),
      portals: ['naver' as const],
      // pubDate가 깨지면 toISOString이 던져서 네이버 결과 20건이 통째로 날아간다.
      // 해당 기사만 epoch로 떨어뜨려 목록 맨 뒤로 보낸다.
      publishedAt: toIsoOrEpoch(item.pubDate),
    };
  });
}

export async function collectNaver(query: string): Promise<NewsArticle[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 설정되지 않았습니다.');
  }
  // 2026-07-31자로 개발자센터(openapi.naver.com)의 검색 API 신규 발급이 끝나고
  // NAVER API HUB(네이버 클라우드 플랫폼)로 이관됐다. 주소와 인증 헤더가 바뀌었을 뿐
  // 요청 파라미터와 응답 구조는 같다.
  const res = await fetch(
    `https://naverapihub.apigw.ntruss.com/search/v1/news?query=${encodeURIComponent(query)}&display=20&sort=date`,
    {
      headers: { 'X-NCP-APIGW-API-KEY-ID': clientId, 'X-NCP-APIGW-API-KEY': clientSecret },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`네이버 API 오류: ${res.status}`);
  return parseNaverResponse(await res.json());
}
