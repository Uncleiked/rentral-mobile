import clsx from "clsx";
import { DashboardCard } from "@/components/profile/DashboardCard";
import { MOCK_ESCROW_WALLET } from "@/lib/mock-profile-data";

export function EscrowWalletCard() {
  return (
    <DashboardCard title="Escrow Wallet">
      <div>
        <span className="text-3xl font-extrabold text-accent-hover">₦{MOCK_ESCROW_WALLET.balanceNgn}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex-1 px-4 py-3 rounded-xl text-sm font-bold bg-accent-primary text-text-inverse hover:bg-accent-hover active:scale-95 transition-all shadow-lg"
        >
          Fund
        </button>
        <button
          type="button"
          className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold bg-glass-light border border-glass-border-medium text-text-primary hover:bg-glass-light-hover active:scale-95 transition-all"
        >
          Withdraw
        </button>
      </div>

      <div className="flex flex-col gap-2.5 pt-2 border-t border-border-subtle">
        {MOCK_ESCROW_WALLET.activity.map((item) => (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">{item.label}</span>
            <span
              className={clsx(
                "font-semibold",
                item.direction === "held" ? "text-accent-warm" : "text-accent-hover"
              )}
            >
              {item.amountLabel}
            </span>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}
