import { DashboardCard } from "@/components/profile/DashboardCard";
import { MOCK_SECURITY } from "@/lib/mock-profile-data";

export function SecurityCard() {
  return (
    <DashboardCard id="account-security" title="Security">
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Two-factor authentication</span>
          <span className="font-semibold text-accent-hover">{MOCK_SECURITY.twoFactorEnabled ? "On" : "Off"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Password</span>
          <span className="font-semibold text-text-primary">{MOCK_SECURITY.passwordChangedLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Devices</span>
          <span className="font-semibold text-text-primary">{MOCK_SECURITY.activeDevices} active</span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
          <span className="text-text-secondary">Payout bank · {MOCK_SECURITY.payoutBankLabel}</span>
          <button type="button" className="font-semibold text-accent-hover hover:text-accent-primary transition-colors">
            Manage
          </button>
        </div>
      </div>
    </DashboardCard>
  );
}
