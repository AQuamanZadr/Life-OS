import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

// Строка поиска и фильтров над списком раздела.
export function ListToolbar({
  query,
  onQueryChange,
  placeholder,
  children,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label={placeholder}
          placeholder={`${placeholder}…`}
          className="pl-9"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>
      {children && <div className="grid grid-cols-2 gap-2 sm:flex">{children}</div>}
    </div>
  );
}

export function EmptyState({
  text,
  children,
}: {
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      {children}
    </div>
  );
}
