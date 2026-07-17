import { DashboardCard } from "@/components/profile/DashboardCard";
import { MOCK_ACTIVE_LEASE } from "@/lib/mock-profile-data";

export function ActiveLeaseCard() {
  const progressPercent = Math.round((MOCK_ACTIVE_LEASE.monthsPaid / MOCK_ACTIVE_LEASE.monthsTotal) * 100);

  return (
    <DashboardCard
      title="Active Lease"
      action={
        <span className="rounded-full bg-accent-muted border border-glass-border-success px-3 py-1 text-xs font-semibold text-accent-hover">
          {MOCK_ACTIVE_LEASE.status}
        </span>
      }
    >
      <div>
        <p className="text-sm font-bold text-text-primary">{MOCK_ACTIVE_LEASE.title}</p>
        <p className="text-sm text-text-muted">{MOCK_ACTIVE_LEASE.address}</p>
        <div className="flex items-baseline gap-1 mt-2">
          <span className="text-xl font-extrabold text-accent-hover">₦{MOCK_ACTIVE_LEASE.rentNgn}</span>
          <span className="text-[10px] font-medium uppercase text-text-muted">/ Year</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>
            Lease term · {MOCK_ACTIVE_LEASE.monthsPaid} of {MOCK_ACTIVE_LEASE.monthsTotal} months
          </span>
          <span>Renews {MOCK_ACTIVE_LEASE.renewsOn}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-border-subtle overflow-hidden">
          <div className="h-full rounded-full bg-accent-primary" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
        <span className="text-sm text-text-secondary">
          Next payment ₦{MOCK_ACTIVE_LEASE.nextPaymentNgn} · due {MOCK_ACTIVE_LEASE.nextPaymentDue}
        </span>
        <button
          type="button"
          className="px-4 py-2 rounded-lg text-sm font-bold bg-accent-primary text-text-inverse hover:bg-accent-hover active:scale-95 transition-all shadow-lg"
        >
          Pay rent
        </button>
      </div>
    </DashboardCard>
  );
}
