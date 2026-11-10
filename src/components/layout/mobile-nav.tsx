"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SignOut } from "./sign-out";
import { Logo, NavLinks } from "./nav-links";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Открыть меню"
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent title="Меню">
        <div className="flex h-14 items-center px-3">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
        <SignOut />
      </SheetContent>
    </Sheet>
  );
}
