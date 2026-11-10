"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { RentralLogo } from "@/components/brand/RentralLogo";

const links = [{ label: "Explore", href: "#explore" }, { label: "How it works", href: "#how-it-works" }, { label: "Insights", href: "/insights" }, { label: "List on Rentral", href: "/marketplace/listing/create" }];

export function HomeNavigation(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && !toggle.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.removeEventListener("pointerdown", onPointerDown); };
  }, [open]);

  return (
    <header className="home-header">
      <nav aria-label="Main navigation" className="home-navigation home-container">
        <Link href="/" className="home-wordmark" aria-label="Rentral home"><RentralLogo /></Link>
        <div className="hidden items-center gap-8 text-sm font-medium text-text-secondary lg:flex">{links.map((link) => <Link key={link.label} href={link.href} className="transition-colors hover:text-text-primary">{link.label}</Link>)}</div>
        <div className="flex items-center gap-3"><Link href="/sign-in" className="home-nav-signin">Sign in <ArrowUpRight className="hidden h-4 w-4 sm:block" aria-hidden="true" /></Link><button ref={toggle} type="button" className="home-menu-toggle flex lg:hidden" aria-expanded={open} aria-controls="home-mobile-menu" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpen(!open)}>{open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}</button></div>
        {open && <div ref={menu} id="home-mobile-menu" className="home-mobile-menu lg:hidden">{links.map((link) => <Link key={link.label} href={link.href} onClick={() => setOpen(false)}>{link.label}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>)}<Link href="/marketplace" onClick={() => setOpen(false)}>Marketplace<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link></div>}
      </nav>
    </header>
  );
}
