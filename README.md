# find-article — 뉴스 통합 검색

검색어를 입력하면 네이버(오픈 API)·구글(뉴스 RSS)·다음(검색결과 파싱)에서
뉴스 기사를 수집해 중복을 합치고 최신순으로 보여주는 사내용 웹앱입니다.
공유 계정 하나로 로그인해야 사용할 수 있습니다.

## 구조

- `lib/collectors/` — 포털별 수집기(`naver.ts`, `daum.ts`, `google.ts`)와
  이를 병렬로 호출하는 오케스트레이터(`index.ts`의 `collectAll`).
  한 포털이 실패해도 나머지 결과는 그대로 반환한다(`Promise.allSettled`).
- `lib/merge.ts` — 여러 포털 결과를 URL·제목 기준으로 중복 제거하고
  최신순으로 정렬한다(`mergeArticles`).
- `lib/cache.ts` — 메모리 TTL 캐시(`TtlCache`). 검색 결과와 대표 이미지 캐시에 쓰인다.
- `lib/auth.ts` + `proxy.ts` — 공유 계정 로그인. `lib/auth.ts`가 HMAC 서명 토큰을
  발급·검증하고(`app/api/login`이 로그인 처리), `proxy.ts`(Next.js 16부터
  `middleware.ts`가 아니라 `proxy.ts`로 이름이 바뀌었다)가 모든 요청 앞단에서
  쿠키를 검사해 미인증 요청을 `/login`(API는 401)으로 돌려보낸다.
- `app/api/search` — 검색 API. `collectAll` + `mergeArticles`를 호출하고
  전 포털이 성공한 결과만 2분간 캐시한다.
- `app/api/og` — 대표 이미지가 없는 기사(네이버·구글)를 위해 원문 페이지의
  `og:image`를 지연 조회하는 API. SSRF 방지를 위해 내부망 주소와 리다이렉트
  체인을 검증하고, 결과를 24시간 캐시한다.
- `components/` — `SearchBar`, `ArticleList`, `ArticleCard` 등 화면 구성 요소.

## 실행 방법

1. 의존성 설치: `npm install`
2. 환경변수 설정: `cp .env.example .env.local` 후 값 입력
   - `AUTH_USER` / `AUTH_PASS`: 로그인 계정
   - `AUTH_SECRET`: 쿠키 서명용 긴 랜덤 문자열 (`openssl rand -hex 32`)
   - `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`:
     [네이버 개발자센터](https://developers.naver.com/apps)에서 로그인 →
     "Application 등록" → 사용 API에서 "검색" 체크 → 비로그인 오픈 API
     서비스 환경 등록(웹 서비스 URL은 배포 주소, 로컬 개발 중이면
     `http://localhost:3000`처럼 아무 값이나 입력 가능) → 등록 완료 후
     발급되는 Client ID / Client Secret을 입력 (무료, 일 25,000회 한도)
3. 개발 서버: `npm run dev`
4. 테스트: `npm test`

네이버 키를 아직 등록하지 않았다면 네이버 포털만 `failedPortals`로 빠지고
다음·구글 결과는 정상적으로 나온다 — 이는 오류가 아니라 의도된 동작이다.

## 운영 참고

- 다음 뉴스는 공식 API가 없어 검색결과 HTML을 파싱한다. 셀렉터 근거와 실제
  마크업 구조(언론사·시간·썸네일이 각각 어느 요소에 있는지)는
  `lib/collectors/daum.ts`의 주석에 정리되어 있고, 배경은
  `docs/superpowers/plans/2026-09-02-news-search.md` Task 8에도 있다. 다만
  실제 마크업은 계획 문서가 예상한 두 세대(`div.c-item-doc`, `ul.list_news > li`)가
  아니라 `ul.c-list-basic > li[data-docid]` 구조의 세 번째 세대였다 — 마크업은
  또 바뀔 수 있다.
  다음이 마크업을 바꾸면 해당 포털만 결과에서 빠지고 화면에 안내 배너가 뜬다.
  `tests/daum.test.ts`에는 시간·언론사 셀렉터가 깨지면 폴백값(`now`,
  `'다음 뉴스'`)으로 조용히 넘어가지 않고 실패하는 회귀 테스트가 있으므로,
  변경이 의심되면 `tests/fixtures/daum.html`을 다시 캡처하고 `npm test`를
  돌려 어디가 깨졌는지 바로 확인할 수 있다.
- 구글 결과는 `news.google.com` 리다이렉트 링크라 대표 이미지를 가져오지
  않고 플레이스홀더로 둔다(구글이 기사 사진 대신 자사 로고를 내려주기
  때문이다). 다음·네이버는 원문 도메인 링크라 이 문제가 없다.
- 검색 결과는 2분, 기사 대표 이미지는 24시간 서버 메모리에 캐시된다.
- 배포 시 환경변수 5개(`AUTH_USER`, `AUTH_PASS`, `AUTH_SECRET`,
  `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`)를 호스팅 서비스에 등록해야 한다.
