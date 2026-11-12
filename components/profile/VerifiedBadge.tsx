interface VerifiedBadgeProps {
  size?: "sm" | "md";
}

export function VerifiedBadge({ size = "sm" }: VerifiedBadgeProps) {
  return (
    <div
      className={
        size === "sm"
          ? "h-3.5 w-3.5 rounded-full bg-trust-verified flex items-center justify-center flex-shrink-0"
          : "h-5 w-5 rounded-full bg-trust-verified flex items-center justify-center flex-shrink-0"
      }
    >
      <svg
        viewBox="0 0 24 24"
        className={size === "sm" ? "h-2.5 w-2.5 text-text-inverse" : "h-3.5 w-3.5 text-text-inverse"}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}
