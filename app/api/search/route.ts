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

  const { lists, failedPortals } = await collectAll(query);
  const body: SearchResponse = { articles: mergeArticles(lists), failedPortals };
  searchCache.set(query, body);
  return NextResponse.json(body);
}
