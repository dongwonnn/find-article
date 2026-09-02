import { describe, expect, it } from 'vitest';
import { stripHtml } from '@/lib/text';

describe('stripHtml', () => {
  it('태그를 제거한다', () => {
    expect(stripHtml('<b>손흥민</b> 10호골')).toBe('손흥민 10호골');
  });

  it('HTML 엔티티를 디코드한다', () => {
    expect(stripHtml('&quot;대단해&quot; &amp; &lt;멋져&gt;')).toBe('"대단해" & <멋져>');
  });

  it('앞뒤 공백을 정리한다', () => {
    expect(stripHtml('  <p> 제목 </p>  ')).toBe('제목');
  });
});
