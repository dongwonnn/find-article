# 뉴스 통합 검색 (find-article) 설계

2026-09-02 승인됨.

## 목적

회사 내 소수 사용자가 검색어(예: "손흥민")를 입력하면 네이버·다음·구글 뉴스의 기사를
한 화면에서 최신순으로 모아 보는 웹앱. 공유 계정 1개로 로그인해야 입장 가능.

## 요구사항

- 검색어 입력 → 세 포털(네이버, 다음, 구글)에서 뉴스 기사 수집.
- 기사마다 표시: 대표 이미지, 제목, 요약, 언론사명, 출처 포털 배지, 게시 시각(상대 시간).
- 최신순 정렬. 같은 기사가 여러 포털에서 나오면 하나로 합치고 포털 배지를 여러 개 표시.
- 아이디/비밀번호(공유 계정 1개) 로그인 필수.
- 사용량은 적음(사내 소수 인원). Vercel류 클라우드에 배포.

## 기술 스택

- Next.js 최신 안정판 (App Router), TypeScript 최신 안정판, Tailwind CSS.
  (요청의 "TypeScript 7"은 미출시 버전이므로 최신 안정판 사용으로 합의됨.)
- `cheerio` — 다음 검색결과 HTML 파싱.
- `fast-xml-parser` — 구글 뉴스 RSS 파싱.
- Vitest — 단위 테스트.

## 아키텍처

```
[검색창] → GET /api/search?q=<검색어>
              ├─ 네이버 수집기 (공식 오픈 API, sort=date, display=20)
              ├─ 구글 수집기  (news.google.com RSS, hl=ko)
              └─ 다음 수집기  (search.daum.net?w=news&sort=recency HTML)
              ↓ Promise.allSettled — 한 포털이 실패해도 나머지는 반환
          정규화 → 중복 합침 → 최신순 정렬 → JSON 응답
```

- 동일 검색어 서버 메모리 캐시 2분 TTL.
- 수집기 공통 인터페이스: `(query: string) => Promise<NewsArticle[]>`, 타임아웃 5초.

### 이미지 전략

- 다음: 검색결과에 썸네일 포함 → 즉시 표시.
- 네이버/구글: 이미지 미제공 → 목록을 먼저 응답하고, 각 카드가
  `GET /api/og?url=<기사URL>`로 기사 페이지의 `og:image`를 지연 로드.
  서버 메모리 캐시 24시간 TTL. 실패 시 언론사 이니셜 플레이스홀더.

## 데이터 모델

```ts
type Portal = 'naver' | 'daum' | 'google';

interface NewsArticle {
  id: string;              // 정규화된 URL의 해시
  title: string;
  summary?: string;
  url: string;             // 기사 원문 링크
  press: string;           // 언론사명 (예: 연합뉴스)
  portals: Portal[];       // 출처 포털 배지 (중복 합침 시 여러 개)
  publishedAt: string;     // ISO 8601
  imageUrl?: string;       // 있으면 즉시 표시, 없으면 og 지연 로드
}
```

- 중복 판정: URL 정규화(프로토콜/쿼리스트링/트레일링 슬래시 제거) 일치, 또는
  제목 정규화(공백·특수문자 제거) 일치. 합칠 때 이미지·요약은 있는 쪽을 채택,
  `publishedAt`은 더 이른 시각을 채택.
- 네이버 API는 언론사명을 주지 않음 → 원문(originallink) 도메인 → 언론사명
  매핑 테이블(주요 언론사 약 50개) + 미등록 도메인은 도메인 문자열 그대로 표시.

## 인증

- 환경변수: `AUTH_USER`, `AUTH_PASS`, `AUTH_SECRET`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`.
- `/login` 폼 → 일치 시 HMAC-SHA256 서명 값을 담은 httpOnly·secure 쿠키 발급, 7일 유효.
- `middleware.ts`가 쿠키 검증. 미인증 페이지 요청 → `/login` 리다이렉트,
  미인증 API 요청 → 401.

## UI

- `/login`: 아이디/비밀번호 입력 카드. 실패 시 인라인 오류 메시지.
- `/`: 상단 고정 검색창. 검색 시 기사 카드 리스트.
  - 카드: 대표 이미지(좌) · 제목/요약(우) · 언론사명 · 포털 배지(N/D/G 색상) · 상대 시간.
  - 카드 클릭 시 기사 원문 새 탭.
  - 로딩 스켈레톤 / 결과 없음 안내 / 포털별 실패 배너("다음 결과를 불러오지 못했어요").
  - 포털별 20건 → 합쳐 최대 약 60건 단일 리스트. 페이지네이션 없음(필요 시 추후).

## 에러 처리

- 수집기별 독립 실패: `Promise.allSettled`로 실패 포털만 누락, 응답에
  `failedPortals: Portal[]` 포함 → UI 배너 표시.
- og:image 추출 실패/타임아웃(3초): 플레이스홀더 표시, 캐시에 실패도 기록(재시도 폭주 방지).

## 테스트 (Vitest)

- 수집기 파싱 로직: 저장된 fixture(네이버 JSON, 구글 RSS XML, 다음 HTML)를 입력으로 단위 테스트.
- 중복 합침·최신순 정렬 로직 단위 테스트.
- og:image 추출(HTML → meta 태그) 단위 테스트.
- 인증 쿠키 서명/검증 단위 테스트.

## 범위 제외 (YAGNI)

- 유저별 계정, 검색 기록 저장, 페이지네이션, 다크모드, DB.
