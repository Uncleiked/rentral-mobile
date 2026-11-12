import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, BadgeCheck, Camera, MapPin, ShieldCheck } from "lucide-react";
import { HomeMotion } from "@/components/home/HomeMotion";
import { HomeNavigation } from "@/components/home/HomeNavigation";
import { HomeSearch } from "@/components/home/HomeSearch";
import { HomeCategoryCard } from "@/components/home/HomeCategoryCard";
import { HomeFooter } from "@/components/home/HomeFooter";

const categories = [
  { category: "house", title: "A place to belong.", label: "Homes & apartments", description: "Your own corner of the city. From a fresh start to a little more room to grow.", image: "/home/category-home.jpg", alt: "Modern home with a garden and an open, sunlit entrance", number: "01" },
  { category: "car", title: "Go your own way.", label: "Cars & SUVs", description: "For the everyday commute, the weekend escape, and everything in between.", image: "/home/category-car.jpg", alt: "Silver sports car on a quiet road", number: "02" },
  { category: "boat", title: "Make room for wonder.", label: "Boats & yachts", description: "Trade the traffic for the water. Make your next day out a little less ordinary.", image: "/home/category-boat.jpg", alt: "White yacht on clear blue water", number: "03" },
];

const trustSteps = [
  { number: "01", icon: BadgeCheck, title: "Know who you’re renting from.", description: "Member profiles and reviews help you learn about the person behind a listing. Ask questions before making a booking." },
  { number: "02", icon: Camera, title: "See beyond the perfect photo.", description: "Recorded walkthroughs give you a closer look. Explore the space, ask better questions, and decide with more context." },
  { number: "03", icon: ShieldCheck, title: "Keep the important details close.", description: "Save your favourites, speak to the host, and keep your rental requests together. Check each listing’s review status before you commit." },
];

export default function Home(): React.JSX.Element {
  return (
    <HomeMotion>
      <a href="#main-content" className="home-skip-link">Skip to content</a>
      <HomeNavigation />
      <main id="main-content">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-mask" aria-hidden="true">
            <Image src="/home/hero-home.jpg" alt="" fill preload sizes="100vw" className="home-hero-photo object-cover" />
          </div>
          <div className="home-hero-shade" />
          <div className="home-hero-content home-container">
            <p className="home-eyebrow home-hero-intro"><span className="home-status-dot" /> A new way to rent in Lagos</p>
            <h1 id="home-title" className="home-title">
              <span className="home-title-line"><span className="home-title-word">Live a little.</span></span>
              <span className="home-title-line"><span className="home-title-word home-title-soft">Find your next.</span></span>
            </h1>
            <div className="home-hero-bottom home-hero-intro">
              <p>Good spaces. Open roads. Days on the water.<br className="hidden sm:block" /> One place to find what moves you.</p>
              <a href="#explore" className="home-round-link" aria-label="Explore homes, cars and boats"><ArrowDown className="h-5 w-5" aria-hidden="true" /></a>
            </div>
          </div>
          <div className="home-hero-caption" aria-hidden="true"><span>Spaces for what comes next</span><span>01 / 03</span></div>
        </section>

        <section className="home-search-section home-container" aria-label="Find your rental">
          <HomeSearch />
          <div className="home-search-footnote"><span><MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Starting in Lagos, Nigeria</span><span>One account. More possibilities.</span></div>
        </section>

        <section id="explore" className="home-categories home-container" aria-labelledby="explore-title">
          <div className="home-section-heading" data-reveal>
            <div><p className="home-eyebrow text-accent-hover">A city of possibilities</p><h2 id="explore-title">What’s your<br className="sm:hidden" /> next move?</h2></div>
            <Link href="/marketplace" className="home-text-link">Explore the marketplace <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
          </div>
          <div className="home-category-grid">
            {categories.map((category) => <HomeCategoryCard key={category.category} {...category} />)}
          </div>
          <p className="mt-5 text-xs leading-relaxed text-text-muted">A little inspiration for what’s next. Photography is illustrative; browse the marketplace for available listings.</p>
        </section>

        <div className="home-motion-ribbon" aria-hidden="true"><div className="home-motion-track">{[0,1].map(index=><span key={index}>Spaces to settle. <i /> Roads to explore. <i /> Room to breathe. <i /> Find your next. <i /></span>)}</div></div>

        <section id="how-it-works" className="home-trust-section" aria-labelledby="trust-title">
          <div className="home-container">
            <div className="home-trust-heading" data-reveal>
              <p className="home-eyebrow text-accent-hover">More confidence. Less guesswork.</p>
              <h2 id="trust-title">Big decisions.<br /><span className="text-text-muted">A little more peace of mind.</span></h2>
              <p className="home-trust-description">Finding the right rental is personal. We’re bringing people, walkthroughs, and the details that matter into one place.</p>
            </div>
            <div className="home-trust-grid">
              {trustSteps.map((step) => (
                <article key={step.number} className="home-trust-step" data-reveal>
                  <div className="home-trust-step-top"><step.icon className="h-7 w-7 text-accent-hover" strokeWidth={1.5} aria-hidden="true" /><span>{step.number}</span></div>
                  <h3>{step.title}</h3><p>{step.description}</p>
                </article>
              ))}
            </div>
            <Link href="/help" className="home-text-link mt-8">How Rentral works <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </div>
        </section>

        <section className="home-host-section home-container" aria-labelledby="host-title">
          <div className="home-host-photo" data-reveal><Image src="/home/category-home.jpg" alt="Welcoming home with a landscaped garden" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" /></div>
          <div className="home-host-copy" data-reveal>
            <p className="home-eyebrow text-accent-hover">For the people with something to share</p>
            <h2 id="host-title">Your space.<br />Their next chapter.</h2>
            <p>A home, a car, a boat. Turn what you have into someone’s next possibility. Create your profile, share a walkthrough, and show people what makes your listing worth a closer look. Any publication fee is shown before you submit.</p>
            <Link href="/marketplace/listing/create" className="home-button-primary">Start your listing <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
            <span className="home-host-note"><BadgeCheck className="h-4 w-4" aria-hidden="true" /> Sign in to create your first listing.</span>
          </div>
        </section>

        <section className="home-final-section home-container" aria-labelledby="final-title" data-reveal>
          <p className="home-eyebrow text-accent-hover">Make yourself at home</p>
          <h2 id="final-title">The city is yours.<br /><span className="text-text-muted">Go find your part of it.</span></h2>
          <Link href="/marketplace" className="home-button-primary">Find your next <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
        </section>
      </main>
      <HomeFooter />
    </HomeMotion>
  );
}
