import React, { useEffect, useRef } from "react";

interface SearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: (direction: "next" | "previous") => void;
  onClose: () => void;
}

export default function SearchBar({
  query,
  onQueryChange,
  onSearch,
  onClose,
}: SearchBarProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter") {
      onSearch(e.shiftKey ? "previous" : "next");
    }
  }

  function handleChange(value: string) {
    onQueryChange(value);
    if (value) onSearch("next");
  }

  return (
    <div className="absolute top-1 right-2 z-10 flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 shadow-lg">
      <input
        ref={inputRef}
        className="bg-transparent text-ui-base text-zinc-200 outline-none w-48 placeholder-zinc-500"
        placeholder="Find..."
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        className="text-zinc-400 hover:text-zinc-200 text-ui-base px-1"
        onClick={() => onSearch("previous")}
      >
        &#9650;
      </button>
      <button
        className="text-zinc-400 hover:text-zinc-200 text-ui-base px-1"
        onClick={() => onSearch("next")}
      >
        &#9660;
      </button>
      <button
        className="text-zinc-400 hover:text-zinc-200 text-ui-base px-1"
        onClick={onClose}
      >
        &#10005;
      </button>
    </div>
  );
}
