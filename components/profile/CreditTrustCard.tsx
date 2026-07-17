import { DashboardCard } from "@/components/profile/DashboardCard";
import { MOCK_CREDIT_TRUST } from "@/lib/mock-profile-data";

export function CreditTrustCard() {
  const circumference = 2 * Math.PI * 26;
  const filled = (MOCK_CREDIT_TRUST.score / 100) * circumference;

  return (
    <DashboardCard title="Credit Trust">
      <div className="flex items-start gap-4">
        <svg width="64" height="64" viewBox="0 0 64 64" className="flex-shrink-0 -rotate-90">
          <circle cx="32" cy="32" r="26" fill="none" stroke="var(--color-border-subtle)" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke="var(--color-accent-primary)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
          />
          <text
            x="32"
            y="32"
            textAnchor="middle"
            dominantBaseline="central"
            className="rotate-90 origin-center"
            fill="var(--color-text-primary)"
            fontSize="16"
            fontWeight="700"
          >
            {MOCK_CREDIT_TRUST.score}
          </text>
        </svg>

        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold text-text-primary">{MOCK_CREDIT_TRUST.headline}</p>
          <p className="text-sm text-text-muted leading-relaxed">{MOCK_CREDIT_TRUST.detail}</p>
        </div>
      </div>

      <button type="button" className="text-sm font-semibold text-accent-hover hover:text-accent-primary transition-colors text-left">
        View credit report →
      </button>
    </DashboardCard>
  );
}
