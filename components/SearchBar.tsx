'use client';

import { useState } from 'react';

export function SearchBar({
  onSearch,
  disabled,
}: {
  onSearch: (query: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query = value.trim();
    if (query) onSearch(query);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2" role="search">
      <div className="relative flex-1">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-gray-400"
        >
          <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M13.2 13.2 17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="검색어를 입력하세요 (예: 손흥민)"
          aria-label="검색어"
          enterKeyHint="search"
          autoFocus
          className="w-full rounded-xl border border-gray-300 bg-white py-3 pr-4 pl-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
        />
      </div>
      {/* 라벨이 바뀌어도 입력창 너비가 흔들리지 않도록 버튼 폭을 고정한다 */}
      <button
        type="submit"
        disabled={disabled}
        className="w-[6.75rem] shrink-0 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? '검색 중…' : '검색'}
      </button>
    </form>
  );
}
