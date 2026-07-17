"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function EmailChangeToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const status = searchParams.get("email_change");

  useEffect(() => {
    if (!status) return;

    if (status === "confirmed") {
      toast.success("Email address updated.");
    } else if (status === "pending") {
      toast.info("One confirmation done — check your other inbox to finish changing your email.");
    }

    router.replace("/marketplace/profile");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return null;
}
