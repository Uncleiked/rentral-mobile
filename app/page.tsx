"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { HeroBackground } from "@/components/ui/HeroBackground";

/* ─── Image URLs ─── */
const heroImage =
  "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1800&q=85";

const videoPoster =
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1800&q=85";

const projectImage =
  "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1800&q=85";

const qualityImage =
  "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=900&q=80";

const strengthsImage =
  "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80";

const marketplaceCards = [
  {
    label: "Verified Homes",
    detail: "GPS-locked apartments with 120s walkthrough videos and PostGIS-verified coordinates across Lagos.",
    image:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Rental Vehicles",
    detail: "SUVs and sedans bound to KYC-verified operators with escrow-protected bookings.",
    image:
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Marine Access",
    detail: "Boats and yachts with proximity-verified check-ins and split-escrow settlement.",
    image:
      "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=900&q=80",
  },
];

const trustSteps = [
  "Listers record 120-second walkthrough videos while the browser silently captures hardware GPS coordinates — eliminating ghost listings and scraped media fraud.",
  "Inspection fees sit in Rentral's escrow vault until PostGIS confirms both parties are within 20 metres of the asset — paying only on physical presence.",
  "Title deeds, CAC certificates, and vehicle documents are audited by Gemini AI for digital forgery before high-value listings go live.",
];

const navLinks: Array<{
  label: string
  href: string
  hasDropdown?: boolean
}> = [
  { label: "Home", href: "/" },
  { label: "About", href: "#about" },
  { label: "Projects", href: "#theproject" },
  { label: "Our Quality", href: "#ourquality" },
  { label: "strength", href: "#ourstrength" },
  { label: "Trust Loop", href: "#trustloop" },
  { label: "Footer", href: "#footer" },
];

const footerLinks = ["Home", "About", "Properties", "Blog", "Pricing"];

const projectImages = [
  "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1800&q=85", // Modern Lagos-ready Villa
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1800&q=85", // Luxury Interior space
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1800&q=85", // High-end SUV
  "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=1800&q=85"  // Premium marine vessel
];

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [projectImageIndex, setProjectImageIndex] = useState(0);

  return (
    <main className={clsx('min-h-screen', 'bg-background-app', 'text-text-primary')}>
      {/* ═══════════════════════════════════════════
          HERO SECTION
      ═══════════════════════════════════════════ */}
      <HeroBackground
        className={clsx('hero-section', 'px-6', 'pb-20', 'pt-6', 'sm:px-10', 'lg:px-16', 'lg:pb-24')}
      >

        {/* ── NAVBAR ── */}
        <nav className={clsx('relative', 'z-20', 'flex', 'items-center', 'justify-between', 'gap-4')}>
          {/* Logo — always visible */}
          <Link href="/" className={clsx('flex', 'items-center', 'gap-2')} aria-label="Rentral home">
            <Image
              src="/Rentral.svg"
              alt="Rentral Logo"
              width={32}
              height={32}
              className={clsx('h-8', 'w-8', 'object-contain', 'brightness-0', 'invert')}
            />
            <span className={clsx('text-base', 'font-bold', 'uppercase', 'tracking-[0.2em]', 'text-text-primary')}>
              Rentral
            </span>
          </Link>

          {/* Desktop pill nav */}
          <div className={clsx('hidden', 'lg:flex', 'items-center', 'gap-1', 'rounded-full', 'border', 'border-glass-border-medium', 'bg-glass-dark', 'p-1.5', 'text-[11px]', 'font-bold', 'uppercase', 'tracking-wider', 'text-text-secondary', 'backdrop-blur-lg')}>
            {navLinks.map((link) => (
              <a
                key={link.label}
                className={`glass-link px-4 py-2 transition-all hover:text-text-primary flex items-center gap-1 ${link.label === "Home" ? "rounded-full bg-glass-light text-text-primary" : ""}`}
                href={link.href}
              >
                {link.label}
                {link.hasDropdown && (
                  <svg className={clsx('h-3', 'w-3', 'opacity-60')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </a>
            ))}
          </div>

          {/* Desktop auth pill */}
          <div className={clsx('hidden', 'lg:flex', 'items-center', 'gap-2', 'rounded-full', 'border', 'border-glass-border-medium', 'bg-glass-dark', 'p-1', 'text-[11px]', 'font-bold', 'uppercase', 'tracking-wider', 'backdrop-blur-lg')}>
            <a className={clsx('glass-link', 'rounded-full', 'px-4', 'py-2', 'text-text-primary')} href="/sign-in">
              Login
            </a>
            <a
              className={clsx('glass-btn', 'rounded-full', 'bg-text-primary', 'px-5', 'py-2.5', 'text-text-inverse')}
              href="/sign-in"
            >
              Get started
            </a>
          </div>

          {/* Mobile: Get Started + Hamburger */}
          <div className={clsx('flex', 'items-center', 'gap-3', 'lg:hidden')}>
            <a
              className={clsx('glass-btn', 'rounded-full', 'bg-text-primary', 'px-4', 'py-2', 'text-[11px]', 'font-bold', 'uppercase', 'tracking-wider', 'text-text-inverse')}
              href="/sign-in"
            >
              Get started
            </a>
            <button
              type="button"
              className={clsx('flex', 'h-10', 'w-10', 'items-center', 'justify-center', 'rounded-full', 'border', 'border-glass-border-medium', 'bg-glass-light', 'backdrop-blur-md', 'cursor-pointer')}
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
            >
              <svg className={clsx('h-5', 'w-5', 'text-text-primary')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </nav>

        {/* ── HERO CONTENT ── */}
        <div className={clsx('relative', 'z-10', 'mt-10', 'lg:mt-16')}>
          {/* Text content */}
          <div className={clsx('relative', 'z-10', 'max-w-5xl')}>
            <p className={clsx('mb-6', 'inline-flex', 'rounded-full', 'border', 'border-glass-border-success', 'bg-accent-muted', 'px-4', 'py-1.5', 'text-[10px]', 'font-bold', 'uppercase', 'tracking-[0.2em]', 'text-accent-hover', 'backdrop-blur-md')}>
              Lagos spatial trust marketplace
            </p>
            <h1 className={clsx('max-w-4xl', 'text-[2.75rem]', 'font-extrabold', 'uppercase', 'leading-[0.9]', 'tracking-tighter', 'text-text-primary', 'sm:text-7xl', 'lg:text-[5.5rem]', 'xl:text-[6.5rem]')}>
              Experience <br className={clsx('hidden', 'sm:block')} />
              the epitome of <br />
              <span className={clsx('font-light', 'text-text-muted', 'opacity-60')}>spatial</span>{" "}
              <span className="text-accent-warm">trust.</span>
            </h1>
            <p className={clsx('mt-6', 'max-w-md', 'text-sm', 'font-medium', 'leading-relaxed', 'text-text-secondary')}>
              Rent houses, SUVs, sedans, boats, and yachts through verified
              identity, hardware-locked walkthroughs, and escrow handshakes
              that pay only when people are physically present.
            </p>

            {/* CTAs */}
            <div className={clsx('mt-10', 'flex', 'flex-col', 'gap-3', 'sm:flex-row', 'sm:flex-wrap', 'sm:items-center', 'sm:gap-4')}>
              <a
                href="/marketplace"
                className={clsx('glass-btn', 'inline-flex', 'items-center', 'justify-center', 'rounded-xl', 'bg-accent-primary', 'px-6', 'py-4', 'text-xs', 'font-bold', 'uppercase', 'tracking-wider', 'text-text-inverse', 'shadow-lg')}
              >
                Enter marketplace
              </a>
              <a
                href="/listing/create"
                className={clsx('glass-btn', 'inline-flex', 'items-center', 'justify-center', 'rounded-xl', 'border', 'border-glass-border-medium', 'bg-glass-light', 'px-6', 'py-4', 'text-xs', 'font-bold', 'uppercase', 'tracking-wider', 'text-text-primary', 'backdrop-blur-md')}
              >
                Create listing
              </a>

              {/* Rotating badge — hidden on small screens */}
              <div className={clsx('relative', 'flex', 'h-20', 'w-20', 'items-center', 'justify-center', 'hidden', 'sm:flex', 'sm:ml-4', 'lg:ml-8')}>
                <svg viewBox="0 0 100 100" className={clsx('absolute', 'inset-0', 'h-full', 'w-full', 'animate-spin-slow')}>
                  <path
                    id="textPath-hero"
                    d="M 50, 50 m -36, 0 a 36,36 0 1,1 72,0 a 36,36 0 1,1 -72,0"
                    fill="transparent"
                  />
                  <text className={clsx('fill-text-muted', 'text-[5.8px]', 'font-bold', 'uppercase', 'tracking-[0.16em]')}>
                    <textPath href="#textPath-hero">
                      Spatial Trust Engine • Rentral •
                    </textPath>
                  </text>
                </svg>
                <div className={clsx('relative', 'z-10', 'text-accent-warm', 'animate-pulse')}>
                  <svg viewBox="0 0 24 24" className={clsx('h-5', 'w-5')} fill="currentColor">
                    <path d="M12 2L14.8 9.2L22 12L14.8 14.8L12 22L9.2 14.8L2 12L9.2 9.2L12 2Z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Mobile image — shows only < lg, rendered below the text content */}
            <div className={clsx('relative', 'flex', 'justify-center', 'lg:hidden', 'my-12')}>
              <div className={clsx('hero-media-shell', 'relative')}>
                <Image
                  src={heroImage}
                  alt="Luxury verified home interior"
                  fill
                  priority
                  sizes="85vw"
                  className="object-cover"
                />
              </div>
              {/* Mobile orange arrow overlapping the image capsule */}
              <a
                href="/marketplace"
                className={clsx('hero-arrow-button', 'absolute', 'z-20', 'flex', 'h-14', 'w-14', 'items-center', 'justify-center', 'rounded-full', 'bg-accent-warm', 'text-text-inverse', 'shadow-2xl')}
                style={{ bottom: "0px", right: "12%" }}
                aria-label="Open Rentral marketplace"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className={clsx('h-7', 'w-7')} fill="none">
                  <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Desktop image zone — circle that expands to cover entire hero on hover */}
        <div
          className={clsx('hero-image-zone', 'hidden', 'lg:block')}
        >
          <div className={clsx('hero-media-shell', 'relative')}>
            <Image
              src={heroImage}
              alt="Verified Lagos home interior captured with hardware-locked walkthrough"
              fill
              priority
              sizes="(min-width: 1024px) 540px, 0px"
              className="object-cover"
            />
            {/* Dark overlay that fades in when circle expands to full background */}
            <div className="hero-expand-overlay" />
          </div>
          {/* Orange Arrow — overlaps image on desktop */}
          <a
            href="/marketplace"
            className={clsx('hero-arrow-button', 'absolute', 'z-30', 'flex', 'h-20', 'w-20', 'items-center', 'justify-center', 'rounded-full', 'bg-accent-warm', 'text-text-inverse', 'shadow-2xl', 'xl:h-24', 'xl:w-24')}
            aria-label="Open Rentral marketplace"
            style={{ top: "60px", left: "-40px" }}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className={clsx('h-9', 'w-9')} fill="none">
              <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
            </svg>
          </a>
        </div>
      </HeroBackground>

      {/* ═══════════════════════════════════════════
          ABOUT US SECTION
      ═══════════════════════════════════════════ */}
      <section
      id="about"
      className={clsx('bg-background-app', 'px-6', 'py-20', 'sm:px-10', 'lg:px-16', 'lg:py-28')}>
        <div className={clsx('grid', 'gap-12', 'lg:grid-cols-[0.72fr_1.28fr]')}>
          <div>
            <div className={clsx('mb-12', 'flex', 'items-center', 'gap-5')}>
              <span className="trust-orbit" />
              <h2 className={clsx('text-2xl', 'font-bold', 'uppercase', 'tracking-wider', 'text-text-primary')}>
                About Us
              </h2>
            </div>
            <p className={clsx('max-w-xs', 'text-sm', 'font-medium', 'leading-relaxed', 'text-text-muted')}>
              Rentral replaces passive classified ads with an active
              verification engine — binding physical assets to native device
              hardware telemetry and automating payouts through split-escrow
              gateway APIs.
            </p>
            <a
              href="/sign-in"
              className={clsx('glass-btn', 'mt-8', 'inline-flex', 'rounded-full', 'bg-accent-warm', 'px-8', 'py-4', 'text-xs', 'font-bold', 'uppercase', 'tracking-wider', 'text-text-inverse', 'shadow-lg')}
            >
              Get Started
            </a>
          </div>

          <div>
            <h2 className={clsx('max-w-3xl', 'text-3xl', 'font-extrabold', 'uppercase', 'leading-[0.95]', 'tracking-tighter', 'text-text-primary', 'sm:text-5xl', 'lg:text-6xl')}>
              Zero-fraud <span className={clsx('font-light', 'text-accent-warm')}>rentals</span> across <span className={clsx('font-light', 'text-text-muted', 'opacity-60')}>Lagos</span> and beyond.
            </h2>
            <p className={clsx('mt-6', 'max-w-2xl', 'text-sm', 'font-medium', 'leading-relaxed', 'text-text-muted')}>
              Every listing is hardware-locked with live GPS coordinates and
              120-second walkthrough videos. Every transaction is escrow-protected
              with PostGIS proximity checks — paying listers only when seekers are
              physically present within 20 metres of the verified asset.
            </p>

            {/* Counters */}
            <div className={clsx('mt-12', 'grid', 'gap-8', 'grid-cols-3')}>
              <div>
                <p className={clsx('text-4xl', 'font-extrabold', 'text-text-primary', 'sm:text-5xl')}>
                  20<span className={clsx('text-accent-warm', 'font-light')}>m</span>
                </p>
                <p className={clsx('mt-2', 'text-[10px]', 'font-bold', 'text-text-muted', 'uppercase', 'tracking-wider')}>
                  Proximity Radius
                </p>
              </div>
              <div>
                <p className={clsx('text-4xl', 'font-extrabold', 'text-text-primary', 'sm:text-5xl')}>
                  120<span className={clsx('text-accent-warm', 'font-light')}>s</span>
                </p>
                <p className={clsx('mt-2', 'text-[10px]', 'font-bold', 'text-text-muted', 'uppercase', 'tracking-wider')}>
                  Walkthrough Lock
                </p>
              </div>
              <div>
                <p className={clsx('text-4xl', 'font-extrabold', 'text-text-primary', 'sm:text-5xl')}>
                  0<span className={clsx('text-accent-warm', 'font-light')}>%</span>
                </p>
                <p className={clsx('mt-2', 'text-[10px]', 'font-bold', 'text-text-muted', 'uppercase', 'tracking-wider')}>
                  Ghost Listings
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Arched Video Capsule */}
        <div className={clsx('relative', 'mt-16', 'sm:mt-24', 'overflow-hidden', 'rounded-t-[40px]', 'rounded-b-[16px]', 'sm:rounded-t-[180px]', 'sm:rounded-b-[48px]', 'border', 'border-border-subtle', 'bg-surface-card', 'shadow-2xl')}>
          <video
            className={clsx('h-[400px]', 'w-full', 'object-cover', 'sm:h-[520px]')}
            poster={videoPoster}
            autoPlay
            muted
            loop
            playsInline
          >
            <source
              src="https://videos.pexels.com/video-files/7578548/7578548-uhd_2560_1440_30fps.mp4"
              type="video/mp4"
            />
          </video>
          <div className={clsx('absolute', 'inset-0', 'bg-glass-dark/45')} />

          {/* Centered Play */}
          <div className={clsx('absolute', 'inset-0', 'flex', 'items-center', 'justify-center', 'pointer-events-none')}>
            <span className={clsx('glass-btn', 'flex', 'h-16', 'w-16', 'items-center', 'justify-center', 'rounded-full', 'bg-text-primary', 'text-text-inverse', 'shadow-2xl', 'pointer-events-auto', 'cursor-pointer', 'sm:h-20', 'sm:w-20')}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className={clsx('h-7', 'w-7', 'fill-current', 'ml-1', 'sm:h-9', 'sm:w-9')}>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>

          <div className={clsx('absolute', 'inset-x-0', 'bottom-0', 'px-6', 'pb-8', 'text-center', 'sm:px-10', 'sm:pb-12', 'pointer-events-none')}>
            <h3 className={clsx('text-3xl', 'font-light', 'uppercase', 'tracking-[0.18em]', 'text-text-primary', 'sm:text-6xl', 'lg:text-7xl')}>
              Spatial Trust
            </h3>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          THE PROJECT SECTION
      ═══════════════════════════════════════════ */}
      <section
        id="theproject"
        className={clsx('bg-brand-vault', 'px-6', 'py-20', 'sm:px-10', 'lg:px-16', 'lg:py-28')}
      >
        <div className={clsx('grid', 'gap-10', 'lg:grid-cols-[0.8fr_1.2fr]')}>
          <div className={clsx('flex', 'items-center', 'gap-5')}>
            <span className="trust-orbit" />
            <h2 className={clsx('text-2xl', 'font-bold', 'uppercase', 'tracking-wider', 'text-text-primary')}>
              The Project
            </h2>
          </div>
          <p className={clsx('max-w-xl', 'text-sm', 'font-semibold', 'leading-relaxed', 'text-text-secondary', 'lg:justify-self-end')}>
            Verified identity via Smile ID, split-escrow routing through OPay,
            and hardware-locked 120-second walkthrough videos create a marketplace
            where seekers inspect with confidence and listers are compensated
            the instant PostGIS confirms physical presence.
          </p>
        </div>

        <div className={clsx('mt-10', 'sm:mt-16', 'overflow-hidden', 'rounded-t-[40px]', 'rounded-b-[16px]', 'sm:rounded-t-[180px]', 'sm:rounded-b-[48px]', 'border', 'border-glass-border-light', 'bg-surface-card', 'shadow-2xl', 'relative', 'w-full', 'h-80', 'sm:h-[400px]', 'lg:h-[540px]')}>
          <Image
            src={projectImages[projectImageIndex]}
            alt="Modern Lagos-ready rental assets (Properties, Vehicles, and Marine)"
            fill
            sizes="100vw"
            className={clsx('object-cover')}
          />
        </div>

        <div className={clsx('mt-10', 'flex', 'items-center', 'justify-center', 'gap-4')}>
          <button
            type="button"
            className={clsx('glass-btn', 'flex', 'h-12', 'w-12', 'items-center', 'justify-center', 'rounded-full', 'border', 'border-glass-border-medium', 'bg-glass-light', 'text-text-primary', 'backdrop-blur-md', 'cursor-pointer')}
            aria-label="Previous image"
            onClick={() => setProjectImageIndex((prev) => (prev === 0 ? projectImages.length - 1 : prev - 1))}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className={clsx('h-5', 'w-5')} fill="none">
              <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
            </svg>
          </button>
          <button
            type="button"
            className={clsx('glass-btn', 'flex', 'h-12', 'w-12', 'items-center', 'justify-center', 'rounded-full', 'border', 'border-glass-border-medium', 'bg-glass-light', 'text-text-primary', 'backdrop-blur-md', 'cursor-pointer')}
            aria-label="Next image"
            onClick={() => setProjectImageIndex((prev) => (prev === projectImages.length - 1 ? 0 : prev + 1))}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className={clsx('h-5', 'w-5')} fill="none">
              <path d="M9 5l7 7-7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
            </svg>
          </button>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          OUR QUALITY SECTION (from image.png)
      ═══════════════════════════════════════════ */}
      <section
      id="ourquality"
      className={clsx('bg-brand-vault', 'px-6', 'py-20', 'sm:px-10', 'lg:px-16', 'lg:py-28', 'overflow-hidden', 'relative')}>
        <div className={clsx('flex', 'items-center', 'gap-5', 'mb-12')}>
          <span className="trust-orbit" />
          <h2 className={clsx('text-2xl', 'font-bold', 'uppercase', 'tracking-wider', 'text-text-primary')}>
            Our Quality
          </h2>
        </div>

        <div className={clsx('grid', 'gap-12', 'lg:grid-cols-[1fr_1fr]', 'items-center')}>
          <div>
            <h3 className={clsx('text-3xl', 'font-extrabold', 'uppercase', 'leading-tight', 'tracking-tighter', 'text-text-primary', 'sm:text-5xl')}>
              Verified <span className="text-accent-warm">assets</span>, zero fraud.
            </h3>
            <p className={clsx('mt-6', 'max-w-md', 'text-sm', 'font-medium', 'leading-relaxed', 'text-text-muted')}>
              Every property, vehicle, and marine vessel on Rentral is captured
              with hardware-locked GPS coordinates. Scraped media and ghost
              listings are programmatically impossible — what you see is
              spatially verified to exist.
            </p>
            <a
              href="/sign-in"
              className={clsx('glass-btn', 'mt-8', 'inline-flex', 'rounded-full', 'bg-accent-warm', 'px-8', 'py-4', 'text-xs', 'font-bold', 'uppercase', 'tracking-wider', 'text-text-inverse', 'shadow-lg')}
            >
              Start Verification
            </a>
          </div>

          <div className={clsx('relative', 'flex', 'justify-center', 'lg:justify-end', 'w-full')}>
            {/* Blurred secondary capsule on the right */}
            <div className={clsx('absolute', 'right-[-15%]', 'top-1/2', '-translate-y-1/2', 'w-4/5', 'aspect-square', 'rounded-full', 'overflow-hidden', 'border', 'border-glass-border-light', 'opacity-25', 'blur-[2px]', 'hidden', 'sm:block', 'z-0', 'pointer-events-none')}>
              <Image
                src={projectImage}
                alt="Faded secondary view"
                fill
                sizes="(min-width: 640px) 40vw, 0px"
                className="object-cover"
              />
            </div>

            <div className={clsx('relative', 'w-full', 'max-w-xl', 'aspect-square', 'overflow-hidden', 'rounded-full', 'border', 'border-glass-border-light', 'shadow-2xl', 'z-10')}>
              <Image
                src={qualityImage}
                alt="Premium modern interior dining space"
                fill
                sizes="(min-width: 1024px) 50vw, 90vw"
                className="object-cover"
              />
            </div>
            {/* Arrow overlay centered overlapping the bottom of the main circle */}
            <a
              href="/marketplace"
              className={clsx('hero-arrow-button', 'absolute', 'bottom-0', 'left-1/2', '-translate-x-1/2', 'translate-y-1/2', 'z-20', 'flex', 'h-16', 'w-16', 'items-center', 'justify-center', 'rounded-full', 'bg-accent-warm', 'text-text-inverse', 'shadow-2xl', 'sm:h-20', 'sm:w-20')}
              aria-label="Explore quality listings"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className={clsx('h-7', 'w-7', 'sm:h-9', 'sm:w-9')} fill="none">
                <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          LET'S COMBINE OUR STRENGTHS (from image.png)
      ═══════════════════════════════════════════ */}
      <section
      id="ourstrength"
      className={clsx('bg-background-app', 'px-6', 'py-20', 'sm:px-10', 'lg:px-16', 'lg:py-28', 'text-center')}>
        <h2 className={clsx('mx-auto', 'max-w-4xl', 'text-4xl', 'font-extrabold', 'uppercase', 'leading-[0.95]', 'tracking-tighter', 'text-text-primary', 'sm:text-6xl', 'lg:text-7xl')}>
          Rent with <br /> <span className="text-accent-warm">spatial</span> confidence
        </h2>

        <div className={clsx('relative', 'mx-auto', 'mt-16', 'w-full', 'max-w-lg', 'aspect-[4/3]')}>
          <div className={clsx('relative', 'w-full', 'h-full', 'overflow-hidden', 'rounded-t-[40px]', 'rounded-b-[16px]', 'sm:rounded-t-[180px]', 'sm:rounded-b-[48px]', 'border', 'border-border-subtle', 'shadow-2xl')}>
            <Image
              src={strengthsImage}
              alt="Verified luxury Lagos property with escrow-protected booking"
              fill
              sizes="(min-width: 1024px) 520px, 90vw"
              className="object-cover"
            />
          </div>
          {/* Arrow overlay overlapping the right edge */}
          <a
            href="/marketplace"
            className={clsx('hero-arrow-button', 'absolute', 'top-1/2', 'right-4', 'sm:right-0', 'translate-x-0', 'sm:translate-x-1/2', '-translate-y-1/2', 'z-10', 'flex', 'h-14', 'w-14', 'items-center', 'justify-center', 'rounded-full', 'bg-accent-warm', 'text-text-inverse', 'shadow-2xl', 'sm:h-16', 'sm:w-16')}
            aria-label="Combine strengths"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className={clsx('h-6', 'w-6')} fill="none">
              <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
            </svg>
          </a>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          TRUST LOOP & CARDS
      ═══════════════════════════════════════════ */}
      <section
      id="trustloop"
       className={clsx('bg-background-app', 'px-6', 'py-20', 'sm:px-10', 'lg:px-16', 'lg:py-28')}>
        <div className={clsx('grid', 'gap-12', 'lg:grid-cols-[0.8fr_1.2fr]')}>
          <div>
            <p className={clsx('mb-4', 'text-xs', 'font-bold', 'uppercase', 'tracking-wider', 'text-accent-hover')}>
              Trust loop
            </p>
            <h2 className={clsx('max-w-lg', 'text-3xl', 'font-extrabold', 'uppercase', 'leading-tight', 'tracking-tighter', 'text-text-primary', 'sm:text-5xl')}>
              From search intent to secure handoff.
            </h2>
          </div>
          <div className={clsx('grid', 'gap-4')}>
            {trustSteps.map((step, index) => (
              <div
                key={step}
                className={clsx('glass-card', 'rounded-2xl', 'border', 'border-border-subtle', 'bg-surface-card', 'p-6')}
              >
                <p className={clsx('relative', 'z-10', 'text-xs', 'font-bold', 'uppercase', 'tracking-wide', 'text-accent-hover')}>
                  0{index + 1}
                </p>
                <p className={clsx('relative', 'z-10', 'mt-3', 'text-sm', 'font-medium', 'leading-relaxed', 'text-text-secondary')}>
                  {step}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Feature Cards */}
        <div 
        id="feature"
        className={clsx('mt-20', 'grid', 'gap-6', 'sm:grid-cols-2', 'lg:grid-cols-3')}>
          {marketplaceCards.map((card) => (
            <article
              key={card.label}
              className={clsx('glass-card', 'overflow-hidden', 'rounded-2xl', 'border', 'border-border-subtle', 'bg-surface-card')}
            >
              <Image
                src={card.image}
                alt={card.label}
                width={900}
                height={620}
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className={clsx('relative', 'z-0', 'h-56', 'w-full', 'object-cover', 'sm:h-64')}
              />
              <div className={clsx('relative', 'z-10', 'p-6')}>
                <h3 className={clsx('text-lg', 'font-bold', 'tracking-normal', 'text-text-primary')}>
                  {card.label}
                </h3>
                <p className={clsx('mt-3', 'text-sm', 'font-medium', 'leading-relaxed', 'text-text-muted')}>
                  {card.detail}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          FOOTER (from image.png design)
      ═══════════════════════════════════════════ */}
      <footer
        id="footer"
        className={clsx('bg-brand-vault', 'px-6', 'py-16', 'sm:px-10', 'lg:px-16', 'border-t', 'border-glass-border-light')}
      >
        <div className={clsx('mx-auto', 'max-w-7xl', 'flex', 'flex-col', 'items-center', 'text-center')}>
          {/* Logo */}
          <div className={clsx('flex', 'items-center', 'gap-2', 'mb-6')}>
            <Image
              src="/Rentral.svg"
              alt="Rentral Logo"
              width={32}
              height={32}
              className={clsx('h-8', 'w-8', 'object-contain', 'brightness-0', 'invert')}
            />
            <span className={clsx('text-base', 'font-bold', 'uppercase', 'tracking-[0.2em]', 'text-text-primary')}>
              Rentral
            </span>
          </div>

          {/* Tagline */}
          <p className={clsx('max-w-md', 'text-sm', 'font-medium', 'leading-relaxed', 'text-text-secondary', 'mb-8')}>
            Africa&apos;s zero-fraud rental marketplace — hardware-locked walkthroughs,
            escrow handshakes, and spatial trust verification.
          </p>

          {/* Social Icons */}
          <div className={clsx('flex', 'items-center', 'gap-5', 'mb-10')}>
            {/* Facebook */}
            <a href="#" className={clsx('glass-btn', 'flex', 'h-10', 'w-10', 'items-center', 'justify-center', 'rounded-full', 'border', 'border-glass-border-medium', 'bg-glass-light', 'text-text-primary', 'backdrop-blur-md')} aria-label="Facebook">
              <svg className={clsx('h-4', 'w-4')} fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
            </a>
            {/* Twitter / X */}
            <a href="#" className={clsx('glass-btn', 'flex', 'h-10', 'w-10', 'items-center', 'justify-center', 'rounded-full', 'border', 'border-glass-border-medium', 'bg-glass-light', 'text-text-primary', 'backdrop-blur-md')} aria-label="Twitter">
              <svg className={clsx('h-4', 'w-4')} fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" /></svg>
            </a>
            {/* Instagram */}
            <a href="#" className={clsx('glass-btn', 'flex', 'h-10', 'w-10', 'items-center', 'justify-center', 'rounded-full', 'border', 'border-glass-border-medium', 'bg-glass-light', 'text-text-primary', 'backdrop-blur-md')} aria-label="Instagram">
              <svg className={clsx('h-4', 'w-4')} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
            </a>
            {/* LinkedIn */}
            <a href="#" className={clsx('glass-btn', 'flex', 'h-10', 'w-10', 'items-center', 'justify-center', 'rounded-full', 'border', 'border-glass-border-medium', 'bg-glass-light', 'text-text-primary', 'backdrop-blur-md')} aria-label="LinkedIn">
              <svg className={clsx('h-4', 'w-4')} fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
            </a>
          </div>

          {/* Divider line */}
          <div className={clsx('w-full', 'border-t', 'border-glass-border-light', 'my-8')} />

          {/* Navigation Links */}
          <div className={clsx('flex', 'flex-wrap', 'items-center', 'justify-center', 'gap-x-2', 'gap-y-2')}>
            {footerLinks.map((link, i) => (
              <div key={link} className={clsx('flex', 'items-center')}>
                {link === "Home" ? (
                  <Link
                    href="/"
                    className={clsx('glass-link', 'px-5', 'py-2', 'text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-text-secondary', 'transition-all', 'hover:text-text-primary')}
                  >
                    {link}
                  </Link>
                ) : (
                  <a
                    href={`#${link.toLowerCase()}`}
                    className={clsx('glass-link', 'px-5', 'py-2', 'text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-text-secondary', 'transition-all', 'hover:text-text-primary')}
                  >
                    {link}
                  </a>
                )}
                {i < footerLinks.length - 1 && (
                  <span className={clsx('h-4', 'w-px', 'bg-glass-border-light', 'mx-2')} />
                )}
              </div>
            ))}
          </div>
        </div>
      </footer>

      {/* ═══════════════════════════════════════════
          MOBILE NAV DRAWER
      ═══════════════════════════════════════════ */}
      <div
        className={`mobile-nav-overlay ${mobileMenuOpen ? "open" : ""}`}
        onClick={() => setMobileMenuOpen(false)}
      />
      <div className={`mobile-nav-drawer ${mobileMenuOpen ? "open" : ""}`}>
        <div className={clsx('flex', 'items-center', 'justify-between', 'p-6', 'border-b', 'border-border-subtle')}>
          <Link href="/" className={clsx('flex', 'items-center', 'gap-2')}>
            <Image
              src="/Rentral.svg"
              alt=""
              width={28}
              height={28}
              className={clsx('h-7', 'w-7', 'object-contain', 'brightness-0', 'invert')}
            />
            <span className={clsx('text-sm', 'font-bold', 'uppercase', 'tracking-[0.2em]')}>Rentral</span>
          </Link>
          <button
            type="button"
            className={clsx('flex', 'h-9', 'w-9', 'items-center', 'justify-center', 'rounded-full', 'border', 'border-glass-border-medium', 'bg-glass-light', 'cursor-pointer')}
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
          >
            <svg className={clsx('h-4', 'w-4')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className={clsx('flex', 'flex-col', 'gap-1', 'p-6')}>
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={clsx('glass-link', 'flex', 'items-center', 'justify-between', 'rounded-xl', 'px-4', 'py-3', 'text-sm', 'font-semibold', 'text-text-secondary', 'transition-all', 'hover:bg-glass-light', 'hover:text-text-primary')}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
              {link.hasDropdown && (
                <svg className={clsx('h-4', 'w-4', 'opacity-50')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </a>
          ))}
        </div>
        <div className={clsx('p-6', 'mt-auto', 'border-t', 'border-border-subtle')}>
          <a
            href="/sign-in"
            className={clsx('glass-btn', 'flex', 'items-center', 'justify-center', 'rounded-xl', 'bg-accent-primary', 'px-6', 'py-3.5', 'text-xs', 'font-bold', 'uppercase', 'tracking-wider', 'text-text-inverse', 'w-full')}
          >
            Sign In
          </a>
        </div>
      </div>
    </main>
  );
}
