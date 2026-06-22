'use server'

import { createClient } from '@/lib/server'
import prisma from '@/lib/db'
import { redirect } from 'next/navigation'

const WORKFLOW_ID = "75f4f3af-4620-4a93-88c7-78f5f1382ac4"

/**
 * Save the user's chosen account type and initiate a Didit verification session.
 * Returns the Didit session URL so the client can redirect.
 */
export async function initiateVerification(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const role = formData.get('role') as string

  try {
    // 1. Save account type to Prisma (upsert in case row doesn't exist yet)
    await prisma.user.upsert({
      where: { id: user.id },
      update: { account_type: role },
      create: {
        id: user.id,
        email: user.email!,
        account_type: role,
      },
    })

    // 2. Also persist role in Supabase user metadata for middleware access
    await supabase.auth.updateUser({
      data: { account_type: role },
    })

    // 3. Create a Didit verification session directly
    const res = await fetch("https://verification.didit.me/v3/session/", {
      method: "POST",
      headers: {
        "x-api-key": process.env.DIDIT_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workflow_id: WORKFLOW_ID,
        vendor_data: user.id,
        callback: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/onboarding`,
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      console.error("Didit session creation failed:", detail)
      return { error: "Failed to start verification. Please try again." }
    }

    const session = await res.json()
    return { url: session.url, session_id: session.session_id }
  } catch (error) {
    console.error('initiateVerification error:', error)
    return { error: "An unexpected error occurred. Please try again." }
  }
}

/**
 * Check if the user has been verified (e.g. webhook already processed)
 * and redirect them to /feed if so.
 */
export async function refreshStatus() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  let isVerified = false

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    })

    if (dbUser?.kyc_verified) {
      // Sync the verified state back into the Supabase JWT
      await supabase.auth.updateUser({
        data: {
          kyc_verified: true,
          account_type: dbUser.account_type,
        },
      })
      isVerified = true
    } else {
      return { error: "Your identity has not been verified yet. Please complete the Didit verification flow." }
    }
  } catch (error) {
    return { error: "Could not fetch verification status." }
  }

  if (isVerified) {
    redirect('/feed')
  }
}