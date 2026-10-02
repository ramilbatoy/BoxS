"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function HeaderDrawer({
  items,
  children,
}: {
  items: { label: string; href: string }[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onResize = () => {
      if (window.matchMedia("(min-width: 1024px)").matches) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="inline-flex h-11 w-11 items-center justify-center rounded-full lg:hidden"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="flex flex-col gap-1.5" aria-hidden="true">
          <span className="block h-0.5 w-5 bg-foreground" />
          <span className="block h-0.5 w-5 bg-foreground" />
          <span className="block h-0.5 w-5 bg-foreground" />
        </span>
      </button>
      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 lg:hidden">
              <button type="button" className="absolute inset-0 bg-foreground/40" aria-label="Close menu" onClick={() => setOpen(false)} />
              <div className="absolute inset-y-0 right-0 flex w-72 max-w-[80vw] flex-col bg-background p-6 shadow-xl">
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center self-end bg-black text-white"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                    <path d="M3 3 L13 13 M13 3 L3 13" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
                <nav className="mt-6 flex flex-col text-base font-semibold">
                  {items.map((item) => (
                    <Link key={item.href} href={item.href} className="py-3 text-left hover:text-primary" onClick={() => setOpen(false)}>
                      {item.label}
                    </Link>
                  ))}
                </nav>
                <div className="border-t border-foreground/20" />
                <div
                  className="flex flex-col text-base font-semibold [&_a]:py-3 [&_a]:text-left [&_button]:py-3 [&_button]:text-left [&_form]:contents"
                  onClick={(event) => {
                    const target = event.target;
                    if (target instanceof Element && target.closest("a, button")) setOpen(false);
                  }}
                >
                  {children}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
