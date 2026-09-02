# 뉴스 통합 검색 (find-article) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 검색어를 입력하면 네이버(오픈 API)·구글(RSS)·다음(HTML 파싱) 뉴스를 수집해 중복을 합치고 최신순으로 보여주는, 공유 계정 로그인이 걸린 Next.js 웹앱.

**Architecture:** Next.js App Router 단일 앱. `/api/search`가 세 수집기를 `Promise.allSettled`로 병렬 실행 → 정규화·중복 합침·최신순 정렬 → JSON 응답. 이미지가 없는 기사는 카드가 `/api/og`로 `og:image`를 지연 로드. 인증은 HMAC 서명 쿠키 + middleware.

**Tech Stack:** Next.js 최신 안정판(App Router), TypeScript 최신 안정판, Tailwind CSS, cheerio, fast-xml-parser, Vitest.

**스펙:** `docs/superpowers/specs/2026-09-02-news-search-design.md`

## Global Constraints

- UI 문구·오류 메시지는 모두 한국어.
- 포털별 수집 최대 20건. 수집 타임아웃 5초, og:image fetch 타임아웃 3초.
- 캐시: 검색 결과 2분 TTL, og:image 24시간 TTL (실패도 캐시).
- 인증 쿠키 `auth_token`: httpOnly, sameSite=lax, 7일 유효.
- 환경변수: `AUTH_USER`, `AUTH_PASS`, `AUTH_SECRET`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`.
- `lib/auth.ts`는 Edge 런타임(middleware)에서 돌므로 Node `crypto`/`Buffer` 금지 — Web Crypto(`crypto.subtle`)와 `btoa`만 사용.
- import 별칭 `@/*` = 프로젝트 루트.
- 외부 이미지는 `next/image` 대신 일반 `<img referrerPolicy="no-referrer">` 사용 (언론사 핫링크 차단 우회, 도메인 무제한).
- 커밋 메시지 끝에 항상:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Rk2vVv9KRGQHu1HeQtQbVz
  ```

---

### Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: Next.js 프로젝트 전체 (`create-next-app`), `vitest.config.ts`, `.env.example`
- Modify: `package.json` (test 스크립트)

**Interfaces:**
- Produces: `npm test`(vitest run), `npm run dev`, `@/*` 별칭, cheerio·fast-xml-parser 의존성. 이후 모든 태스크가 이 위에서 동작.

- [ ] **Step 1: create-next-app 실행 (docs를 잠시 옮겨두고 진행)**

`create-next-app`은 비어있지 않은 디렉토리를 거부하므로 docs를 잠시 대피시킨다.

```bash
cd /Users/dongwonkim/Workspace/find-article
mv docs "$TMPDIR/find-article-docs-backup"
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
mv "$TMPDIR/find-article-docs-backup" docs
```

Expected: `app/`, `package.json`, `tsconfig.json`, `next.config.ts` 생성. docs 복원 확인 (`ls docs/superpowers/specs`).

- [ ] **Step 2: 의존성 설치 + test 스크립트**

```bash
npm install cheerio fast-xml-parser
npm install -D vitest
npm pkg set scripts.test="vitest run"
```

- [ ] **Step 3: vitest.config.ts 작성**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: { environment: 'node' },
  resolve: { alias: { '@': path.resolve('.') } },
});
```

- [ ] **Step 4: .env.example 작성**

```
AUTH_USER=admin
AUTH_PASS=change-me
AUTH_SECRET=long-random-string-change-me
NAVER_CLIENT_ID=네이버-개발자센터에서-발급
NAVER_CLIENT_SECRET=네이버-개발자센터에서-발급
```

- [ ] **Step 5: 동작 확인**

```bash
npm test        # 예상: "No test files found" 류 메시지 (오류 아님) 또는 exit 0/1 — vitest 실행 자체가 되면 OK
npm run build   # 예상: 빌드 성공
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: Next.js + Tailwind + Vitest 스캐폴딩"
```

---

### Task 2: 타입 정의 + TTL 메모리 캐시

**Files:**
- Create: `lib/types.ts`, `lib/cache.ts`
- Test: `tests/cache.test.ts`

**Interfaces:**
- Produces:
  - `type Portal = 'naver' | 'daum' | 'google'`
  - `interface NewsArticle { id: string; title: string; summary?: string; url: string; press: string; portals: Portal[]; publishedAt: string; imageUrl?: string }`
  - `interface SearchResponse { articles: NewsArticle[]; failedPortals: Portal[] }`
  - `class TtlCache<V> { constructor(ttlMs: number, maxSize?: number); get(key: string): V | undefined; set(key: string, value: V): void }`
  - 주의: `get`은 미스일 때만 `undefined` — `null`은 유효한 캐시 값(og 실패 캐시에 사용).

- [ ] **Step 1: lib/types.ts 작성** (타입만이라 테스트 없음)

```ts
export type Portal = 'naver' | 'daum' | 'google';

export interface NewsArticle {
  id: string;              // 정규화된 URL의 해시
  title: string;
  summary?: string;
  url: string;             // 기사 원문 링크
  press: string;           // 언론사명
  portals: Portal[];       // 출처 포털 (중복 합침 시 여러 개)
  publishedAt: string;     // ISO 8601
  imageUrl?: string;
}

export interface SearchResponse {
  articles: NewsArticle[];
  failedPortals: Portal[];
}
```

- [ ] **Step 2: 실패하는 테스트 작성** — `tests/cache.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from '@/lib/cache';

describe('TtlCache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('저장한 값을 TTL 안에서는 돌려준다', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('a', '값');
    expect(cache.get('a')).toBe('값');
  });

  it('TTL이 지나면 undefined를 돌려준다', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('a', '값');
    vi.advanceTimersByTime(1001);
    expect(cache.get('a')).toBeUndefined();
  });

  it('null도 유효한 값으로 캐시한다 (미스와 구분)', () => {
    const cache = new TtlCache<string | null>(1000);
    cache.set('a', null);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('없는키')).toBeUndefined();
  });

  it('maxSize 초과 시 가장 오래된 항목을 밀어낸다', () => {
    const cache = new TtlCache<number>(60_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run tests/cache.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cache'`

- [ ] **Step 4: lib/cache.ts 구현**

```ts
interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<V> {
  private store = new Map<string, Entry<V>>();

  constructor(
    private ttlMs: number,
    private maxSize = 500,
  ) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/cache.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/cache.ts tests/cache.test.ts
git commit -m "feat: NewsArticle 타입과 TTL 메모리 캐시 추가"
```

---

### Task 3: 인증 (토큰 유틸 + 로그인 API + middleware + 로그인 페이지)

**Files:**
- Create: `lib/auth.ts`, `app/api/login/route.ts`, `middleware.ts`, `app/login/page.tsx`
- Test: `tests/auth.test.ts`

**Interfaces:**
- Produces:
  - `createToken(secret: string, ttlMs: number): Promise<string>` — `"<만료epoch>.<base64url서명>"` 형식
  - `verifyToken(secret: string, token: string | undefined): Promise<boolean>`
  - 쿠키 이름 `auth_token`. middleware가 `/login`, `/api/login` 외 전부 보호.
- Consumes: 없음 (독립).

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/auth.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createToken, verifyToken } from '@/lib/auth';

const SECRET = 'test-secret';

describe('auth token', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('발급한 토큰은 검증을 통과한다', async () => {
    const token = await createToken(SECRET, 60_000);
    expect(await verifyToken(SECRET, token)).toBe(true);
  });

  it('다른 시크릿으로 서명한 토큰은 거부한다', async () => {
    const token = await createToken('다른시크릿', 60_000);
    expect(await verifyToken(SECRET, token)).toBe(false);
  });

  it('만료된 토큰은 거부한다', async () => {
    const token = await createToken(SECRET, 1000);
    vi.advanceTimersByTime(1001);
    expect(await verifyToken(SECRET, token)).toBe(false);
  });

  it('형식이 깨진 토큰과 undefined는 거부한다', async () => {
    expect(await verifyToken(SECRET, 'abc')).toBe(false);
    expect(await verifyToken(SECRET, '123.')).toBe(false);
    expect(await verifyToken(SECRET, undefined)).toBe(false);
  });

  it('만료 시각을 조작한 토큰은 거부한다', async () => {
    const token = await createToken(SECRET, 1000);
    const [, sig] = token.split('.');
    expect(await verifyToken(SECRET, `9999999999999.${sig}`)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth'`

- [ ] **Step 3: lib/auth.ts 구현** (Web Crypto만 사용 — Edge 호환)

```ts
const encoder = new TextEncoder();

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return toBase64Url(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createToken(secret: string, ttlMs: number): Promise<string> {
  const exp = Date.now() + ttlMs;
  const sig = await hmac(secret, String(exp));
  return `${exp}.${sig}`;
}

export async function verifyToken(secret: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expStr, sig] = token.split('.');
  if (!expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = await hmac(secret, expStr);
  return timingSafeEqual(sig, expected);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/auth.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: app/api/login/route.ts 작성**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createToken } from '@/lib/auth';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const { username, password } = await request.json().catch(() => ({}) as Record<string, unknown>);
  const expectedUser = process.env.AUTH_USER;
  const expectedPass = process.env.AUTH_PASS;
  const secret = process.env.AUTH_SECRET;

  if (!expectedUser || !expectedPass || !secret) {
    return NextResponse.json({ error: '서버 인증 설정이 없습니다.' }, { status: 500 });
  }
  if (username !== expectedUser || password !== expectedPass) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const token = await createToken(secret, WEEK_MS);
  const response = NextResponse.json({ ok: true });
  response.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: WEEK_MS / 1000,
    path: '/',
  });
  return response;
}
```

- [ ] **Step 6: middleware.ts 작성 (프로젝트 루트)**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/api/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  const token = request.cookies.get('auth_token')?.value;
  const valid = secret ? await verifyToken(secret, token) : false;
  if (valid) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

참고: 설치된 Next.js가 16 이상이라 `middleware.ts` 지원 중단/경고가 뜨면, 공식 문서의 안내대로 파일명만 `proxy.ts`(export 명 포함)로 바꾸고 내용은 동일하게 유지한다. `npm run dev` 기동 로그로 확인.

- [ ] **Step 7: app/login/page.tsx 작성**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? '로그인에 실패했습니다.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow">
        <h1 className="text-xl font-bold text-gray-900">뉴스 검색 로그인</h1>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="아이디"
          autoComplete="username"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '확인 중…' : '로그인'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 8: 수동 검증**

`.env.local`을 만들고 (`cp .env.example .env.local` 후 값 채움) `npm run dev` 실행:

```bash
# 미인증 페이지 → 로그인으로 리다이렉트
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/
# 예상: 307 http://localhost:3000/login

# 미인증 API → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/search?q=test
# 예상: 401

# 로그인 성공 → 쿠키 발급
curl -s -i -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"change-me"}' | grep -i set-cookie
# 예상: set-cookie: auth_token=...

# 틀린 비밀번호 → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"wrong"}'
# 예상: 401
```

- [ ] **Step 9: Commit**

```bash
git add lib/auth.ts tests/auth.test.ts app/api/login app/login middleware.ts
git commit -m "feat: 공유 계정 로그인과 인증 미들웨어 추가"
```

---

### Task 4: 텍스트 유틸 + 언론사 도메인 매핑

**Files:**
- Create: `lib/text.ts`, `lib/press-map.ts`
- Test: `tests/text.test.ts`, `tests/press-map.test.ts`

**Interfaces:**
- Produces:
  - `stripHtml(input: string): string` — 태그 제거 + 주요 HTML 엔티티 디코드 + trim
  - `pressFromUrl(url: string): string` — 도메인→언론사명, 미등록 시 도메인 문자열, 파싱 불가 시 `'알 수 없음'`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/text.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { stripHtml } from '@/lib/text';

describe('stripHtml', () => {
  it('태그를 제거한다', () => {
    expect(stripHtml('<b>손흥민</b> 10호골')).toBe('손흥민 10호골');
  });

  it('HTML 엔티티를 디코드한다', () => {
    expect(stripHtml('&quot;대단해&quot; &amp; &lt;멋져&gt;')).toBe('"대단해" & <멋져>');
  });

  it('앞뒤 공백을 정리한다', () => {
    expect(stripHtml('  <p> 제목 </p>  ')).toBe('제목');
  });
});
```

`tests/press-map.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pressFromUrl } from '@/lib/press-map';

describe('pressFromUrl', () => {
  it('등록된 도메인은 언론사명을 돌려준다', () => {
    expect(pressFromUrl('https://www.yna.co.kr/view/AKR123')).toBe('연합뉴스');
  });

  it('서브도메인도 매칭한다', () => {
    expect(pressFromUrl('https://sports.donga.com/article/1')).toBe('동아일보');
  });

  it('미등록 도메인은 도메인 문자열을 돌려준다', () => {
    expect(pressFromUrl('https://www.example-news.co.kr/a/1')).toBe('example-news.co.kr');
  });

  it('URL이 아니면 "알 수 없음"을 돌려준다', () => {
    expect(pressFromUrl('not-a-url')).toBe('알 수 없음');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/text.test.ts tests/press-map.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: lib/text.ts 구현**

```ts
const ENTITIES: Record<string, string> = {
  '&quot;': '"',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? m)
    .trim();
}
```

- [ ] **Step 4: lib/press-map.ts 구현**

```ts
const PRESS_BY_DOMAIN: Record<string, string> = {
  'yna.co.kr': '연합뉴스', 'newsis.com': '뉴시스', 'news1.kr': '뉴스1',
  'chosun.com': '조선일보', 'donga.com': '동아일보', 'joongang.co.kr': '중앙일보',
  'hani.co.kr': '한겨레', 'khan.co.kr': '경향신문', 'hankookilbo.com': '한국일보',
  'seoul.co.kr': '서울신문', 'segye.com': '세계일보', 'munhwa.com': '문화일보',
  'kmib.co.kr': '국민일보', 'naeil.com': '내일신문',
  'hankyung.com': '한국경제', 'mk.co.kr': '매일경제', 'sedaily.com': '서울경제',
  'mt.co.kr': '머니투데이', 'edaily.co.kr': '이데일리', 'fnnews.com': '파이낸셜뉴스',
  'heraldcorp.com': '헤럴드경제', 'asiae.co.kr': '아시아경제', 'biz.chosun.com': '조선비즈',
  'ytn.co.kr': 'YTN', 'kbs.co.kr': 'KBS', 'imbc.com': 'MBC', 'sbs.co.kr': 'SBS',
  'jtbc.co.kr': 'JTBC', 'mbn.co.kr': 'MBN', 'tvchosun.com': 'TV조선',
  'ichannela.com': '채널A', 'nocutnews.co.kr': '노컷뉴스',
  'ohmynews.com': '오마이뉴스', 'pressian.com': '프레시안', 'sisain.co.kr': '시사IN',
  'sisajournal.com': '시사저널', 'dailian.co.kr': '데일리안', 'newdaily.co.kr': '뉴데일리',
  'busan.com': '부산일보', 'kookje.co.kr': '국제신문', 'kyeonggi.com': '경기일보',
  'sportsseoul.com': '스포츠서울', 'sportschosun.com': '스포츠조선',
  'sports.chosun.com': '스포츠조선', 'osen.co.kr': 'OSEN',
  'spotvnews.co.kr': '스포티비뉴스', 'starnewskorea.com': '스타뉴스',
  'mydaily.co.kr': '마이데일리', 'xportsnews.com': '엑스포츠뉴스',
  'interfootball.co.kr': '인터풋볼', 'fourfourtwo.co.kr': '포포투',
  'zdnet.co.kr': '지디넷코리아', 'etnews.com': '전자신문', 'bloter.net': '블로터',
  'wikitree.co.kr': '위키트리', 'insight.co.kr': '인사이트',
};

export function pressFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    // sports.donga.com → sports.donga.com, donga.com 순으로 매칭 시도
    for (let i = 0; i < parts.length - 1; i++) {
      const press = PRESS_BY_DOMAIN[parts.slice(i).join('.')];
      if (press) return press;
    }
    return host;
  } catch {
    return '알 수 없음';
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/text.test.ts tests/press-map.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/text.ts lib/press-map.ts tests/text.test.ts tests/press-map.test.ts
git commit -m "feat: HTML 텍스트 정리 유틸과 언론사 도메인 매핑 추가"
```

---

### Task 5: URL/제목 정규화 + 중복 합침 + 최신순 정렬

**Files:**
- Create: `lib/merge.ts`
- Test: `tests/merge.test.ts`

**Interfaces:**
- Consumes: `NewsArticle` (Task 2)
- Produces:
  - `normalizeUrl(url: string): string` — 프로토콜·www·쿼리·트레일링 슬래시 제거, 소문자
  - `normalizeTitle(title: string): string` — 공백·문장부호 제거, 소문자
  - `articleId(url: string): string` — normalizeUrl 기반 djb2 해시 hex
  - `mergeArticles(lists: NewsArticle[][]): NewsArticle[]` — 중복 합침(포털 배지 병합, 이미지·요약은 있는 쪽, publishedAt은 이른 쪽) 후 최신순 정렬

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/merge.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { mergeArticles, normalizeTitle, normalizeUrl } from '@/lib/merge';
import type { NewsArticle } from '@/lib/types';

function article(over: Partial<NewsArticle>): NewsArticle {
  return {
    id: 'x',
    title: '기본 제목',
    url: 'https://a.com/base',
    press: '테스트일보',
    portals: ['naver'],
    publishedAt: '2026-09-02T00:00:00.000Z',
    ...over,
  };
}

describe('normalizeUrl', () => {
  it('www·쿼리스트링·트레일링 슬래시를 제거한다', () => {
    expect(normalizeUrl('https://www.a.com/news/1/?ref=x&utm=y')).toBe('a.com/news/1');
    expect(normalizeUrl('http://a.com/news/1')).toBe('a.com/news/1');
  });
});

describe('normalizeTitle', () => {
  it('공백과 문장부호를 제거하고 소문자화한다', () => {
    expect(normalizeTitle('손흥민, "10호골"!')).toBe(normalizeTitle('손흥민 10호골'));
  });
});

describe('mergeArticles', () => {
  it('같은 URL이면 하나로 합치고 포털 배지를 병합한다', () => {
    const merged = mergeArticles([
      [article({ url: 'https://www.a.com/1?ref=n', portals: ['naver'] })],
      [article({ url: 'https://a.com/1', portals: ['google'], imageUrl: 'https://img/1.jpg' })],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].portals).toEqual(['naver', 'google']);
    expect(merged[0].imageUrl).toBe('https://img/1.jpg');
  });

  it('URL이 달라도 정규화된 제목이 같으면 합친다', () => {
    const merged = mergeArticles([
      [article({ url: 'https://a.com/1', title: '손흥민 10호골 폭발' })],
      [article({ url: 'https://b.com/2', title: '손흥민, 10호골 "폭발"', portals: ['daum'] })],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].portals).toEqual(['naver', 'daum']);
  });

  it('합칠 때 publishedAt은 더 이른 시각을 쓴다', () => {
    const merged = mergeArticles([
      [article({ url: 'https://a.com/1', publishedAt: '2026-09-02T05:00:00.000Z' })],
      [article({ url: 'https://a.com/1', portals: ['daum'], publishedAt: '2026-09-02T03:00:00.000Z' })],
    ]);
    expect(merged[0].publishedAt).toBe('2026-09-02T03:00:00.000Z');
  });

  it('최신순으로 정렬한다', () => {
    const merged = mergeArticles([[
      article({ url: 'https://a.com/old', publishedAt: '2026-09-01T00:00:00.000Z' }),
      article({ url: 'https://a.com/new', title: '다른 제목', publishedAt: '2026-09-02T00:00:00.000Z' }),
    ]]);
    expect(merged[0].url).toBe('https://a.com/new');
  });

  it('입력 배열을 변형하지 않는다', () => {
    const original = article({ portals: ['naver'] });
    mergeArticles([[original], [article({ portals: ['google'] })]]);
    expect(original.portals).toEqual(['naver']);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/merge.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: lib/merge.ts 구현**

```ts
import type { NewsArticle } from './types';

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname.replace(/\/$/, '');
    return `${host}${path}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function normalizeTitle(title: string): string {
  return title.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
}

export function articleId(url: string): string {
  const key = normalizeUrl(url);
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash * 33) ^ key.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

export function mergeArticles(lists: NewsArticle[][]): NewsArticle[] {
  const byUrl = new Map<string, NewsArticle>();
  const byTitle = new Map<string, NewsArticle>();
  const result: NewsArticle[] = [];

  for (const list of lists) {
    for (const incoming of list) {
      const urlKey = normalizeUrl(incoming.url);
      const titleKey = normalizeTitle(incoming.title);
      const existing = byUrl.get(urlKey) ?? byTitle.get(titleKey);

      if (existing) {
        for (const portal of incoming.portals) {
          if (!existing.portals.includes(portal)) existing.portals.push(portal);
        }
        if (!existing.imageUrl && incoming.imageUrl) existing.imageUrl = incoming.imageUrl;
        if (!existing.summary && incoming.summary) existing.summary = incoming.summary;
        if (incoming.publishedAt < existing.publishedAt) existing.publishedAt = incoming.publishedAt;
      } else {
        const copy: NewsArticle = { ...incoming, portals: [...incoming.portals] };
        byUrl.set(urlKey, copy);
        byTitle.set(titleKey, copy);
        result.push(copy);
      }
    }
  }

  return result.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/merge.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/merge.ts tests/merge.test.ts
git commit -m "feat: 기사 중복 합침과 최신순 정렬 로직 추가"
```

---

### Task 6: 네이버 수집기

**Files:**
- Create: `lib/collectors/naver.ts`, `tests/fixtures/naver.json`
- Test: `tests/naver.test.ts`

**Interfaces:**
- Consumes: `stripHtml`(Task 4), `pressFromUrl`(Task 4), `articleId`(Task 5), `NewsArticle`(Task 2)
- Produces:
  - `parseNaverResponse(json: unknown): NewsArticle[]` — 순수 파싱 (단위 테스트 대상)
  - `collectNaver(query: string): Promise<NewsArticle[]>` — 네이버 오픈 API 호출 (env 키 필요)

- [ ] **Step 1: fixture 작성** — `tests/fixtures/naver.json`

```json
{
  "lastBuildDate": "Tue, 02 Sep 2026 10:00:00 +0900",
  "total": 12345,
  "start": 1,
  "display": 2,
  "items": [
    {
      "title": "<b>손흥민</b>, 시즌 10호골 폭발",
      "originallink": "https://www.yna.co.kr/view/AKR20260902000001007",
      "link": "https://n.news.naver.com/mnews/article/001/0011111111",
      "description": "<b>손흥민</b>이 시즌 10호골을 터뜨렸다. 감독은 &quot;대단하다&quot;고 말했다.",
      "pubDate": "Tue, 02 Sep 2026 09:30:00 +0900"
    },
    {
      "title": "토트넘, 리그 선두 도약",
      "originallink": "",
      "link": "https://n.news.naver.com/mnews/article/001/0022222222",
      "description": "토트넘이 승리로 선두에 올랐다.",
      "pubDate": "Tue, 02 Sep 2026 08:00:00 +0900"
    }
  ]
}
```

- [ ] **Step 2: 실패하는 테스트 작성** — `tests/naver.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNaverResponse } from '@/lib/collectors/naver';

const fixture = JSON.parse(readFileSync('tests/fixtures/naver.json', 'utf8'));

describe('parseNaverResponse', () => {
  it('기사 목록을 NewsArticle로 변환한다', () => {
    const articles = parseNaverResponse(fixture);
    expect(articles).toHaveLength(2);
    const first = articles[0];
    expect(first.title).toBe('손흥민, 시즌 10호골 폭발');           // <b> 제거
    expect(first.summary).toContain('"대단하다"');                  // 엔티티 디코드
    expect(first.url).toBe('https://www.yna.co.kr/view/AKR20260902000001007');
    expect(first.press).toBe('연합뉴스');
    expect(first.portals).toEqual(['naver']);
    expect(first.publishedAt).toBe('2026-09-02T00:30:00.000Z');
  });

  it('originallink가 없으면 link(네이버 뉴스)를 쓴다', () => {
    const articles = parseNaverResponse(fixture);
    expect(articles[1].url).toBe('https://n.news.naver.com/mnews/article/001/0022222222');
  });

  it('items가 없으면 빈 배열을 돌려준다', () => {
    expect(parseNaverResponse({})).toEqual([]);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run tests/naver.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: lib/collectors/naver.ts 구현**

```ts
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
      publishedAt: new Date(item.pubDate).toISOString(),
    };
  });
}

export async function collectNaver(query: string): Promise<NewsArticle[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 설정되지 않았습니다.');
  }
  const res = await fetch(
    `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=20&sort=date`,
    {
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`네이버 API 오류: ${res.status}`);
  return parseNaverResponse(await res.json());
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/naver.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/collectors/naver.ts tests/fixtures/naver.json tests/naver.test.ts
git commit -m "feat: 네이버 뉴스 수집기 추가"
```

---

### Task 7: 구글 수집기

**Files:**
- Create: `lib/collectors/google.ts`, `tests/fixtures/google.xml`
- Test: `tests/google.test.ts`

**Interfaces:**
- Consumes: `stripHtml`(Task 4), `articleId`(Task 5), `NewsArticle`(Task 2)
- Produces:
  - `parseGoogleRss(xml: string): NewsArticle[]`
  - `collectGoogle(query: string): Promise<NewsArticle[]>` — 키 불필요

- [ ] **Step 1: fixture 작성** — `tests/fixtures/google.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:media="http://search.yahoo.com/mrss/" version="2.0">
  <channel>
    <title>"손흥민" - Google 뉴스</title>
    <item>
      <title>손흥민, 시즌 10호골 폭발 - 연합뉴스</title>
      <link>https://news.google.com/rss/articles/CBMiTEST1?oc=5</link>
      <guid isPermaLink="false">guid-1</guid>
      <pubDate>Tue, 02 Sep 2026 00:30:00 GMT</pubDate>
      <description>&lt;a href="https://news.google.com/x"&gt;손흥민, 시즌 10호골 폭발&lt;/a&gt;</description>
      <source url="https://www.yna.co.kr">연합뉴스</source>
    </item>
    <item>
      <title>손흥민 인터뷰 "팀 승리가 우선" - 스포츠서울</title>
      <link>https://news.google.com/rss/articles/CBMiTEST2?oc=5</link>
      <guid isPermaLink="false">guid-2</guid>
      <pubDate>Mon, 01 Sep 2026 23:00:00 GMT</pubDate>
      <description>&lt;a href="https://news.google.com/y"&gt;손흥민 인터뷰&lt;/a&gt;</description>
      <source url="https://www.sportsseoul.com">스포츠서울</source>
    </item>
  </channel>
</rss>
```

- [ ] **Step 2: 실패하는 테스트 작성** — `tests/google.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGoogleRss } from '@/lib/collectors/google';

const fixture = readFileSync('tests/fixtures/google.xml', 'utf8');

describe('parseGoogleRss', () => {
  it('RSS 아이템을 NewsArticle로 변환한다', () => {
    const articles = parseGoogleRss(fixture);
    expect(articles).toHaveLength(2);
    const first = articles[0];
    expect(first.title).toBe('손흥민, 시즌 10호골 폭발');            // " - 연합뉴스" 접미 제거
    expect(first.press).toBe('연합뉴스');                            // source 태그에서 추출
    expect(first.url).toBe('https://news.google.com/rss/articles/CBMiTEST1?oc=5');
    expect(first.portals).toEqual(['google']);
    expect(first.publishedAt).toBe('2026-09-02T00:30:00.000Z');
  });

  it('item이 하나뿐이어도 배열로 처리한다', () => {
    const single = fixture.replace(/<item>[\s\S]*?<\/item>\s*(?=<item>)/, '');
    expect(parseGoogleRss(single)).toHaveLength(1);
  });

  it('item이 없으면 빈 배열을 돌려준다', () => {
    expect(parseGoogleRss('<rss><channel></channel></rss>')).toEqual([]);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run tests/google.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: lib/collectors/google.ts 구현**

```ts
import { XMLParser } from 'fast-xml-parser';
import { articleId } from '../merge';
import { stripHtml } from '../text';
import type { NewsArticle } from '../types';

interface GoogleRssItem {
  title?: unknown;
  link?: unknown;
  pubDate?: unknown;
  source?: { '#text'?: unknown } | unknown;
}

export function parseGoogleRss(xml: string): NewsArticle[] {
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);
  let items: GoogleRssItem[] = doc?.rss?.channel?.item ?? [];
  if (!Array.isArray(items)) items = [items];

  return items
    .map((item) => {
      const rawTitle = String(item.title ?? '');
      const source = item.source;
      const press =
        source && typeof source === 'object'
          ? String((source as { '#text'?: unknown })['#text'] ?? '')
          : String(source ?? '');
      // 구글 RSS 제목은 "기사제목 - 언론사" 형태
      const title =
        press && rawTitle.endsWith(` - ${press}`)
          ? rawTitle.slice(0, -(press.length + 3))
          : rawTitle;
      const url = String(item.link ?? '');
      return {
        id: articleId(url),
        title: stripHtml(title),
        url,
        press: press || '구글 뉴스',
        portals: ['google' as const],
        publishedAt: new Date(String(item.pubDate ?? 0)).toISOString(),
      };
    })
    .filter((a) => a.url && a.title);
}

export async function collectGoogle(query: string): Promise<NewsArticle[]> {
  const res = await fetch(
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR%3Ako`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; find-article/1.0)' },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`구글 뉴스 RSS 오류: ${res.status}`);
  return parseGoogleRss(await res.text()).slice(0, 20);
}
```

참고: 구글 RSS의 링크는 `news.google.com` 리다이렉트 URL이다. og:image 추출이 실패할 수 있으나 설계상 플레이스홀더로 처리되므로 그대로 둔다. summary는 RSS description이 링크 목록이라 넣지 않는다.

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/google.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/collectors/google.ts tests/fixtures/google.xml tests/google.test.ts
git commit -m "feat: 구글 뉴스 RSS 수집기 추가"
```

---

### Task 8: 다음 수집기 (fixture 캡처 + 파싱)

**Files:**
- Create: `lib/collectors/daum.ts`, `tests/fixtures/daum.html` (실제 페이지에서 캡처)
- Test: `tests/daum.test.ts`

**Interfaces:**
- Consumes: `articleId`(Task 5), `NewsArticle`(Task 2)
- Produces:
  - `parseDaumTime(text: string, now: Date): string` — "5분전"/"3시간전"/"어제"/"2026.9.1." → ISO
  - `parseDaumHtml(html: string, now?: Date): NewsArticle[]` — 썸네일 포함
  - `collectDaum(query: string): Promise<NewsArticle[]>`

**중요:** 다음 검색결과는 공식 API가 없어 실제 마크업에 파서를 맞춰야 한다. 반드시 Step 1의 실제 fixture를 먼저 확보하고, Step 4 구현의 셀렉터를 fixture 구조에 맞게 확정한다. 아래 셀렉터는 알려진 두 세대(신형 `div.c-item-doc`, 구형 `ul.list_news > li`)의 출발점이다.

- [ ] **Step 1: 실제 fixture 캡처**

```bash
mkdir -p tests/fixtures
curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36" \
  -H "Accept-Language: ko-KR,ko;q=0.9" \
  "https://search.daum.net/search?w=news&q=%EC%86%90%ED%9D%A5%EB%AF%BC&sort=recency&cluster=n" \
  -o tests/fixtures/daum.html
wc -c tests/fixtures/daum.html   # 예상: 수백 KB. 10KB 미만이면 차단/오류 페이지 — 내용 확인
```

캡처 후 구조 파악:

```bash
grep -o 'c-item-doc\|list_news\|item-title\|tit_main' tests/fixtures/daum.html | sort | uniq -c
```

어느 세대 마크업인지 확인하고, 기사 제목 하나를 golden 값으로 골라 다음 스텝의 테스트에 반영한다. (curl이 403/빈 응답이면 브라우저로 해당 URL을 열어 "페이지 소스 저장"으로 fixture를 만든다.)

- [ ] **Step 2: 실패하는 테스트 작성** — `tests/daum.test.ts`

구조 불변식 위주로 작성 (fixture 내용이 시점마다 다르므로 특정 기사 제목에 과하게 의존하지 않는다):

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDaumHtml, parseDaumTime } from '@/lib/collectors/daum';

const fixture = readFileSync('tests/fixtures/daum.html', 'utf8');
const NOW = new Date('2026-09-02T12:00:00.000Z');

describe('parseDaumTime', () => {
  it('상대 시간을 ISO로 변환한다', () => {
    expect(parseDaumTime('5분전', NOW)).toBe('2026-09-02T11:55:00.000Z');
    expect(parseDaumTime('3시간전', NOW)).toBe('2026-09-02T09:00:00.000Z');
    expect(parseDaumTime('어제', NOW)).toBe('2026-09-01T12:00:00.000Z');
  });

  it('날짜 표기(KST)를 ISO로 변환한다', () => {
    expect(parseDaumTime('2026.9.1.', NOW)).toBe('2026-08-31T15:00:00.000Z');
  });

  it('해석 불가 문자열은 now를 돌려준다', () => {
    expect(parseDaumTime('???', NOW)).toBe(NOW.toISOString());
  });
});

describe('parseDaumHtml', () => {
  it('기사를 1건 이상 추출한다', () => {
    const articles = parseDaumHtml(fixture, NOW);
    expect(articles.length).toBeGreaterThan(0);
  });

  it('모든 기사에 필수 필드가 채워진다', () => {
    for (const a of parseDaumHtml(fixture, NOW)) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.url).toMatch(/^https?:\/\//);
      expect(a.press.length).toBeGreaterThan(0);
      expect(a.portals).toEqual(['daum']);
      expect(new Date(a.publishedAt).getTime()).not.toBeNaN();
    }
  });

  it('썸네일이 있는 기사가 존재한다', () => {
    const withImage = parseDaumHtml(fixture, NOW).filter((a) => a.imageUrl);
    expect(withImage.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run tests/daum.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: lib/collectors/daum.ts 구현** (셀렉터는 fixture에 맞춰 확정)

```ts
import * as cheerio from 'cheerio';
import { articleId } from '../merge';
import type { NewsArticle } from '../types';

export function parseDaumTime(text: string, now: Date): string {
  const t = text.trim();
  let m = t.match(/^(\d+)분\s*전$/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 60_000).toISOString();
  m = t.match(/^(\d+)시간\s*전$/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 3_600_000).toISOString();
  m = t.match(/^(\d+)일\s*전$/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 86_400_000).toISOString();
  if (t === '어제') return new Date(now.getTime() - 86_400_000).toISOString();
  if (t === '방금전' || t === '방금 전') return now.toISOString();
  m = t.match(/^(\d{4})\.\s?(\d{1,2})\.\s?(\d{1,2})\.?$/);
  if (m) {
    const [, y, mo, d] = m;
    return new Date(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00+09:00`).toISOString();
  }
  return now.toISOString();
}

function absoluteImageUrl(src: string | undefined): string | undefined {
  if (!src) return undefined;
  if (src.startsWith('http')) return src;
  if (src.startsWith('//')) return `https:${src}`;
  return undefined;
}

// ⚠️ 셀렉터는 tests/fixtures/daum.html의 실제 구조를 확인해 확정할 것.
// 알려진 두 세대: 신형 div.c-item-doc / 구형 ul.list_news > li
export function parseDaumHtml(html: string, now: Date = new Date()): NewsArticle[] {
  const $ = cheerio.load(html);
  const articles: NewsArticle[] = [];

  const newGen = $('div.c-item-doc');
  const isNewGen = newGen.length > 0;
  const items = isNewGen ? newGen : $('ul.list_news > li');

  items.each((_, el) => {
    const item = $(el);
    const titleLink = isNewGen
      ? item.find('.item-title a').first()
      : item.find('a.tit_main').first();
    const title = titleLink.text().trim();
    const url = titleLink.attr('href') ?? '';
    if (!title || !url.startsWith('http')) return;

    const press = item.find('.txt_info').first().text().trim();
    const timeText = isNewGen
      ? item.find('.gem-subinfo, .txt_info_time, .date').first().text().trim()
      : item.find('.txt_info').eq(1).text().trim();
    const summary = item.find('p.conts-desc, p.desc').first().text().trim() || undefined;
    const imageUrl = absoluteImageUrl(item.find('img').first().attr('src'));

    articles.push({
      id: articleId(url),
      title,
      summary,
      url,
      press: press || '다음 뉴스',
      portals: ['daum'],
      publishedAt: parseDaumTime(timeText, now),
      imageUrl,
    });
  });

  return articles;
}

export async function collectDaum(query: string): Promise<NewsArticle[]> {
  const res = await fetch(
    `https://search.daum.net/search?w=news&q=${encodeURIComponent(query)}&sort=recency&cluster=n`,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`다음 검색 오류: ${res.status}`);
  const articles = parseDaumHtml(await res.text());
  if (articles.length === 0) {
    throw new Error('다음 검색 파싱 결과 0건 — 마크업 변경 가능성. fixture를 다시 캡처해 셀렉터를 갱신할 것.');
  }
  return articles.slice(0, 20);
}
```

- [ ] **Step 5: 통과할 때까지 셀렉터 조정**

Run: `npx vitest run tests/daum.test.ts`
Expected: PASS (6 tests). 실패하면 fixture를 열어(`grep -n` 활용) 제목/링크/언론사/시간/썸네일의 실제 클래스명을 찾아 `parseDaumHtml`의 셀렉터만 수정 후 재실행. 테스트의 불변식은 바꾸지 않는다.

- [ ] **Step 6: Commit**

```bash
git add lib/collectors/daum.ts tests/fixtures/daum.html tests/daum.test.ts
git commit -m "feat: 다음 뉴스 검색 수집기 추가"
```

---

### Task 9: collectAll + /api/search

**Files:**
- Create: `lib/collectors/index.ts`, `app/api/search/route.ts`
- Test: `tests/collect-all.test.ts`

**Interfaces:**
- Consumes: `collectNaver`(Task 6), `collectGoogle`(Task 7), `collectDaum`(Task 8), `mergeArticles`(Task 5), `TtlCache`(Task 2), `SearchResponse`(Task 2)
- Produces:
  - `type Collector = (query: string) => Promise<NewsArticle[]>`
  - `collectAll(query: string, collectors?: Record<Portal, Collector>): Promise<{ lists: NewsArticle[][]; failedPortals: Portal[] }>`
  - `GET /api/search?q=<검색어>` → `SearchResponse` JSON. q 없으면 400.

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/collect-all.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { collectAll } from '@/lib/collectors';
import type { NewsArticle } from '@/lib/types';

const ok = (portal: 'naver' | 'daum' | 'google'): NewsArticle[] => [{
  id: portal,
  title: `${portal} 기사`,
  url: `https://example.com/${portal}`,
  press: '테스트',
  portals: [portal],
  publishedAt: '2026-09-02T00:00:00.000Z',
}];

describe('collectAll', () => {
  it('모든 수집기가 성공하면 세 목록을 돌려준다', async () => {
    const { lists, failedPortals } = await collectAll('손흥민', {
      naver: async () => ok('naver'),
      daum: async () => ok('daum'),
      google: async () => ok('google'),
    });
    expect(lists).toHaveLength(3);
    expect(failedPortals).toEqual([]);
  });

  it('일부 수집기가 실패해도 나머지는 돌려주고 실패 포털을 기록한다', async () => {
    const { lists, failedPortals } = await collectAll('손흥민', {
      naver: async () => ok('naver'),
      daum: async () => { throw new Error('차단됨'); },
      google: async () => ok('google'),
    });
    expect(lists).toHaveLength(2);
    expect(failedPortals).toEqual(['daum']);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/collect-all.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: lib/collectors/index.ts 구현**

```ts
import type { NewsArticle, Portal } from '../types';
import { collectDaum } from './daum';
import { collectGoogle } from './google';
import { collectNaver } from './naver';

export type Collector = (query: string) => Promise<NewsArticle[]>;

const DEFAULT_COLLECTORS: Record<Portal, Collector> = {
  naver: collectNaver,
  daum: collectDaum,
  google: collectGoogle,
};

export async function collectAll(
  query: string,
  collectors: Record<Portal, Collector> = DEFAULT_COLLECTORS,
): Promise<{ lists: NewsArticle[][]; failedPortals: Portal[] }> {
  const portals = Object.keys(collectors) as Portal[];
  const settled = await Promise.allSettled(portals.map((p) => collectors[p](query)));

  const lists: NewsArticle[][] = [];
  const failedPortals: Portal[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      lists.push(result.value);
    } else {
      failedPortals.push(portals[i]);
      console.error(`[collect] ${portals[i]} 수집 실패:`, result.reason);
    }
  });
  return { lists, failedPortals };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/collect-all.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: app/api/search/route.ts 작성**

```ts
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
```

- [ ] **Step 6: 수동 검증 (실제 포털 호출)**

`.env.local`에 네이버 키가 있어야 한다. `npm run dev` 후:

```bash
COOKIE=$(curl -s -i -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"change-me"}' | grep -io 'auth_token=[^;]*')
curl -s -b "$COOKIE" "http://localhost:3000/api/search?q=%EC%86%90%ED%9D%A5%EB%AF%BC" | head -c 2000
```

Expected: `{"articles":[{...제목·press·portals·publishedAt...}],"failedPortals":[...]}`. articles가 1건 이상, publishedAt 내림차순. 특정 포털이 failedPortals에 있으면 서버 로그의 `[collect]` 오류로 원인 확인 (네이버 키 미설정, 다음 차단 등).

- [ ] **Step 7: Commit**

```bash
git add lib/collectors/index.ts tests/collect-all.test.ts app/api/search
git commit -m "feat: 통합 수집 오케스트레이션과 검색 API 추가"
```

---

### Task 10: og:image 추출 + /api/og

**Files:**
- Create: `lib/og.ts`, `app/api/og/route.ts`
- Test: `tests/og.test.ts`

**Interfaces:**
- Consumes: `TtlCache`(Task 2)
- Produces:
  - `extractOgImage(html: string): string | null` — og:image → twitter:image 순
  - `isFetchableUrl(raw: string): boolean` — http(s)만, 내부망·localhost 차단 (SSRF 방지)
  - `GET /api/og?url=<기사URL>` → `{ imageUrl: string | null }`. 부적합 URL이면 400.

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/og.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { extractOgImage, isFetchableUrl } from '@/lib/og';

describe('extractOgImage', () => {
  it('og:image를 추출한다', () => {
    const html = '<html><head><meta property="og:image" content="https://img.example.com/a.jpg"/></head></html>';
    expect(extractOgImage(html)).toBe('https://img.example.com/a.jpg');
  });

  it('og:image가 없으면 twitter:image로 폴백한다', () => {
    const html = '<html><head><meta name="twitter:image" content="https://img.example.com/t.jpg"/></head></html>';
    expect(extractOgImage(html)).toBe('https://img.example.com/t.jpg');
  });

  it('둘 다 없으면 null을 돌려준다', () => {
    expect(extractOgImage('<html><head></head></html>')).toBeNull();
  });
});

describe('isFetchableUrl', () => {
  it('일반 http(s) URL은 허용한다', () => {
    expect(isFetchableUrl('https://www.yna.co.kr/view/1')).toBe(true);
  });

  it('내부망·localhost·비http는 차단한다', () => {
    expect(isFetchableUrl('http://localhost:3000/admin')).toBe(false);
    expect(isFetchableUrl('http://127.0.0.1/x')).toBe(false);
    expect(isFetchableUrl('http://192.168.0.1/x')).toBe(false);
    expect(isFetchableUrl('http://10.0.0.5/x')).toBe(false);
    expect(isFetchableUrl('ftp://a.com/x')).toBe(false);
    expect(isFetchableUrl('주소아님')).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/og.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: lib/og.ts 구현**

```ts
import * as cheerio from 'cheerio';

export function extractOgImage(html: string): string | null {
  const $ = cheerio.load(html);
  const content =
    $('meta[property="og:image"]').attr('content') ??
    $('meta[name="twitter:image"]').attr('content');
  const trimmed = content?.trim();
  return trimmed ? trimmed : null;
}

const BLOCKED_HOST = /^(localhost$|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|\[)/i;

export function isFetchableUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (BLOCKED_HOST.test(u.hostname)) return false;
    if (!u.hostname.includes('.')) return false;
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/og.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: app/api/og/route.ts 작성**

```ts
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
```

- [ ] **Step 6: 수동 검증**

```bash
curl -s -b "$COOKIE" "http://localhost:3000/api/og?url=https%3A%2F%2Fwww.yna.co.kr" | head -c 300
# 예상: {"imageUrl":"https://..."} 또는 {"imageUrl":null} — 200 응답이면 OK
curl -s -o /dev/null -w "%{http_code}\n" -b "$COOKIE" "http://localhost:3000/api/og?url=http%3A%2F%2Flocalhost%2Fadmin"
# 예상: 400
```

- [ ] **Step 7: Commit**

```bash
git add lib/og.ts tests/og.test.ts app/api/og
git commit -m "feat: og:image 추출 API 추가"
```

---

### Task 11: UI — 검색 페이지, 카드, 상대 시간

**Files:**
- Create: `lib/time.ts`, `components/SearchBar.tsx`, `components/ArticleCard.tsx`, `components/ArticleList.tsx`
- Modify: `app/page.tsx` (전체 교체), `app/layout.tsx` (lang·메타데이터)
- Test: `tests/time.test.ts`

**Interfaces:**
- Consumes: `NewsArticle`·`Portal`·`SearchResponse`(Task 2), `GET /api/search`(Task 9), `GET /api/og`(Task 10)
- Produces: `relativeTime(iso: string, now?: number): string`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/time.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { relativeTime } from '@/lib/time';

const NOW = new Date('2026-09-02T12:00:00.000Z').getTime();

describe('relativeTime', () => {
  it('1분 미만은 "방금 전"', () => {
    expect(relativeTime('2026-09-02T11:59:30.000Z', NOW)).toBe('방금 전');
  });

  it('분/시간/일 단위로 표시한다', () => {
    expect(relativeTime('2026-09-02T11:55:00.000Z', NOW)).toBe('5분 전');
    expect(relativeTime('2026-09-02T09:00:00.000Z', NOW)).toBe('3시간 전');
    expect(relativeTime('2026-08-31T12:00:00.000Z', NOW)).toBe('2일 전');
  });

  it('7일 이상은 날짜로 표시한다', () => {
    expect(relativeTime('2026-08-01T12:00:00.000Z', NOW)).toMatch(/2026/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/time.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: lib/time.ts 구현**

```ts
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diffMs = now - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/time.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: components/SearchBar.tsx 작성**

```tsx
'use client';

import { useState } from 'react';

export function SearchBar({
  onSearch,
  disabled,
}: {
  onSearch: (query: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query = value.trim();
    if (query) onSearch(query);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="검색어를 입력하세요 (예: 손흥민)"
        className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        검색
      </button>
    </form>
  );
}
```

- [ ] **Step 6: components/ArticleCard.tsx 작성**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { relativeTime } from '@/lib/time';
import type { NewsArticle, Portal } from '@/lib/types';

const PORTAL_LABEL: Record<Portal, string> = { naver: '네이버', daum: '다음', google: '구글' };
const PORTAL_STYLE: Record<Portal, string> = {
  naver: 'bg-green-100 text-green-700',
  daum: 'bg-blue-100 text-blue-700',
  google: 'bg-amber-100 text-amber-700',
};

export function ArticleCard({ article }: { article: NewsArticle }) {
  const [imageUrl, setImageUrl] = useState<string | null>(article.imageUrl ?? null);
  const [imageFailed, setImageFailed] = useState(false);

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
    <li className="rounded-xl border border-gray-200 transition hover:border-gray-300 hover:shadow-sm">
      <a href={article.url} target="_blank" rel="noopener noreferrer" className="flex gap-4 p-4">
        {showImage ? (
          <img
            src={imageUrl}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="h-20 w-28 shrink-0 rounded-lg bg-gray-100 object-cover"
          />
        ) : (
          <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xl font-bold text-gray-400">
            {article.press.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-sm font-semibold text-gray-900">{article.title}</h2>
          {article.summary && (
            <p className="mt-1 line-clamp-2 text-xs text-gray-500">{article.summary}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{article.press}</span>
            <span>·</span>
            <span>{relativeTime(article.publishedAt)}</span>
            {article.portals.map((portal) => (
              <span
                key={portal}
                className={`rounded px-1.5 py-0.5 font-medium ${PORTAL_STYLE[portal]}`}
              >
                {PORTAL_LABEL[portal]}
              </span>
            ))}
          </div>
        </div>
      </a>
    </li>
  );
}
```

- [ ] **Step 7: components/ArticleList.tsx 작성**

```tsx
'use client';

import type { NewsArticle, Portal } from '@/lib/types';
import { ArticleCard } from './ArticleCard';

const PORTAL_LABEL: Record<Portal, string> = { naver: '네이버', daum: '다음', google: '구글' };

export function ArticleList({
  articles,
  failedPortals,
}: {
  articles: NewsArticle[];
  failedPortals: Portal[];
}) {
  return (
    <div>
      {failedPortals.length > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {failedPortals.map((p) => PORTAL_LABEL[p]).join(', ')} 결과를 불러오지 못했어요.
        </p>
      )}
      {articles.length === 0 ? (
        <p className="text-center text-sm text-gray-500">검색 결과가 없어요.</p>
      ) : (
        <ul className="space-y-4">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 8: app/page.tsx 전체 교체**

```tsx
'use client';

import { useState } from 'react';
import { ArticleList } from '@/components/ArticleList';
import { SearchBar } from '@/components/SearchBar';
import type { NewsArticle, Portal, SearchResponse } from '@/lib/types';

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function HomePage() {
  const [status, setStatus] = useState<Status>('idle');
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [failedPortals, setFailedPortals] = useState<Portal[]>([]);

  async function handleSearch(query: string) {
    setStatus('loading');
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
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
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">뉴스 통합 검색</h1>
      <SearchBar onSearch={handleSearch} disabled={status === 'loading'} />
      <div className="mt-6">
        {status === 'idle' && (
          <p className="text-center text-sm text-gray-500">
            검색어를 입력하면 네이버·다음·구글 뉴스를 최신순으로 모아 보여드려요.
          </p>
        )}
        {status === 'loading' && <SkeletonList />}
        {status === 'error' && (
          <p className="text-center text-sm text-red-600">
            검색 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.
          </p>
        )}
        {status === 'done' && <ArticleList articles={articles} failedPortals={failedPortals} />}
      </div>
    </main>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex animate-pulse gap-4 rounded-xl border border-gray-200 p-4">
          <div className="h-20 w-28 shrink-0 rounded-lg bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-gray-200" />
            <div className="h-3 w-full rounded bg-gray-200" />
            <div className="h-3 w-1/3 rounded bg-gray-200" />
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 9: app/layout.tsx 수정** — `<html lang="ko">`, metadata를 아래로 교체 (기존 폰트 설정은 유지):

```tsx
export const metadata: Metadata = {
  title: '뉴스 통합 검색',
  description: '네이버·다음·구글 뉴스를 한 번에 검색',
};
```

- [ ] **Step 10: 수동 검증 (브라우저)**

`npm run dev` 후 브라우저에서:
1. `http://localhost:3000` 접속 → `/login`으로 리다이렉트되는지
2. 로그인 → 검색 페이지 표시
3. "손흥민" 검색 → 스켈레톤 → 카드 리스트 (제목·언론사·포털 배지·상대 시간)
4. 다음 기사에 썸네일 즉시 표시, 네이버/구글 기사에 이미지가 몇 초 내 채워지거나 이니셜 플레이스홀더 유지
5. 카드 클릭 → 원문 새 탭

- [ ] **Step 11: Commit**

```bash
git add lib/time.ts tests/time.test.ts components app/page.tsx app/layout.tsx
git commit -m "feat: 검색 UI와 기사 카드 추가"
```

---

### Task 12: 전체 검증 + README

**Files:**
- Modify: `README.md` (전체 교체)

- [ ] **Step 1: 전체 테스트 + 빌드**

```bash
npm test        # 예상: 모든 테스트 PASS
npm run build   # 예상: 빌드 성공, 타입 오류 없음
npm run lint    # 예상: 오류 없음 (경고는 허용)
```

실패 시 superpowers:systematic-debugging 스킬로 원인을 찾은 뒤 수정한다.

- [ ] **Step 2: README.md 작성**

```markdown
# find-article — 뉴스 통합 검색

검색어를 입력하면 네이버(오픈 API)·구글(뉴스 RSS)·다음(검색결과 파싱)에서
뉴스 기사를 수집해 중복을 합치고 최신순으로 보여주는 사내용 웹앱입니다.
공유 계정 하나로 로그인해야 사용할 수 있습니다.

## 실행 방법

1. 의존성 설치: `npm install`
2. 환경변수 설정: `cp .env.example .env.local` 후 값 입력
   - `AUTH_USER` / `AUTH_PASS`: 로그인 계정
   - `AUTH_SECRET`: 쿠키 서명용 긴 랜덤 문자열 (`openssl rand -hex 32`)
   - `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`:
     [네이버 개발자센터](https://developers.naver.com/apps) → 애플리케이션 등록 →
     "검색" API 선택 후 발급 (무료, 일 25,000회)
3. 개발 서버: `npm run dev`
4. 테스트: `npm test`

## 운영 참고

- 다음 뉴스는 공식 API가 없어 검색결과 HTML을 파싱합니다. 다음이 마크업을
  바꾸면 해당 포털만 결과에서 빠지고 화면에 안내 배너가 뜹니다. 이때는
  `tests/fixtures/daum.html`을 다시 캡처해 `lib/collectors/daum.ts`의
  셀렉터를 갱신하세요 (`docs/superpowers/plans/2026-09-02-news-search.md` Task 8 참고).
- 검색 결과는 2분, 기사 대표 이미지는 24시간 서버 메모리에 캐시됩니다.
- 배포 시 환경변수 5개를 호스팅 서비스에 등록해야 합니다.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README 추가"
```
