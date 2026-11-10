import { MobileNav } from "./mobile-nav";
import { Search } from "./search";

export function Header() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:px-6">
      <MobileNav />
      <Search />
    </header>
  );
}
