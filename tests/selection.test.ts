import { describe, expect, it } from 'vitest';
import {
  allSelected,
  isSelected,
  NOTHING_EXCLUDED,
  selectedArticles,
  setAllSelected,
  setSelected,
} from '@/lib/selection';
import type { NewsArticle } from '@/lib/types';

function article(id: string): NewsArticle {
  return {
    id,
    title: `기사 ${id}`,
    url: `https://example.com/${id}`,
    press: '세계일보',
    portals: ['naver'],
    publishedAt: '2026-09-02T14:30:00.000Z',
  };
}

const ARTICLES = [article('a1'), article('a2'), article('a3')];

describe('selection', () => {
  it('아무것도 해제하지 않았으면 전부 체크된 상태다', () => {
    expect(isSelected(NOTHING_EXCLUDED, 'a1')).toBe(true);
    expect(selectedArticles(ARTICLES, NOTHING_EXCLUDED)).toEqual(ARTICLES);
    expect(allSelected(ARTICLES, NOTHING_EXCLUDED)).toBe(true);
  });

  it('해제한 기사는 엑셀 대상에서 빠진다', () => {
    const excluded = setSelected(NOTHING_EXCLUDED, 'a2', false);
    expect(selectedArticles(ARTICLES, excluded).map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(allSelected(ARTICLES, excluded)).toBe(false);
  });

  it('다시 체크하면 되돌아온다', () => {
    const off = setSelected(NOTHING_EXCLUDED, 'a2', false);
    const on = setSelected(off, 'a2', true);
    expect(selectedArticles(ARTICLES, on)).toEqual(ARTICLES);
  });

  it('원본 집합을 바꾸지 않는다', () => {
    const before = setSelected(NOTHING_EXCLUDED, 'a1', false);
    setSelected(before, 'a2', false);
    expect([...before]).toEqual(['a1']);
  });

  it('남은 순서는 관련도순 그대로다', () => {
    const excluded = setSelected(NOTHING_EXCLUDED, 'a1', false);
    expect(selectedArticles(ARTICLES, excluded).map((a) => a.id)).toEqual(['a2', 'a3']);
  });

  it('전체 해제·전체 선택이 한 번에 먹는다', () => {
    const none = setAllSelected(ARTICLES, NOTHING_EXCLUDED, false);
    expect(selectedArticles(ARTICLES, none)).toEqual([]);
    expect(selectedArticles(ARTICLES, setAllSelected(ARTICLES, none, true))).toEqual(ARTICLES);
  });

  it('전체 선택·해제는 화면에 보이는 기사만 건드린다', () => {
    // a3는 날짜 필터에 걸려 지금 화면에 없다. 전체 해제를 눌러도 손대지 않는다.
    const visible = [article('a1'), article('a2')];
    const excluded = setAllSelected(visible, NOTHING_EXCLUDED, false);
    expect(isSelected(excluded, 'a3')).toBe(true);
  });

  it('보이지 않는 기사의 해제 상태는 필터를 되돌려도 살아 있다', () => {
    const excluded = setSelected(NOTHING_EXCLUDED, 'a3', false);
    const visible = [article('a1'), article('a2')];
    const next = setAllSelected(visible, excluded, true);
    expect(isSelected(next, 'a3')).toBe(false);
  });
});
