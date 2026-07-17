import clsx from "clsx";
import Image from "next/image";

interface ProfileAvatarProps {
  username: string;
  avatarUrl?: string | null;
  accountType: "individual" | "organization";
  size?: "md" | "lg";
}

function getInitials(username: string): string {
  const segments = username.split("_").filter(Boolean);
  if (segments.length >= 2) {
    return (segments[0][0] + segments[1][0]).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase() || "?";
}

export function ProfileAvatar({ username, avatarUrl, accountType, size = "lg" }: ProfileAvatarProps) {
  const isOrganization = accountType === "organization";
  const ringClass = isOrganization ? "border-accent-warm" : "border-accent-primary";
  const sizeClass = size === "lg" ? "h-24 w-24 text-2xl" : "h-11 w-11 text-sm";

  if (avatarUrl) {
    return (
      <div className={clsx("relative rounded-full overflow-hidden flex-shrink-0 border-2", ringClass, sizeClass)}>
        <Image src={avatarUrl} alt={username} fill className="object-cover" />
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "flex items-center justify-center rounded-full flex-shrink-0",
        "bg-surface-card border-2",
        ringClass,
        isOrganization ? "text-accent-warm" : "text-accent-hover",
        sizeClass,
        "font-bold"
      )}
    >
      {getInitials(username)}
    </div>
  );
}
