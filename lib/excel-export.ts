// 화면에 보이는 기사 목록을 엑셀 표로 바꾸는 순수 변환. 파일을 만들고 내려받는
// 일은 lib/excel-download.ts가 맡는다(브라우저 API와 엑셀 라이브러리는 그쪽에만 있다).

import { toKstDate } from './date-filter';
import type { NewsArticle } from './types';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 열 순서. 사용자가 요청한 세 칸이 전부다(포털 열은 넣지 않는다). */
export const EXCEL_HEADERS = ['날짜', '언론사', '기사제목'] as const;

/** 엑셀 날짜 셀의 표시 형식. 문자열이 아니라 날짜 셀이라 정렬·필터가 그대로 먹는다. */
export const EXCEL_DATE_FORMAT = 'yyyy-mm-dd hh:mm';

export interface ExcelRow {
  /**
   * 엑셀의 날짜 셀에는 시간대 개념이 없다. 저장되는 값은 '기준일로부터 며칠째'라는
   * 숫자뿐이라, 셀에 KST 벽시계가 보이게 하려면 UTC 시각을 +9시간 민 Date를 넘겨야
   * 한다(엑셀 라이브러리가 Date를 UTC 기준 일련번호로 바꾸기 때문에, 이렇게 밀면
   * 밀어 둔 만큼이 그대로 표시값이 된다). 이 Date를 다시 시각으로 읽으면 9시간
   * 어긋나므로 오직 셀에 쓰는 용도로만 쓴다.
   * 시각을 해석할 수 없는 기사는 1970년을 찍는 대신 빈 칸으로 둔다.
   */
  date: Date | null;
  press: string;
  title: string;
  /** 기사제목 셀에 거는 하이퍼링크 대상. CSV가 아니라 xlsx를 쓰는 이유다. */
  url: string;
}

/** 기사 한 건을 엑셀 한 줄로 옮긴다. */
export function toExcelRow(article: NewsArticle): ExcelRow {
  const ms = Date.parse(article.publishedAt);
  return {
    date: Number.isNaN(ms) ? null : new Date(ms + KST_OFFSET_MS),
    press: article.press,
    title: article.title,
    url: article.url,
  };
}

export function toExcelRows(articles: NewsArticle[]): ExcelRow[] {
  return articles.map(toExcelRow);
}

// 윈도우·맥이 파일명에 허용하지 않는 문자. 검색어가 그대로 파일명이 되기 때문에
// '삼성전자/LG' 같은 입력이 경로 구분자로 새지 않게 먼저 털어낸다.
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;
// 제어문자(\p{Cc})도 함께 턴다. 정규식 안에 제어문자를 직접 적지 않으려고
// 유니코드 속성 이스케이프를 쓴다.
const CONTROL_CHARS = /\p{Cc}/gu;

/** 검색어와 날짜(KST)로 파일명을 만든다. 예: `손흥민_뉴스_20260903.xlsx` */
export function toExcelFileName(query: string, now: Date = new Date()): string {
  const stamp = toKstDate(now.toISOString()).replaceAll('-', '');
  const safe = query
    .replace(ILLEGAL_FILENAME_CHARS, '')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, '_')
    // 앞뒤의 점·공백은 윈도우가 조용히 잘라내고, 맨 앞의 점은 숨김 파일이 된다.
    .replace(/^[._]+|[._\s]+$/g, '')
    // 파일명 길이 제한(255바이트)에 한글이 먼저 닿는다. 넉넉히 잘라 둔다.
    .slice(0, 40);
  return `${safe || '검색결과'}_뉴스_${stamp}.xlsx`;
}
