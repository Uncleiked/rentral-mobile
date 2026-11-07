"use client";

import { useState } from "react";
import { ArrowUpRight, CarFront, House, MapPin, Sailboat } from "lucide-react";
import { cn } from "@/lib/utils";

const categories = [{ value: "house", label: "Homes", icon: House }, { value: "car", label: "Cars", icon: CarFront }, { value: "boat", label: "Boats", icon: Sailboat }];

export function HomeSearch(): React.JSX.Element {
  const [category, setCategory] = useState("house");

  return (
    <form action="/marketplace" method="get" className="home-search">
      <fieldset className="home-search-categories"><legend className="sr-only">What would you like to rent?</legend>{categories.map((item) => <label key={item.value} className={cn("home-search-category", category === item.value && "home-search-category-active")}><input type="radio" name="category" value={item.value} checked={category === item.value} onChange={() => setCategory(item.value)} className="sr-only" /><item.icon className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" /><span>{item.label}</span></label>)}</fieldset>
      <div className="home-search-main"><div className="home-search-location"><MapPin className="h-5 w-5 shrink-0 text-accent-hover" aria-hidden="true" /><div className="min-w-0 flex-1"><label htmlFor="home-location" className="block text-xs font-semibold text-text-primary">Where’s your next?</label><input id="home-location" name="q" type="search" placeholder="Try Lekki, Ikoyi, Victoria Island…" autoComplete="off" maxLength={120} className="w-full min-w-0 bg-transparent py-1 text-sm text-text-secondary outline-none placeholder:text-text-muted" /></div></div><button type="submit" className="home-search-submit">Find your next <ArrowUpRight className="h-5 w-5" aria-hidden="true" /></button></div>
    </form>
  );
}
