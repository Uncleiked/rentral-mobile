"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, UserCog, ShieldCheck, LogOut } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/client";

interface SettingsMenuProps {
  onEditProfile: () => void;
}

export function SettingsMenu({ onEditProfile }: SettingsMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleAccountSecurity() {
    setIsOpen(false);
    document.getElementById("account-security")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-glass-light border border-glass-border-medium text-text-primary hover:bg-glass-light-hover active:scale-95 transition-all"
      >
        <Settings className="h-4 w-4" />
        Settings
      </button>

      {isOpen && (
        <div
          className={clsx(
            "absolute right-0 mt-2 w-56 z-50",
            "bg-surface-card border border-border-subtle rounded-xl shadow-2xl overflow-hidden"
          )}
        >
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onEditProfile();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-[#262626] transition-all text-left"
          >
            <UserCog className="h-4 w-4 text-text-muted" />
            Edit profile
          </button>
          <button
            type="button"
            onClick={handleAccountSecurity}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-[#262626] transition-all text-left border-t border-border-subtle"
          >
            <ShieldCheck className="h-4 w-4 text-text-muted" />
            Account security
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-trust-flagged hover:bg-[#262626] transition-all text-left border-t border-border-subtle disabled:opacity-70"
          >
            <LogOut className="h-4 w-4" />
            {isSigningOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
