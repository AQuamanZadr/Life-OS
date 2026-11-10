import { Logo, NavLinks } from "./nav-links";

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-sidebar lg:flex">
      <div className="flex h-14 items-center px-3">
        <Logo />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <NavLinks />
      </div>
    </aside>
  );
}
