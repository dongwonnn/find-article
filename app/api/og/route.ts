import { NextRequest, NextResponse } from 'next/server';
import { TtlCache } from '@/lib/cache';
import { extractOgImage, isFetchableUrl, isOgWorthFetching } from '@/lib/og';

const ogCache = new TtlCache<string | null>(24 * 60 * 60 * 1000, 2000);

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url || !isFetchableUrl(url)) {
    return NextResponse.json({ imageUrl: null }, { status: 400 });
  }

  if (!isOgWorthFetching(url)) return NextResponse.json({ imageUrl: null });

  const cached = ogCache.get(url);
  if (cached !== undefined) return NextResponse.json({ imageUrl: cached });

  let imageUrl: string | null = null;
  try {
    imageUrl = await fetchOgImage(url);
  } catch {
    imageUrl = null; // 실패도 캐시해 재시도 폭주 방지
  }
  ogCache.set(url, imageUrl);
  return NextResponse.json({ imageUrl });
}

const MAX_REDIRECTS = 3;

// 리다이렉트를 직접 따라가며 매 홉을 isFetchableUrl로 다시 검증한다.
// redirect: 'follow'로 두면 검증을 통과한 외부 URL이 내부 주소로 리다이렉트시켜
// 서버가 대신 그 주소를 긁어오게 만들 수 있다.
async function fetchOgImage(startUrl: string): Promise<string | null> {
  const deadline = AbortSignal.timeout(3000);
  let target = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; find-article/1.0)' },
      signal: deadline,
      redirect: 'manual',
      cache: 'no-store',
    });

    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return res.ok ? extractOgImage(await res.text()) : null;

    const next = new URL(location, target).href;
    if (!isFetchableUrl(next)) return null;
    target = next;
  }
  return null;
}
