"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Link2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import clsx from "clsx";

interface ShareMenuProps {
  username: string;
}

export function ShareMenu({ username }: ShareMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
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

  function getProfileUrl(): string {
    return `${window.location.origin}/marketplace/profile/${encodeURIComponent(username)}`;
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(getProfileUrl());
      toast.success("Link copied to clipboard");
      setIsOpen(false);
    } catch { toast.error("Could not copy the link. You can share the page address instead."); }
  }

  function openShareIntent(shareUrl: string) {
    window.open(shareUrl, "_blank", "noopener,noreferrer");
    setIsOpen(false);
  }

  const url = encodeURIComponent(typeof window !== "undefined" ? getProfileUrl() : "");

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label="Share profile"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="h-11 w-11 flex items-center justify-center rounded-full bg-glass-light border border-glass-border-medium text-text-primary hover:bg-glass-light-hover active:scale-95 transition-all min-h-11 max-w-full whitespace-normal break-words"
      >
        <MoreHorizontal className="h-4 w-4" />
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
            onClick={handleCopyLink}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-glass-light-hover transition-all text-left min-h-11 max-w-full whitespace-normal break-words"
          >
            <Link2 className="h-4 w-4 text-text-muted" />
            Copy link
          </button>
          <button
            type="button"
            onClick={() => openShareIntent(`https://wa.me/?text=${url}`)}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-glass-light-hover transition-all text-left border-t border-border-subtle min-h-11 max-w-full whitespace-normal break-words"
          >
            <MessageCircle className="h-4 w-4 text-text-muted" />
            Share to WhatsApp
          </button>
          <button
            type="button"
            onClick={() => openShareIntent(`https://twitter.com/intent/tweet?url=${url}`)}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-glass-light-hover transition-all text-left border-t border-border-subtle min-h-11 max-w-full whitespace-normal break-words"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-text-muted" fill="currentColor">
              <path d="M18.9 2H22l-7.6 8.7L23 22h-6.9l-5.4-6.9L4.4 22H1.3l8.2-9.3L1 2h7l4.9 6.3L18.9 2Zm-1.2 18h1.9L7.4 4H5.4l12.3 16Z" />
            </svg>
            Share to X
          </button>
          <button
            type="button"
            onClick={() => openShareIntent(`https://www.facebook.com/sharer/sharer.php?u=${url}`)}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-glass-light-hover transition-all text-left border-t border-border-subtle min-h-11 max-w-full whitespace-normal break-words"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-text-muted" fill="currentColor">
              <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z" />
            </svg>
            Share to Facebook
          </button>
        </div>
      )}
    </div>
  );
}
