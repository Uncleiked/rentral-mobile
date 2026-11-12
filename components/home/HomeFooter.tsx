import { FooterMeadow } from './FooterMeadow';
import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { RentralLogo } from "@/components/brand/RentralLogo";

export function HomeFooter(): React.JSX.Element {
  return (
    <FooterMeadow>
      <div className="home-footer-top"><Link href="/" className="home-footer-wordmark" aria-label="Rentral home"><RentralLogo /></Link><p>Life moves.<br />Find what moves you.</p><nav aria-label="Footer navigation"><Link href="/marketplace">Explore <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link><Link href="/marketplace/listing/create">Become a host <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link><Link href="/marketplace/vault">Media Vault <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link><Link href="/marketplace/squat-mates">Squat-Mates <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link><Link href="/help">Help centre <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></nav></div>
      <div className="home-footer-bottom"><p>© 2026 Rentral. All rights reserved.</p><span><MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Lagos, Nigeria</span><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></div>
    </FooterMeadow>
  );
}
