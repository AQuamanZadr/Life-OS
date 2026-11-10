import { MobileNav } from "./mobile-nav";
import { QuickAdd } from "./quick-add";
import { Search } from "./search";
import { SyncStatus } from "./sync-status";

export function Header() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:px-6">
      <MobileNav />
      <Search />
      <div className="ml-auto flex items-center gap-1">
        <SyncStatus />
        <QuickAdd />
      </div>
    </header>
  );
}
