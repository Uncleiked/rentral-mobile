import clsx from "clsx";
import Link from "next/link";
import { Home, Compass, PlusSquare, MessageCircle, User, Search } from "lucide-react";

export function MarketplaceBottomNav() {
  return (
    <div className={clsx(
      'flex items-center justify-around w-full px-2 py-3 bg-background-app border-t border-border-subtle'
    )}>
      <Link href="/marketplace" className="flex flex-col items-center gap-1 active:scale-95 transition-all">
        <Home className="h-6 w-6 stroke-[2.5px] text-text-primary" />
      </Link>
      
      <Link href="#" className="flex flex-col items-center gap-1 active:scale-95 transition-all">
        <Search className="h-6 w-6 text-text-primary" />
      </Link>
      
      <Link href="#" className="flex flex-col items-center gap-1 active:scale-95 transition-all">
        <PlusSquare className="h-6 w-6 text-text-primary" />
      </Link>
      
      <Link href="#" className="flex flex-col items-center gap-1 active:scale-95 transition-all">
        <MessageCircle className="h-6 w-6 text-text-primary" />
      </Link>
      
      <Link href="#" className="flex flex-col items-center gap-1 active:scale-95 transition-all">
        <User className="h-6 w-6 text-text-primary" />
      </Link>
    </div>
  );
}
