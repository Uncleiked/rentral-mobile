"use client";

import { useState } from "react";
import clsx from "clsx";
import { DashboardCard } from "@/components/profile/DashboardCard";
import { MOCK_SAVED_SEARCHES } from "@/lib/mock-profile-data";

export function SavedSearchesCard() {
  const [searches, setSearches] = useState(MOCK_SAVED_SEARCHES);

  function toggleAlerts(id: string) {
    setSearches((current) =>
      current.map((search) => (search.id === id ? { ...search, alertsOn: !search.alertsOn } : search))
    );
  }

  return (
    <DashboardCard title="Saved Searches">
      <div className="flex flex-col gap-3">
        {searches.map((search) => (
          <div key={search.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary line-clamp-1">{search.label}</p>
              <p className="text-xs text-text-muted">{search.detail}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={search.alertsOn}
              onClick={() => toggleAlerts(search.id)}
              className={clsx(
                "relative h-6 w-11 flex-shrink-0 rounded-full transition-all active:scale-95",
                search.alertsOn ? "bg-accent-primary" : "bg-border-subtle"
              )}
            >
              <span
                className={clsx(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-text-primary transition-all",
                  search.alertsOn ? "left-5" : "left-0.5"
                )}
              />
            </button>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}
