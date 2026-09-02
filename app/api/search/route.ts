import { NextRequest, NextResponse } from 'next/server';
import { TtlCache } from '@/lib/cache';
import { collectAll } from '@/lib/collectors';
import { mergeArticles } from '@/lib/merge';
import type { SearchResponse } from '@/lib/types';

const searchCache = new TtlCache<SearchResponse>(2 * 60 * 1000);

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim();
  if (!query) {
    return NextResponse.json({ error: '검색어를 입력해주세요.' }, { status: 400 });
  }

  const cached = searchCache.get(query);
  if (cached) return NextResponse.json(cached);

  const { lists, failedPortals, failureReasons } = await collectAll(query);
  const body: SearchResponse = { articles: mergeArticles(lists), failedPortals, failureReasons };
  // 일부 포털이 실패한 응답은 캐시하지 않는다. 캐시하면 포털이 복구된 뒤에도
  // TTL이 끝날 때까지 반쪽짜리 결과와 오류 배너가 계속 나간다.
  if (failedPortals.length === 0) searchCache.set(query, body);
  return NextResponse.json(body);
}
