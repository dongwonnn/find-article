# find-article — 뉴스 통합 검색

검색어를 입력하면 네이버(검색결과 파싱)·구글(뉴스 RSS)·다음(검색결과 파싱)에서
뉴스 기사를 수집해 중복을 합치고 최신순으로 보여주는 사내용 웹앱입니다.
공유 계정 하나로 로그인해야 사용할 수 있습니다. 포털 API 키는 필요 없습니다.

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
- `app/api/og` — 대표 이미지가 없는 기사를 위해 원문 페이지의
  `og:image`를 지연 조회하는 API. SSRF 방지를 위해 내부망 주소와 리다이렉트
  체인을 검증하고, 결과를 24시간 캐시한다.
- `components/` — `SearchBar`, `ArticleList`, `ArticleCard` 등 화면 구성 요소.

## 실행 방법

1. 의존성 설치: `npm install`
2. 환경변수 설정: `cp .env.example .env.local` 후 값 입력
   - `AUTH_USER` / `AUTH_PASS`: 로그인 계정
   - `AUTH_SECRET`: 쿠키 서명용 긴 랜덤 문자열 (`openssl rand -hex 32`)

   세 개가 전부다. 세 포털 모두 API 키 없이 동작한다.
3. 개발 서버: `npm run dev`
4. 테스트: `npm test`

## 운영 참고

- 네이버 뉴스도 다음과 마찬가지로 **검색결과를 파싱한다**. 공식 검색 API는
  2026-07-31자로 [네이버 개발자센터](https://developers.naver.com)에서 신규 발급이
  끝나고 유료 클라우드 계정(NAVER API HUB)으로 이관돼서, 키가 필요 없는 방향으로
  갈아탔다. 네이버 뉴스탭은 결과를 클라이언트에서 그리기 때문에 검색 페이지 HTML을
  받아봐야 기사가 없고, 대신 그 페이지가 호출하는 내부 엔드포인트
  (`s.search.naver.com/p/newssearch/3/api/tab/more`, `sort=1`이 최신순)를
  그대로 호출해 응답 JSON의 `collection[0].html` 조각을 파싱한다.
  **공식 API가 아니므로 네이버가 마크업을 바꾸면 언제든 깨질 수 있다.**
  클래스 상당수가 빌드 해시(`fender-ui_228e3bd1`)라 셀렉터로 쓰지 않았고,
  클릭 로깅용 `data-heatmap-target`(`.tit`/`.body`/`.img`)과 디자인 시스템의
  `sds-comps-*` 의미 클래스만 썼다. 근거는 `lib/collectors/naver.ts` 주석에 있다.
  깨졌는지 확인하는 방법은 다음과 같다 — `tests/naver.test.ts`가
  `tests/fixtures/naver-search.json`(실제 응답을 그대로 저장한 것)을 상대로
  셀렉터를 검증하고, 특히 시각·언론사 셀렉터가 폴백값(epoch, `'네이버 뉴스'`)으로
  조용히 넘어가는 경우까지 잡아낸다. 마크업 변경이 의심되면 fixture를 다시 캡처하고
  `npm test`를 돌리면 어디가 깨졌는지 바로 보인다. 운영 중에는 파싱 결과가 0건인데
  응답에 기사 목록이 남아 있으면(=검색 결과 없음이 아니라 마크업 변경) 수집기가
  실패를 올려 화면에 안내 배너가 뜬다.
- 다음 뉴스는 공식 API가 없어 검색결과 HTML을 파싱한다. 셀렉터 근거와 실제
  마크업 구조(언론사·시간·썸네일이 각각 어느 요소에 있는지)는
  `lib/collectors/daum.ts`의 주석에 정리되어 있고, 배경은
  `docs/superpowers/plans/2026-09-02-news-search.md` Task 8에도 있다. 다만
  실제 마크업은 계획 문서가 예상한 두 세대(`div.c-item-doc`, `ul.list_news > li`)가
  아니라 `ul.c-list-basic > li[data-docid]` 구조의 세 번째 세대였다 — 마크업은
  또 바뀔 수 있다.
  다음이 마크업을 바꾸면 해당 포털만 결과에서 빠지고 화면에 안내 배너가 뜬다.
  `tests/daum.test.ts`에는 시간·언론사 셀렉터가 깨지면 폴백값(epoch,
  `'다음 뉴스'`)으로 조용히 넘어가지 않고 실패하는 회귀 테스트가 있으므로,
  변경이 의심되면 `tests/fixtures/daum.html`을 다시 캡처하고 `npm test`를
  돌려 어디가 깨졌는지 바로 확인할 수 있다.
- 구글 결과는 `news.google.com` 리다이렉트 링크라 대표 이미지를 가져오지
  않고 플레이스홀더로 둔다(구글이 기사 사진 대신 자사 로고를 내려주기
  때문이다). 다음·네이버는 원문 도메인 링크라 이 문제가 없다.
- 검색 결과는 2분, 기사 대표 이미지는 24시간 서버 메모리에 캐시된다.
- 배포 시 환경변수 3개(`AUTH_USER`, `AUTH_PASS`, `AUTH_SECRET`)를
  호스팅 서비스에 등록해야 한다. 포털 수집기가 쓰는 키는 없다.
