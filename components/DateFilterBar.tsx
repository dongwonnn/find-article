'use client';

import { ALL_DATES, DATE_PRESETS, type DateFilterValue } from '@/lib/date-filter';

const CHIP_BASE =
  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none';
const CHIP_ON = 'border-blue-600 bg-blue-600 text-white';
const CHIP_OFF = 'border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900';

const DATE_INPUT =
  'rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none';

export function DateFilterBar({
  value,
  onChange,
}: {
  value: DateFilterValue;
  onChange: (next: DateFilterValue) => void;
}) {
  const custom = value.mode === 'custom';

  return (
    <div className="space-y-2">
      <div role="group" aria-label="기간 필터" className="flex flex-wrap gap-1.5">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.mode}
            type="button"
            // 라디오 그룹 대신 aria-pressed 토글 버튼으로 둔다. 버튼이라 탭 이동과
            // 엔터·스페이스가 그대로 먹고, 스크린리더에는 선택 상태가 읽힌다.
            aria-pressed={value.mode === preset.mode}
            onClick={() => onChange({ mode: preset.mode, start: '', end: '' })}
            className={`${CHIP_BASE} ${value.mode === preset.mode ? CHIP_ON : CHIP_OFF}`}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom}
          aria-expanded={custom}
          aria-controls="date-range-fields"
          // 다시 누르면 '전체'로 되돌린다. 직접 입력 칸만 닫고 필터는 남겨 두면
          // 목록이 왜 줄었는지 화면에서 사라져 버린다.
          onClick={() => onChange(custom ? ALL_DATES : { mode: 'custom', start: '', end: '' })}
          className={`${CHIP_BASE} ${custom ? CHIP_ON : CHIP_OFF}`}
        >
          직접 입력
        </button>
      </div>

      {custom && (
        <div id="date-range-fields" className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            시작일
            <input
              type="date"
              value={value.start}
              max={value.end || undefined}
              onChange={(e) => onChange({ ...value, mode: 'custom', start: e.target.value })}
              className={DATE_INPUT}
            />
          </label>
          <span aria-hidden="true" className="text-gray-300">
            ~
          </span>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            종료일
            <input
              type="date"
              value={value.end}
              min={value.start || undefined}
              onChange={(e) => onChange({ ...value, mode: 'custom', end: e.target.value })}
              className={DATE_INPUT}
            />
          </label>
        </div>
      )}
    </div>
  );
}
