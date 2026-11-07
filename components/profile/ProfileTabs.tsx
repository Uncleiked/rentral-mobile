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
    { key: "ledger", label: "Verification" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Profile sections" className="flex items-center gap-4 overflow-x-auto border-b border-border-subtle sm:gap-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`profile-panel-${tab.key}`}
            id={`profile-tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              "shrink-0 pb-3 text-xs font-bold uppercase tracking-wider transition-all focus-visible:outline-2 focus-visible:outline-accent-primary",
              activeTab === tab.key
                ? "text-text-primary border-b-2 border-text-primary"
                : "text-text-muted hover:text-text-secondary"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`profile-panel-${activeTab}`} aria-labelledby={`profile-tab-${activeTab}`}>
        {activeTab === "listings" && listingsContent}
        {activeTab === "reviews" && reviewsContent}
        {activeTab === "ledger" && ledgerContent}
      </div>
    </div>
  );
}
