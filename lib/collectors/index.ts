import type { NewsArticle, Portal } from '../types';
import { collectDaum } from './daum';
import { collectNaver } from './naver';

export type Collector = (query: string) => Promise<NewsArticle[]>;
export type Collectors = Partial<Record<Portal, Collector>>;

// 구글은 뺐다. Cloudflare IP에서 503으로 막혀 매 검색마다 실패 배너만 띄웠다
// (로컬에서는 잘 됐다 — 데이터센터 IP가 걸러진다).
// Portal 타입에는 셋 다 남겨 둬서 되살릴 때 수집기만 다시 끼우면 된다.
const DEFAULT_COLLECTORS: Collectors = {
  naver: collectNaver,
  daum: collectDaum,
};

function reasonOf(error: unknown): string {
  if (error instanceof Error) {
    // AbortSignal.timeout이 던지는 TimeoutError는 message가 비어 있어 이름을 쓴다.
    return error.message || error.name;
  }
  return String(error);
}

export async function collectAll(
  query: string,
  collectors: Collectors = DEFAULT_COLLECTORS,
): Promise<{
  lists: NewsArticle[][];
  failedPortals: Portal[];
  failureReasons: Partial<Record<Portal, string>>;
}> {
  const portals = Object.keys(collectors) as Portal[];
  const settled = await Promise.allSettled(portals.map((p) => collectors[p]!(query)));

  const lists: NewsArticle[][] = [];
  const failedPortals: Portal[] = [];
  // 서버 로그를 볼 수 없는 배포 환경(엣지)에서도 어느 포털이 왜 빠졌는지
  // 알 수 있어야 해서 응답에 이유를 함께 싣는다. 사내 인증 뒤에만 노출된다.
  const failureReasons: Partial<Record<Portal, string>> = {};
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      lists.push(result.value);
    } else {
      failedPortals.push(portals[i]);
      failureReasons[portals[i]] = reasonOf(result.reason);
      console.error(`[collect] ${portals[i]} 수집 실패:`, result.reason);
    }
  });
  return { lists, failedPortals, failureReasons };
}
