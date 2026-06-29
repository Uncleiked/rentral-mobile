import clsx from "clsx";
import Image from "next/image";
import { useState } from "react";
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal } from "lucide-react";

interface MarketplaceFeedCardProps {
  id: string;
  title: string;
  price: string;
  priceDenomination: string;
  category: "House" | "Car" | "Boat";
  videoUrl: string;
  posterUrl: string;
  badges: string[];
  username: string;
  avatarUrl: string;
  isVerified: boolean;
  trustScore: string;
}

export function MarketplaceFeedCard({
  title,
  price,
  priceDenomination,
  videoUrl,
  posterUrl,
  badges,
  username,
  avatarUrl,
  isVerified,
  trustScore
}: MarketplaceFeedCardProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
      <article className={clsx('w-full', 'bg-background-app', 'border-b', 'border-border-subtle', 'pb-6', 'mb-2')}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-0 py-3">
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-9 rounded-full overflow-hidden border border-glass-border-medium">
              <Image src={avatarUrl} alt={username} fill className="object-cover" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold text-text-primary">{username}</span>
                {isVerified && (
                  <div className="h-3.5 w-3.5 rounded-full bg-trust-verified flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                )}
                <span className="text-text-muted mx-1">•</span>
                <button className="text-sm font-semibold text-[#0095f6]">Follow</button>
              </div>
              <div className="text-[10px] font-bold text-accent-hover flex items-center">
                ★ {trustScore} Trust Score
              </div>
            </div>
          </div>
          <button className="text-text-primary hover:text-text-muted transition-colors">
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>

        {/* Media Container */}
        <div 
          className={clsx('w-full', 'aspect-[4/5]', 'bg-black', 'rounded-md', 'overflow-hidden', 'relative', 'cursor-pointer')}
          onClick={() => setIsFullscreen(true)}
        >
          <video
            className="h-full w-full object-cover"
            poster={posterUrl}
            autoPlay
            muted
            loop
            playsInline
          >
            <source src={videoUrl} type="video/mp4" />
          </video>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-between px-4 md:px-0 pt-4 pb-2">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsLiked(!isLiked)} className="active:scale-95 transition-all">
              <Heart className={clsx('h-6 w-6', isLiked ? 'fill-trust-flagged text-trust-flagged' : 'text-text-primary')} />
            </button>
            <button onClick={() => setIsSaved(!isSaved)} className="active:scale-95 transition-all">
              <Bookmark className={clsx('h-6 w-6', isSaved ? 'fill-text-primary text-text-primary' : 'text-text-primary')} />
            </button>
            <button className="active:scale-95 transition-all">
              <Send className="h-6 w-6 text-text-primary" />
            </button>
          </div>
          <button className="px-4 py-1.5 bg-accent-primary text-black font-bold rounded-lg text-sm active:scale-95 transition-all">
            Book
          </button>
        </div>

        {/* Details & Caption */}
        <div className="px-4 md:px-0 flex flex-col gap-1.5">
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-extrabold text-accent-hover">₦{price}</span>
            <span className="text-[10px] font-medium uppercase text-text-muted">/ {priceDenomination}</span>
          </div>
          <div className="text-sm">
            <span className="font-semibold text-text-primary mr-2">{username}</span>
            <span className="text-text-secondary">{title}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            {badges.map(badge => (
              <span key={badge} className="rounded-full bg-surface-card border border-border-subtle px-2.5 py-0.5 text-[10px] font-medium text-text-muted">
                {badge}
              </span>
            ))}
          </div>
        </div>
      </article>

      {/* Fullscreen Modal (TikTok style) */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col sm:flex-row">
          <div className="relative flex-1 h-full bg-black flex items-center justify-center" onClick={() => setIsFullscreen(false)}>
            <video
              className="h-full w-full object-contain"
              poster={posterUrl}
              autoPlay
              controls
              loop
              playsInline
            >
              <source src={videoUrl} type="video/mp4" />
            </video>
            
            {/* Close button for mobile inside video */}
            <button 
              className="absolute top-6 left-4 h-10 w-10 rounded-full bg-black/50 text-white flex items-center justify-center sm:hidden z-50 backdrop-blur-md"
              onClick={(e) => { e.stopPropagation(); setIsFullscreen(false); }}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Desktop/Tablet Details Panel */}
          <div className="hidden sm:flex flex-col w-[350px] bg-background-app border-l border-border-subtle h-full">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <div className="flex items-center gap-3">
                <div className="relative h-10 w-10 rounded-full overflow-hidden border border-glass-border-medium">
                  <Image src={avatarUrl} alt={username} fill className="object-cover" />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-semibold text-text-primary">{username}</span>
                  {isVerified && (
                    <div className="h-3.5 w-3.5 rounded-full bg-trust-verified flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => setIsFullscreen(false)} className="text-text-primary hover:text-text-muted">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-accent-hover">₦{price}</span>
                <span className="text-xs font-medium uppercase text-text-muted">/ {priceDenomination}</span>
              </div>
              <h2 className="text-lg font-bold text-text-primary">{title}</h2>
              <div className="flex flex-wrap gap-2">
                {badges.map(badge => (
                  <span key={badge} className="rounded-full bg-surface-card border border-border-subtle px-3 py-1 text-xs font-medium text-text-muted">
                    {badge}
                  </span>
                ))}
              </div>
              <button className="mt-4 w-full bg-accent-primary hover:bg-accent-hover text-black font-bold py-3 rounded-lg transition-colors">
                Book Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
