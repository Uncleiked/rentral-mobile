"use client";

import { useState } from "react";
import { SettingsMenu } from "@/components/profile/SettingsMenu";
import { ShareMenu } from "@/components/profile/ShareMenu";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import type { OwnProfileDetails } from "@/lib/profile-data";

interface OwnerProfileActionsProps {
  profile: OwnProfileDetails;
}

export function OwnerProfileActions({ profile }: OwnerProfileActionsProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsEditOpen(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-glass-light border border-glass-border-medium text-text-primary hover:bg-glass-light-hover active:scale-95 transition-all"
        >
          Edit profile
        </button>
        <SettingsMenu onEditProfile={() => setIsEditOpen(true)} />
        <ShareMenu username={profile.username} />
      </div>

      <EditProfileModal profile={profile} isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} />
    </>
  );
}
