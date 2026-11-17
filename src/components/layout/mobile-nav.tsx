"use client";

import { MenuIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

const loadSheet = () => import("./mobile-nav-sheet");
const MobileNavSheet = dynamic(loadSheet, { ssr: false });

/**
 * Menu button for small screens. The panel's code loads when the visitor
 * shows intent (hover, focus, touch) or taps, keeping it out of every
 * page's initial JavaScript.
 */
export function MobileNav() {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const preload = () => void loadSheet();

  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? "mobile-nav" : undefined}
        onPointerEnter={preload}
        onFocus={preload}
        onTouchStart={preload}
        onClick={() => {
          setRequested(true);
          setOpen(true);
        }}
      >
        <MenuIcon className="size-6" aria-hidden />
      </Button>
      {requested ? (
        <MobileNavSheet open={open} onOpenChange={setOpen} returnFocusTo={trigger} />
      ) : null}
    </>
  );
}
