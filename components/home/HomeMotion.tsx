"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type HomeMotionProps = { children: ReactNode };

export function HomeMotion({ children }: HomeMotionProps): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    const context = gsap.context(() => {
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
        intro.from(".home-hero-mask", { clipPath: "inset(9% 5% 8% 5% round 36px)", duration: 1.65 })
          .from(".home-title-word", { yPercent: 110, rotate: 3, duration: 1.05, stagger: 0.12 }, 0.25)
          .from(".home-hero-intro", { autoAlpha: 0, y: 22, duration: 0.8, stagger: 0.14 }, 0.65);

        gsap.fromTo(".home-hero-photo", { yPercent: 0, scale: 1.05 }, {
          yPercent: 12, scale: 1.12, ease: "none",
          scrollTrigger: { trigger: ".home-hero", start: "top top", end: "bottom top", scrub: 0.8 },
        });

        const reveals = root.current?.querySelectorAll<HTMLElement>("[data-reveal]");
        reveals?.forEach((element: HTMLElement) => {
          gsap.from(element, {
            autoAlpha: 0, y: 35, duration: 0.9, ease: "power3.out",
            scrollTrigger: { trigger: element, start: "top 94%", once: true },
          });
        });
      }, root);
    }, root);

    return () => { media.revert(); context.revert(); };
  }, []);

  return <div ref={root} className="rentral-home bg-background-app text-text-primary">{children}</div>;
}
