"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, CheckCircle2, Loader2 } from "lucide-react";
import { usernameBioSchema, emailChangeSchema } from "@/lib/schemas";
import { checkUsernameAvailability, updateProfileIdentity, requestEmailChange } from "@/app/actions/profile-edit";
import type { OwnProfileDetails } from "@/lib/profile-data";
import type { z } from "zod";

type IdentityFormData = z.infer<typeof usernameBioSchema>;
type EmailFormData = z.infer<typeof emailChangeSchema>;

interface EditProfileModalProps {
  profile: OwnProfileDetails;
  isOpen: boolean;
  onClose: () => void;
}

const inputClass =
  "bg-background-app border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-1 focus:ring-accent-primary focus:outline-none transition-all";
const readOnlyInputClass =
  "bg-surface-card border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-muted cursor-not-allowed";
const labelClass = "text-xs font-medium uppercase tracking-wider text-text-muted";

export function EditProfileModal({ profile, isOpen, onClose }: EditProfileModalProps) {
  const router = useRouter();
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identitySuccess, setIdentitySuccess] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailPending, setEmailPending] = useState(false);

  const {
    register: registerIdentity,
    handleSubmit: handleIdentitySubmit,
    watch: watchIdentity,
    formState: { errors: identityErrors, isSubmitting: isSavingIdentity },
  } = useForm<IdentityFormData>({
    // zod 4's internal type shape isn't yet recognized by @hookform/resolvers 5's
    // Zod3Type overload (runtime works fine) — same pre-existing cast used in
    // components/onboarding/ProfileForm.tsx for the same version mismatch.
    resolver: zodResolver(usernameBioSchema as never) as never,
    defaultValues: { username: profile.username, bio: profile.bio ?? "" },
  });

  const {
    register: registerEmail,
    handleSubmit: handleEmailSubmit,
    formState: { errors: emailErrors, isSubmitting: isSendingEmail },
  } = useForm<EmailFormData>({
    resolver: zodResolver(emailChangeSchema as never) as never,
    defaultValues: { email: "" },
  });

  const watchedUsername = watchIdentity("username");
  const watchedBio = watchIdentity("bio");

  useEffect(() => {
    if (!isOpen) return;
    if (watchedUsername === profile.username) {
      setUsernameStatus("idle");
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setUsernameStatus("checking");

    debounceRef.current = setTimeout(async () => {
      const result = await checkUsernameAvailability(watchedUsername);
      setUsernameStatus(result.available ? "available" : "taken");
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedUsername, isOpen]);

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

  async function onSubmitEmail(data: EmailFormData) {
    setEmailError(null);
    const result = await requestEmailChange(data.email);
    if (!result.success) {
      setEmailError(result.error);
      return;
    }
    setEmailPending(true);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-surface-card border border-border-subtle rounded-2xl shadow-2xl p-6 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Edit profile</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-glass-light-hover active:scale-95 transition-all text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Username + Bio */}
        <form onSubmit={handleIdentitySubmit(onSubmitIdentity)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Username</label>
            <input {...registerIdentity("username")} className={inputClass} placeholder="username" />
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
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Bio</label>
            <textarea
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
            className="w-full rounded-xl bg-accent-primary px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSavingIdentity ? "Saving..." : "Save changes"}
          </button>
        </form>

        <div className="h-px bg-border-subtle" />

        {/* Email */}
        <form onSubmit={handleEmailSubmit(onSubmitEmail)} className="flex flex-col gap-2">
          <label className={labelClass}>Email</label>
          <p className="text-sm text-text-primary">{profile.email}</p>
          {profile.pendingEmail && (
            <p className="text-xs text-accent-warm">
              Confirmation pending for {profile.pendingEmail}. Check both inboxes.
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <input {...registerEmail("email")} className={`${inputClass} flex-1`} placeholder="New email address" />
            <button
              type="submit"
              disabled={isSendingEmail}
              className="px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wide bg-glass-light border border-glass-border-medium text-text-primary hover:bg-glass-light-hover active:scale-95 transition-all disabled:opacity-70"
            >
              {isSendingEmail ? "Sending..." : "Change"}
            </button>
          </div>
          {emailErrors.email && <span className="text-xs text-trust-flagged">{emailErrors.email.message}</span>}
          {emailError && <p className="text-xs text-trust-flagged">{emailError}</p>}
          {emailPending && (
            <p className="text-xs text-accent-hover">
              Confirmation links sent to your current and new email. Click both to complete the change.
            </p>
          )}
        </form>

        <div className="h-px bg-border-subtle" />

        {/* Read-only KYC fields */}
        <div className="flex flex-col gap-4">
          <p className="text-xs text-text-muted leading-relaxed">
            These details come from identity verification and can&apos;t be changed here.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{profile.accountType === "organization" ? "Organization Name" : "Full Name"}</label>
              <input value={profile.displayName} disabled readOnly className={readOnlyInputClass} />
            </div>

            {profile.dateOfBirth && (
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Date of Birth</label>
                <input value={profile.dateOfBirth} disabled readOnly className={readOnlyInputClass} />
              </div>
            )}

            {profile.phoneNumber && (
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Phone Number</label>
                <input value={profile.phoneNumber} disabled readOnly className={readOnlyInputClass} />
              </div>
            )}

            {profile.country && (
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Country</label>
                <input value={profile.country} disabled readOnly className={readOnlyInputClass} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
