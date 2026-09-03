// 이미 받아 온 기사 목록을 날짜로 걸러 낸다. 포털을 다시 부르지 않는다.
//
// 경계는 전부 KST(Asia/Seoul) 기준이다. publishedAt은 UTC ISO라서 UTC로 자르면
// '오늘'이 한국 시간 오전 9시에 시작하고, 브라우저 로컬 시간으로 자르면 사용자가
// 어느 나라에 있느냐에 따라 결과가 달라진다. 둘 다 자정 근처 기사를 9시간씩
// 옮겨 놓는데 화면에는 아무 티가 나지 않아서, 여기서는 로컬 시간대를 읽는 API를
// 일절 쓰지 않고 UTC 게터 + 고정 오프셋으로만 계산한다.
// (한국은 1988년 이후 서머타임이 없어 오프셋이 +09:00으로 고정이다.)

import type { NewsArticle } from './types';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DateFilterMode = 'all' | 'today' | 'days3' | 'week' | 'custom';

export interface DateFilterValue {
  mode: DateFilterMode;
  /** 'YYYY-MM-DD'(KST). mode가 'custom'일 때만 쓴다. 빈 문자열이면 그쪽 경계를 열어 둔다. */
  start: string;
  end: string;
}

export const ALL_DATES: DateFilterValue = { mode: 'all', start: '', end: '' };

/** 프리셋이 덮는 날짜 수(오늘 포함). '3일'은 그저께·어제·오늘이다. */
const PRESET_DAYS = { today: 1, days3: 3, week: 7 } as const;

export const DATE_PRESETS: { mode: DateFilterMode; label: string }[] = [
  { mode: 'all', label: '전체' },
  { mode: 'today', label: '오늘' },
  { mode: 'days3', label: '3일' },
  { mode: 'week', label: '1주' },
];

/** UTC ISO 시각이 KST로 며칠인지를 'YYYY-MM-DD'로 돌려준다. 해석 불가면 빈 문자열. */
export function toKstDate(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  // +9시간 민 값을 UTC로 읽으면 그게 곧 KST 벽시계다. toISOString은 로컬
  // 시간대를 타지 않으므로 어느 브라우저에서 돌려도 같은 답이 나온다.
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD'(KST) 하루가 시작하는 순간의 epoch ms. 형식이 틀리면 NaN. */
function kstDayStartMs(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  return Date.parse(`${date}T00:00:00+09:00`);
}

/**
 * 필터를 [from, to) 반열린 구간(epoch ms)으로 바꾼다. 경계가 없으면 ±Infinity다.
 * 끝을 '다음 날 0시 직전'이 아니라 '다음 날 0시 미만'으로 잡아 23:59:59.999와
 * 23:59:59.9995 사이로 새는 기사가 없게 한다.
 */
export function toDateRange(
  value: DateFilterValue,
  now: Date = new Date(),
): { from: number; to: number } {
  if (value.mode === 'custom') {
    let { start, end } = value;
    // 'YYYY-MM-DD'는 사전순 비교가 곧 시간순 비교다. 시작·종료를 거꾸로 넣으면
    // 0건이 나오는데 화면만 봐서는 원인을 알 수 없으니, 뒤집힌 입력은 바꿔 읽는다.
    if (start && end && start > end) [start, end] = [end, start];
    const from = start ? kstDayStartMs(start) : NaN;
    const to = end ? kstDayStartMs(end) + DAY_MS : NaN;
    // 아직 다 입력하지 않았거나 형식이 깨진 날짜는 그쪽 경계를 열어 둔다.
    // 목록이 통째로 비어 버리면 사용자가 필터를 의심하지 못한다.
    return {
      from: Number.isNaN(from) ? -Infinity : from,
      to: Number.isNaN(to) ? Infinity : to,
    };
  }

  if (value.mode === 'all') return { from: -Infinity, to: Infinity };

  const todayStart = kstDayStartMs(toKstDate(now.toISOString()));
  const days = PRESET_DAYS[value.mode];
  return { from: todayStart - (days - 1) * DAY_MS, to: todayStart + DAY_MS };
}

/** 기간에 드는 기사만 남긴다. 원본 순서(관련도순)는 그대로 둔다. */
export function filterArticlesByDate(
  articles: NewsArticle[],
  value: DateFilterValue,
  now: Date = new Date(),
): NewsArticle[] {
  const { from, to } = toDateRange(value, now);
  if (from === -Infinity && to === Infinity) return articles;
  return articles.filter((article) => {
    const ms = Date.parse(article.publishedAt);
    return !Number.isNaN(ms) && ms >= from && ms < to;
  });
}
