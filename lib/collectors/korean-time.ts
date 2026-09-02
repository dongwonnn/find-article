// 네이버·다음 검색결과가 기사 시각에 쓰는 한국어 표기를 ISO 8601로 바꾼다.
// 두 포털의 표기 체계가 같아서(N분/시간/일/주/개월 전, 어제, 그리고 오래된
// 기사의 절대 날짜 'YYYY.M.D.') 수집기마다 따로 두지 않고 여기 모았다.

/** 해석에 실패했을 때 쓰는 값. epoch인 이유는 parseKoreanTime 주석 참고. */
export const EPOCH_ISO = new Date(0).toISOString();

export function parseKoreanTime(text: string, now: Date): string {
  const t = text.trim();
  let m = t.match(/^(\d+)분\s*전$/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 60_000).toISOString();
  m = t.match(/^(\d+)시간\s*전$/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 3_600_000).toISOString();
  m = t.match(/^(\d+)일\s*전$/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 86_400_000).toISOString();
  m = t.match(/^(\d+)주\s*전$/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 7 * 86_400_000).toISOString();
  m = t.match(/^(\d+)개월\s*전$/);
  if (m) return new Date(now.getTime() - Number(m[1]) * 30 * 86_400_000).toISOString();
  if (t === '어제') return new Date(now.getTime() - 86_400_000).toISOString();
  if (t === '방금전' || t === '방금 전') return now.toISOString();
  // 포털이 표시하는 절대 날짜는 KST 기준이다. 네이버는 '2026.08.02.',
  // 다음은 '2026.8.2.'처럼 자리수만 다르게 쓴다.
  m = t.match(/^(\d{4})\.\s?(\d{1,2})\.\s?(\d{1,2})\.?$/);
  if (m) {
    const [, y, mo, d] = m;
    return new Date(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00+09:00`).toISOString();
  }
  // 모르는 형식은 now가 아니라 epoch로 떨어뜨린다. now로 두면 시각을 못 읽은
  // 기사가 최신순 목록 맨 앞을 차지해 정렬이 조용히 망가진다.
  return EPOCH_ISO;
}
