import { ShieldCheck } from "lucide-react";
import type { TrustSummary } from "@/lib/profile-data";

interface TrustLedgerSummaryProps {
  stats: TrustSummary;
}

export function TrustLedgerSummary({ stats }: TrustLedgerSummaryProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl bg-surface-card border border-border-subtle px-4 py-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-4 w-4 text-accent-hover" />
          <span className="text-sm text-text-secondary">Zero ghost listings on record</span>
        </div>
        <span className="text-sm font-semibold text-text-primary">{stats.ghostListings}</span>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-surface-card border border-border-subtle px-4 py-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-4 w-4 text-accent-hover" />
          <span className="text-sm text-text-secondary">Verified spatial handshakes</span>
        </div>
        <span className="text-sm font-semibold text-text-primary">{stats.handshakesCount}</span>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-surface-card border border-border-subtle px-4 py-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-4 w-4 text-accent-hover" />
          <span className="text-sm text-text-secondary">GPS-verified since</span>
        </div>
        <span className="text-sm font-semibold text-text-primary">{stats.verifiedSinceYear}</span>
      </div>
    </div>
  );
}
