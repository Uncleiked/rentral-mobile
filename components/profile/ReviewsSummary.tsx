import { Star } from "lucide-react";

interface ReviewsSummaryProps {
  reviewsCount: number;
  trustScore: string;
}

export function ReviewsSummary({ reviewsCount, trustScore }: ReviewsSummaryProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="rounded-full bg-glass-light p-4">
        <Star className="h-6 w-6 text-text-muted" />
      </div>
      <p className="text-sm font-semibold text-text-primary">
        {trustScore} average across {reviewsCount} reviews
      </p>
      <p className="text-sm text-text-muted max-w-xs">
        Reviews are collected automatically after a verified GPS handshake at inspection.
      </p>
    </div>
  );
}
