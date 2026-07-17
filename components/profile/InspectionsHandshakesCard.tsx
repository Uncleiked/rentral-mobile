import clsx from "clsx";
import { DashboardCard } from "@/components/profile/DashboardCard";
import { MOCK_INSPECTIONS } from "@/lib/mock-profile-data";

export function InspectionsHandshakesCard() {
  return (
    <DashboardCard
      title="Inspections & Handshakes"
      action={
        <button type="button" className="text-xs font-bold text-accent-hover hover:text-accent-primary transition-colors">
          See all
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        {MOCK_INSPECTIONS.map((inspection) => (
          <div key={inspection.id} className="flex items-center gap-3 rounded-xl bg-background-app border border-border-subtle p-3">
            <div className="flex flex-col items-center justify-center h-12 w-12 flex-shrink-0 rounded-lg bg-accent-muted border border-glass-border-success">
              <span className="text-sm font-extrabold text-accent-hover leading-none">{inspection.day}</span>
              <span className="text-[9px] font-bold uppercase text-accent-hover">{inspection.month}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary line-clamp-1">{inspection.title}</p>
              <p className="text-xs text-text-muted line-clamp-1">{inspection.subtitle}</p>
            </div>
            <span
              className={clsx(
                "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider flex-shrink-0",
                inspection.statusTone === "settled"
                  ? "bg-accent-muted border border-glass-border-success text-accent-hover"
                  : "bg-glass-light border border-glass-border-light text-text-secondary"
              )}
            >
              {inspection.statusLabel}
            </span>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}
