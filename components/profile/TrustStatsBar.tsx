import type { MockTrustProfile } from "@/lib/mock-profile-data";

interface TrustStatsBarProps {
  stats: MockTrustProfile;
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-[92px]">
      <span className="text-lg font-extrabold text-text-inverse">{value}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-inverse text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

export function TrustStatsBar({ stats }: TrustStatsBarProps) {
  return (
    <div className="w-full rounded-2xl bg-accent-primary px-5 py-5 flex flex-wrap justify-around gap-4">
      <StatCell value={stats.trustScore} label="Trust Score" />
      <StatCell value={String(stats.ghostListings)} label="Ghost Listings" />
      <StatCell value={`${stats.avgResponseMinutes} min`} label="Avg Response" />
      <StatCell value={`${stats.showUpRatePercent}%`} label="Show-Up Rate" />
      <StatCell value={String(stats.verifiedSinceYear)} label="GPS-Verified Since" />
    </div>
  );
}
