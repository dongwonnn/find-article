// 엑셀 파일 생성과 내려받기. 브라우저에서만 돈다 — 서버 라우트를 두면 이미
// 브라우저에 있는 데이터를 도로 올려보내는 셈이고, 엣지 런타임 CPU 제한도 걸린다.
//
// 행을 만드는 순수 로직은 lib/excel-export.ts에 있고 여기는 배관만 담당한다.

import { EXCEL_DATE_FORMAT, EXCEL_HEADERS, toExcelFileName, toExcelRows } from './excel-export';
import type { NewsArticle } from './types';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 엑셀 열 너비(문자 수). 제목은 길어서 넉넉히 준다. */
const COLUMN_WIDTHS = [20, 18, 80];

/** 하이퍼링크 셀에 쓰는 엑셀 기본 링크 색(ARGB). */
const LINK_COLOR = 'FF0563C1';

export async function downloadArticlesXlsx(
  articles: NewsArticle[],
  query: string,
  now: Date = new Date(),
): Promise<void> {
  const rows = toExcelRows(articles);
  if (rows.length === 0) return;

  // 1MB에 가까운 라이브러리라 첫 화면 번들에 넣지 않는다. 버튼을 누른 사람만 받는다.
  // (next.config.ts에서 브라우저용 단일 번들로 별칭을 걸어 뒀다 — node 내장 모듈을
  //  끌고 오지 않아야 Cloudflare Workers 빌드가 깨지지 않는다.)
  const mod = await import('exceljs');
  // UMD 번들이라 번들러에 따라 네임스페이스가 그대로 오기도, default에 담겨 오기도 한다.
  const ExcelJS = mod.default ?? mod;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('뉴스');
  sheet.columns = EXCEL_HEADERS.map((header, i) => ({ header, width: COLUMN_WIDTHS[i] }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const added = sheet.addRow([row.date, row.press, row.title]);
    // 날짜를 문자열이 아니라 날짜 셀로 넣어야 엑셀에서 정렬·필터가 먹는다.
    added.getCell(1).numFmt = EXCEL_DATE_FORMAT;
    // 제목 셀에 원문 링크를 건다. CSV로는 못 하는 일이라 xlsx를 쓴다.
    const titleCell = added.getCell(3);
    titleCell.value = { text: row.title, hyperlink: row.url };
    titleCell.font = { color: { argb: LINK_COLOR }, underline: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(new Blob([buffer], { type: XLSX_MIME }), toExcelFileName(query, now));
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // 바로 해제하면 브라우저가 아직 읽는 중일 수 있다. 한 틱 뒤에 정리한다.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
