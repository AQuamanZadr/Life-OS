"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchSections } from "@/lib/nav";
import { cn } from "@/lib/utils";

// Пока ищет по разделам; поиск по данным добавится вместе с разделами.
export function Search() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const results = searchSections(query);
  const show = open && query.trim() !== "";

  function go(href: string) {
    setQuery("");
    setOpen(false);
    router.push(href);
  }

  return (
    <div className="relative w-full max-w-md">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        role="combobox"
        aria-label="Поиск"
        aria-expanded={show}
        aria-controls="search-results"
        placeholder="Поиск…"
        className="pl-9"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (!show || results.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => (i + 1) % results.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => (i - 1 + results.length) % results.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            go(results[index].href);
          }
        }}
      />
      {show && (
        <ul
          id="search-results"
          role="listbox"
          className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-md border border-border bg-card p-1 shadow-md"
        >
          {results.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Ничего не найдено
            </li>
          )}
          {results.map(({ href, title, description, icon: Icon }, i) => (
            <li key={href} role="option" aria-selected={i === index}>
              <button
                type="button"
                // mousedown, чтобы сработать до blur поля ввода
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(href);
                }}
                onMouseEnter={() => setIndex(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm",
                  i === index && "bg-accent",
                )}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="font-medium">{title}</span>
                <span className="truncate text-muted-foreground">
                  {description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
