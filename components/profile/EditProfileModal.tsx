"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, CheckCircle2, Loader2 } from "lucide-react";
import { usernameBioSchema } from "@/lib/schemas";
import { checkUsernameAvailability, updateProfileIdentity } from "@/app/actions/profile-edit";
import type { OwnProfileDetails } from "@/lib/profile-data";
import type { z } from "zod";

type IdentityFormData = z.infer<typeof usernameBioSchema>;

interface EditProfileModalProps {
  profile: OwnProfileDetails;
  isOpen: boolean;
  onClose: () => void;
}

const inputClass =
  "w-full min-h-11 min-w-0 max-w-full bg-background-app border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-1 focus:ring-accent-primary focus:outline-none transition-all";
const readOnlyInputClass =
  "w-full min-h-11 min-w-0 max-w-full bg-surface-card border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-muted cursor-not-allowed";
const labelClass = "text-xs font-medium uppercase tracking-wider text-text-muted";

export function EditProfileModal({ profile, isOpen, onClose }: EditProfileModalProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identitySuccess, setIdentitySuccess] = useState(false);
  const [usernameCheck, setUsernameCheck] = useState<{ username: string; status: 'available' | 'taken' | 'error' } | null>(null);

  const {
    register: registerIdentity,
    handleSubmit: handleIdentitySubmit,
    control: identityControl,
    formState: { errors: identityErrors, isSubmitting: isSavingIdentity },
  } = useForm<IdentityFormData>({
    resolver: zodResolver(usernameBioSchema),
    defaultValues: { username: profile.username, bio: profile.bio ?? "" },
  });

  const watchedUsername = useWatch({ control: identityControl, name: "username" });
  const watchedBio = useWatch({ control: identityControl, name: "bio" });
  const usernameStatus = watchedUsername === profile.username ? 'idle'
    : usernameCheck?.username === watchedUsername ? usernameCheck.status : 'checking';

  useEffect(() => {
    if (!isOpen || watchedUsername === profile.username) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const result = await checkUsernameAvailability(watchedUsername);
        if (!cancelled) setUsernameCheck({ username: watchedUsername, status: result.available ? 'available' : 'taken' });
      } catch {
        if (!cancelled) setUsernameCheck({ username: watchedUsername, status: 'error' });
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [watchedUsername, isOpen, profile.username]);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  async function onSubmitIdentity(data: IdentityFormData) {
    setIdentityError(null);
    setIdentitySuccess(false);

    if (usernameStatus === "taken") {
      setIdentityError("That username is already taken.");
      return;
    }

    const result = await updateProfileIdentity({ username: data.username, bio: data.bio ?? "" });
    if (!result.success) {
      setIdentityError(result.error);
      return;
    }

    setIdentitySuccess(true);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-contain bg-glass-dark p-4 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="edit-profile-title" tabIndex={-1} onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
        if (event.key !== "Tab") return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]')).filter(item => item.getClientRects().length > 0);
        const first = items[0], last = items[items.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first.focus(); }
      }} className="w-full min-w-0 max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-surface-card border border-border-subtle rounded-2xl shadow-2xl p-4 sm:p-6 flex flex-col gap-6 wrap-anywhere text-text-primary">
        <div className="flex items-center justify-between min-w-0 flex-wrap gap-3">
          <h2 id="edit-profile-title" className="text-lg font-bold text-text-primary break-words">Edit profile</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-glass-light-hover active:scale-95 transition-all text-text-primary min-h-11 max-w-full whitespace-normal break-words"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Username + Bio */}
        <form onSubmit={handleIdentitySubmit(onSubmitIdentity)} className="flex flex-col gap-4 min-w-0 max-w-full">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-profile-username" className={labelClass}>Username</label>
            <input id="edit-profile-username" {...registerIdentity("username")} className={inputClass} placeholder="username" />
            {identityErrors.username && (
              <span className="text-xs text-trust-flagged">{identityErrors.username.message}</span>
            )}
            {!identityErrors.username && usernameStatus === "checking" && (
              <span className="text-xs text-text-muted flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking availability...
              </span>
            )}
            {!identityErrors.username && usernameStatus === "available" && (
              <span className="text-xs text-accent-hover flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Username available
              </span>
            )}
            {!identityErrors.username && usernameStatus === "taken" && (
              <span className="text-xs text-trust-flagged">That username is already taken.</span>
            )}
            {usernameStatus === 'error' && <span className="text-xs text-trust-flagged">Availability check failed. Try saving again.</span>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-profile-bio" className={labelClass}>Bio</label>
            <textarea
              id="edit-profile-bio"
              {...registerIdentity("bio")}
              rows={3}
              maxLength={280}
              className={`${inputClass} resize-none`}
              placeholder="Tell people a little about yourself"
            />
            <span className="text-xs text-text-muted self-end">{(watchedBio ?? "").length}/280</span>
            {identityErrors.bio && <span className="text-xs text-trust-flagged">{identityErrors.bio.message}</span>}
          </div>

          {identityError && <p className="text-xs text-trust-flagged">{identityError}</p>}
          {identitySuccess && <p className="text-xs text-accent-hover">Profile updated.</p>}

          <button
            type="submit"
            disabled={isSavingIdentity || usernameStatus === "checking"}
            className="w-full rounded-xl bg-accent-primary px-4 py-3 text-center text-sm font-semibold text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 min-h-11 max-w-full whitespace-normal break-words"
          >
            {isSavingIdentity ? "Saving..." : "Save changes"}
          </button>
        </form>

        <div className="h-px bg-border-subtle" />

        {/* Email */}
        <div className="flex flex-col gap-2">
          <p className={labelClass}>Email</p>
          <p className="wrap-anywhere text-sm text-text-primary">{profile.email}</p>
          <p className="text-xs leading-relaxed text-text-muted">Email changes require your current password and confirmation from both inboxes.</p>
          <button type="button" onClick={() => { onClose(); requestAnimationFrame(() => document.getElementById('account-security')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} className="mt-2 min-h-11 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-sm font-semibold text-text-primary hover:bg-glass-light-hover max-w-full whitespace-normal break-words">Open account security</button>
        </div>

        <div className="h-px bg-border-subtle" />

        {/* Previously saved personal details */}
        <div className="flex flex-col gap-4">
          <p className="text-xs text-text-muted leading-relaxed">
            These are your previously saved personal details. Your public username and bio can be updated above.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-profile-name" className={labelClass}>{profile.accountType === "organization" ? "Organization Name" : "Full Name"}</label>
              <input id="edit-profile-name" value={profile.displayName} disabled readOnly className={readOnlyInputClass} />
            </div>

            {profile.dateOfBirth && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-profile-birthdate" className={labelClass}>Date of Birth</label>
                <input id="edit-profile-birthdate" value={profile.dateOfBirth} disabled readOnly className={readOnlyInputClass} />
              </div>
            )}

            {profile.phoneNumber && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-profile-phone" className={labelClass}>Phone Number</label>
                <input id="edit-profile-phone" value={profile.phoneNumber} disabled readOnly className={readOnlyInputClass} />
              </div>
            )}

            {profile.country && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-profile-country" className={labelClass}>Country</label>
                <input id="edit-profile-country" value={profile.country} disabled readOnly className={readOnlyInputClass} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
