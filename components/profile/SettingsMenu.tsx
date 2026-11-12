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
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && event.target instanceof Node && !containerRef.current.contains(event.target)) {
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
    setError(null);
    try {
      const supabase = createClient();
      const result = await supabase.auth.signOut();
      if (result.error) throw result.error;
      router.push("/sign-in");
      router.refresh();
    } catch {
      setError("We could not sign you out. Please try again.");
      setIsSigningOut(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-glass-light border border-glass-border-medium text-text-primary hover:bg-glass-light-hover active:scale-95 transition-all min-h-11 max-w-full whitespace-normal break-words"
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
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-glass-light-hover transition-all text-left min-h-11 max-w-full whitespace-normal break-words"
          >
            <UserCog className="h-4 w-4 text-text-muted" />
            Edit profile
          </button>
          <button
            type="button"
            onClick={handleAccountSecurity}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-glass-light-hover transition-all text-left border-t border-border-subtle min-h-11 max-w-full whitespace-normal break-words"
          >
            <ShieldCheck className="h-4 w-4 text-text-muted" />
            Account security
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-trust-flagged hover:bg-glass-light-hover transition-all text-left border-t border-border-subtle disabled:opacity-70 min-h-11 max-w-full whitespace-normal break-words"
          >
            <LogOut className="h-4 w-4" />
            {isSigningOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border-subtle bg-surface-card p-3 text-xs text-trust-flagged min-w-0 max-w-full wrap-anywhere">{error}</p>}
    </div>
  );
}
