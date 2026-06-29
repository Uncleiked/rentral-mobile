import clsx from "clsx";
import Link from "next/link";
import Image from "next/image";
import { 
  Home, 
  Compass, 
  MessageCircle, 
  Search, 
  Bell, 
  PlusSquare, 
  BarChart2, 
  User,
  Menu
} from "lucide-react";

export function MarketplaceSidebar() {
  const navItems = [
    { icon: Home, label: "Home", href: "/marketplace", active: true },
    { icon: Search, label: "Search", href: "#" },
    { icon: MessageCircle, label: "Inbox", href: "#" },
    { icon: Bell, label: "Alerts", href: "#" },
    { icon: PlusSquare, label: "Listing", href: "#" },
    { icon: BarChart2, label: "Dashboard", href: "#" },
    { icon: User, label: "Profile", href: "#" },
  ];

  return (
    <aside className={clsx(
      'hidden md:flex', 
      'flex-col', 
      'w-64 lg:w-[244px]', 
      'h-[100dvh]', 
      'border-r border-border-subtle', 
      'px-3 py-6', 
      'bg-background-app',
      'fixed left-0 top-0 z-40'
    )}>
      <div className="px-4 mb-8">
        {/* Branding */}
        <Link href="/">
          <Image 
            src="/Rentral.svg" 
            alt="Rentral" 
            width={120} 
            height={40} 
            className="invert brightness-0"
          />
        </Link>
      </div>

      <nav className="flex-1 flex flex-col gap-2">
        {navItems.map((item) => (
          <Link 
            key={item.label}
            href={item.href}
            className={clsx(
              'flex items-center gap-4 px-3 py-3 rounded-lg transition-all',
              'hover:bg-[#1a1a1a] active:scale-95',
              item.active ? 'font-bold' : 'font-medium'
            )}
          >
            <item.icon className={clsx(
              'h-6 w-6',
              item.active ? 'stroke-[2.5px] text-text-primary' : 'stroke-[1.5px] text-text-primary'
            )} />
            <span className={clsx('text-[15px]', item.active ? 'text-text-primary' : 'text-text-primary')}>
              {item.label}
            </span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto">
        <button className="flex items-center gap-4 px-3 py-3 rounded-lg transition-all hover:bg-[#1a1a1a] active:scale-95 w-full">
          <Menu className="h-6 w-6 stroke-[1.5px] text-text-primary" />
          <span className="text-[15px] font-medium text-text-primary">More</span>
        </button>
      </div>
    </aside>
  );
}
