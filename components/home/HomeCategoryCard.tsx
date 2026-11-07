import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

type HomeCategoryCardProps = { category: string; title: string; label: string; description: string; image: string; alt: string; number: string };

export function HomeCategoryCard({ category, title, label, description, image, alt, number }: HomeCategoryCardProps): React.JSX.Element {
  return (
    <Link href={`/marketplace?category=${category}`} className="home-category-card group" data-reveal>
      <div className="home-category-photo"><Image src={image} alt={alt} fill sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw" className="object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none" /><span className="home-category-label">{label}</span><span className="home-category-arrow"><ArrowUpRight className="h-5 w-5" aria-hidden="true" /></span></div>
      <div className="home-category-heading"><h3>{title}</h3><span>{number}</span></div><p>{description}</p>
    </Link>
  );
}
