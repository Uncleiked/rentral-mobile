"use client";

import { useState } from "react";
import clsx from "clsx";

type TabKey = "listings" | "reviews" | "ledger";

interface ProfileTabsProps {
  reviewsCount: number;
  listingsContent: React.ReactNode;
  reviewsContent: React.ReactNode;
  ledgerContent: React.ReactNode;
}

export function ProfileTabs({ reviewsCount, listingsContent, reviewsContent, ledgerContent }: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("listings");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "listings", label: "Listings" },
    { key: "reviews", label: `Reviews · ${reviewsCount}` },
    { key: "ledger", label: "Trust Ledger" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-6 border-b border-border-subtle">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              "pb-3 text-xs font-bold uppercase tracking-wider transition-all",
              activeTab === tab.key
                ? "text-text-primary border-b-2 border-text-primary"
                : "text-text-muted hover:text-text-secondary"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "listings" && listingsContent}
      {activeTab === "reviews" && reviewsContent}
      {activeTab === "ledger" && ledgerContent}
    </div>
  );
}
