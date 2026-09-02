import { NextRequest, NextResponse } from 'next/server';
import { TtlCache } from '@/lib/cache';
import { extractOgImage, isFetchableUrl } from '@/lib/og';

const ogCache = new TtlCache<string | null>(24 * 60 * 60 * 1000, 2000);

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url || !isFetchableUrl(url)) {
    return NextResponse.json({ imageUrl: null }, { status: 400 });
  }

  const cached = ogCache.get(url);
  if (cached !== undefined) return NextResponse.json({ imageUrl: cached });

  let imageUrl: string | null = null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; find-article/1.0)' },
      signal: AbortSignal.timeout(3000),
      redirect: 'follow',
      cache: 'no-store',
    });
    if (res.ok) imageUrl = extractOgImage(await res.text());
  } catch {
    imageUrl = null; // 실패도 캐시해 재시도 폭주 방지
  }
  ogCache.set(url, imageUrl);
  return NextResponse.json({ imageUrl });
}
