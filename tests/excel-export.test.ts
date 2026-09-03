import { describe, expect, it } from 'vitest';
import {
  EXCEL_HEADERS,
  toExcelFileName,
  toExcelRow,
  toExcelRows,
} from '@/lib/excel-export';
import type { NewsArticle } from '@/lib/types';

const ARTICLE: NewsArticle = {
  id: 'a1',
  title: '‘N% 성과급’은 빠졌지만… “신기술로 고용변화 땐 쟁의”',
  summary: '요약은 엑셀에 넣지 않는다',
  url: 'https://www.segye.com/newsView/20260902512345',
  press: '세계일보',
  portals: ['naver', 'daum'],
  publishedAt: '2026-09-02T14:30:00.000Z', // KST 2026-09-02 23:30
  imageUrl: 'https://img.example.com/1.jpg',
};

describe('toExcelRow', () => {
  it('요청받은 세 칸(날짜·언론사·기사제목)만 만든다', () => {
    expect(EXCEL_HEADERS).toEqual(['날짜', '언론사', '기사제목']);
    // 포털 열은 넣지 않기로 했다. 행 객체에도 포털이 없어야 한다.
    expect(Object.keys(toExcelRow(ARTICLE))).toEqual(['date', 'press', 'title', 'url']);
  });

  it('날짜 셀은 KST 벽시계를 그대로 보여준다', () => {
    const { date } = toExcelRow(ARTICLE);
    // 엑셀 날짜 셀에는 시간대가 없어서 +9시간 민 Date를 넣는다. 그 Date를 UTC로
    // 읽은 값이 곧 엑셀에 찍히는 글자다. UTC 그대로 넣었다면 09-02 14:30이 되어
    // 하루가 통째로 어긋나 보인다.
    expect(date?.toISOString()).toBe('2026-09-02T23:30:00.000Z');
  });

  it('KST 자정을 넘긴 기사는 다음 날짜로 찍힌다', () => {
    const midnight = { ...ARTICLE, publishedAt: '2026-09-02T15:00:00.000Z' };
    expect(toExcelRow(midnight).date?.toISOString()).toBe('2026-09-03T00:00:00.000Z');
  });

  it('기사제목 셀의 링크는 원문 URL을 가리킨다', () => {
    const row = toExcelRow(ARTICLE);
    expect(row.title).toBe(ARTICLE.title);
    expect(row.url).toBe('https://www.segye.com/newsView/20260902512345');
  });

  it('언론사를 그대로 옮긴다', () => {
    expect(toExcelRow(ARTICLE).press).toBe('세계일보');
  });

  it('시각을 해석할 수 없으면 1970년 대신 빈 칸을 둔다', () => {
    expect(toExcelRow({ ...ARTICLE, publishedAt: '???' }).date).toBeNull();
  });

  it('목록 순서를 그대로 유지한다', () => {
    const second: NewsArticle = { ...ARTICLE, id: 'a2', title: '두 번째' };
    expect(toExcelRows([ARTICLE, second]).map((r) => r.title)).toEqual([ARTICLE.title, '두 번째']);
  });
});

describe('toExcelFileName', () => {
  const NOW = new Date('2026-09-02T15:30:00.000Z'); // KST 09-03 00:30

  it('검색어와 KST 날짜를 담는다', () => {
    expect(toExcelFileName('손흥민', NOW)).toBe('손흥민_뉴스_20260903.xlsx');
  });

  it('파일명에 못 쓰는 문자를 털어낸다', () => {
    expect(toExcelFileName('삼성전자/LG:"엘지"', NOW)).toBe('삼성전자LG엘지_뉴스_20260903.xlsx');
    expect(toExcelFileName('a\\b*c?d<e>f|g', NOW)).toBe('abcdefg_뉴스_20260903.xlsx');
  });

  it('공백은 밑줄로 바꾸고 앞뒤 점·공백은 떼어낸다', () => {
    expect(toExcelFileName('  손흥민 토트넘  ', NOW)).toBe('손흥민_토트넘_뉴스_20260903.xlsx');
    expect(toExcelFileName('...비밀', NOW)).toBe('비밀_뉴스_20260903.xlsx');
  });

  it('털어내고 남은 게 없으면 기본 이름을 쓴다', () => {
    expect(toExcelFileName('///', NOW)).toBe('검색결과_뉴스_20260903.xlsx');
  });

  it('아주 긴 검색어는 잘라 낸다', () => {
    const name = toExcelFileName('가'.repeat(200), NOW);
    expect(name).toBe(`${'가'.repeat(40)}_뉴스_20260903.xlsx`);
  });
});
