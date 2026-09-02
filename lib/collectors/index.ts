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
