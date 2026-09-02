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
