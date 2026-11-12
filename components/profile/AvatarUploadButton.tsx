"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/client";
import { updateAvatarUrl } from "@/app/actions/profile-edit";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import type { ProfileRecord } from "@/lib/profile-data";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface AvatarUploadButtonProps {
  profile: ProfileRecord;
}

export function AvatarUploadButton({ profile }: AvatarUploadButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Use a JPEG, PNG, or WEBP image.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Image must be under 2MB.");
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const supabase = createClient();
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${profile.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-avatars")
        .upload(path, file, { contentType: file.type, cacheControl: "3600" });

      if (uploadError) {
        setError("Upload failed. Please try again.");
        return;
      }

      const { data: publicUrlData } = supabase.storage.from("profile-avatars").getPublicUrl(path);
      const result = await updateAvatarUrl(publicUrlData.publicUrl);

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.refresh();
    } catch {
      setError("Your photo could not be uploaded. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <ProfileAvatar
          username={profile.username}
          avatarUrl={profile.avatarUrl}
          accountType={profile.accountType}
          size="md"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          aria-label="Change profile photo"
          className={clsx(
            "absolute -bottom-1 -right-1 h-7 w-7 flex items-center justify-center rounded-full",
            "bg-accent-primary text-text-inverse border-2 border-background-app",
            "hover:bg-accent-hover active:scale-95 transition-all disabled:opacity-70"
          )}
        >
          {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          onChange={handleFileChange}
          className="hidden min-h-11 min-w-0 max-w-full"
        />
      </div>
      {error && <span className="text-xs text-trust-flagged max-w-[120px]">{error}</span>}
    </div>
  );
}
