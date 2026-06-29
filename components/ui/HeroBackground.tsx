import React from 'react';
import clsx from 'clsx';

interface HeroBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * HeroBackground provides the green brand-vault background with the illustrative
 * graphic lines and hover scrim patterns, standardizing the hero visual style.
 */
export function HeroBackground({ children, className, ...props }: HeroBackgroundProps) {
  return (
    <section
      className={clsx(
        'relative isolate overflow-hidden bg-brand-vault',
        className
      )}
      {...props}
    >
      <div className="hero-line-field" />
      <div className="hero-hover-scrim" />
      
      {/* Content wrapper with z-index to sit above the background graphic */}
      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </section>
  );
}
