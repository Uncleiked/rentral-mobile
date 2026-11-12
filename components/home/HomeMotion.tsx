"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const MotionContext=createContext({paused:false,reducedMotion:false,toggleMotion:()=>{}});
export const useHomeMotion=()=>useContext(MotionContext);
const motionQuery='(prefers-reduced-motion: reduce)';
const subscribeMotion=(callback:()=>void)=>{const query=window.matchMedia(motionQuery);query.addEventListener('change',callback);return()=>query.removeEventListener('change',callback)};

type HomeMotionProps = { children: ReactNode };

export function HomeMotion({ children }: HomeMotionProps): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const [paused,setPaused]=useState(false);
  const reducedMotion=useSyncExternalStore(subscribeMotion,()=>window.matchMedia(motionQuery).matches,()=>false);

  useEffect(() => {
    if(paused||reducedMotion)return;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    const context = gsap.context(() => {
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
        if(window.scrollY<80)intro.from(".home-hero-mask", { clipPath: "inset(9% 5% 8% 5% round 36px)", duration: 1.65 })
          .from(".home-title-word", { yPercent: 110, rotate: 3, duration: 1.05, stagger: 0.12 }, 0.25)
          .from(".home-hero-intro", { autoAlpha: 0, y: 22, duration: 0.8, stagger: 0.14 }, 0.65);

        gsap.fromTo(".home-hero-photo", { yPercent: 0, scale: 1.05 }, {
          yPercent: 12, scale: 1.12, ease: "none",
          scrollTrigger: { trigger: ".home-hero", start: "top top", end: "bottom top", scrub: 0.8 },
        });

        gsap.from('.home-category-card',{y:70,autoAlpha:0,rotation:1.5,duration:1.1,stagger:.14,ease:'power3.out',scrollTrigger:{trigger:'.home-category-grid',start:'top 92%',once:true}});
        gsap.fromTo('.home-host-photo img',{scale:1.12,yPercent:-4},{scale:1.03,yPercent:4,ease:'none',scrollTrigger:{trigger:'.home-host-section',start:'top bottom',end:'bottom top',scrub:1}});
        gsap.utils.toArray<HTMLElement>('.home-trust-step').forEach(element=>gsap.fromTo(element,{'--step-progress':0},{'--step-progress':1,duration:1.2,ease:'power2.out',scrollTrigger:{trigger:element,start:'top 88%',once:true}}));
        const track=root.current?.querySelector<HTMLElement>('.home-motion-track');
        if(track){const drift=gsap.to(track,{xPercent:-50,duration:28,repeat:-1,ease:'none',paused:true});ScrollTrigger.create({trigger:track,start:'top bottom',end:'bottom top',onToggle:state=>{if(state.isActive)drift.play();else drift.pause()}})}

        const reveals = root.current?.querySelectorAll<HTMLElement>("[data-reveal]:not(.home-category-card)");
        reveals?.forEach((element: HTMLElement) => {
          gsap.from(element, {
            autoAlpha: 0, y: 35, duration: 0.9, ease: "power3.out",
            scrollTrigger: { trigger: element, start: "top 94%", once: true },
          });
        });
      }, root);
    }, root);

    return () => { media.revert(); context.revert(); };
  }, [paused,reducedMotion]);

  return <MotionContext.Provider value={{paused,reducedMotion,toggleMotion:()=>setPaused(value=>!value)}}><div ref={root} data-motion-paused={paused||reducedMotion} className="rentral-home bg-background-app text-text-primary">{children}</div></MotionContext.Provider>;
}
