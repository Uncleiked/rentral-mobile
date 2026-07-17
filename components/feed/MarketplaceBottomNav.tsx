"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusSquare, MessageCircle, User, Search } from "lucide-react";

export function MarketplaceBottomNav() {
  const pathname = usePathname();

  const navItems = [
    { icon: Home, label: "Home", href: "/marketplace" },
    { icon: Search, label: "Search", href: "#" },
    { icon: PlusSquare, label: "Listing", href: "#" },
    { icon: MessageCircle, label: "Inbox", href: "#" },
    { icon: User, label: "Profile", href: "/marketplace/profile" },
  ];

  return (
    <div className={clsx(
      'flex items-center justify-around w-full px-2 py-3 bg-background-app border-t border-border-subtle'
    )}>
      {navItems.map((item) => {
        const isActive =
          item.href !== "#" &&
          (pathname === item.href || (item.href !== "/marketplace" && pathname.startsWith(`${item.href}/`)));

        return (
          <Link
            key={item.label}
            href={item.href}
            className="flex flex-col items-center gap-1 active:scale-95 transition-all"
          >
            <item.icon
              className={clsx(
                'h-6 w-6',
                isActive ? 'stroke-[2.5px] text-text-primary' : 'stroke-[1.5px] text-text-muted'
              )}
            />
          </Link>
        );
      })}
    </div>
  );
}
