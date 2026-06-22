'use server'

import { createClient } from '@/lib/server'

export async function login(formData: FormData) {
  const supabase = await createClient()
  
  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    return { error: error.message }
  }

  // Check if user has completed KYC
  const { data: { user } } = await supabase.auth.getUser()
  const kycVerified = user?.user_metadata?.kyc_verified === true

  return { success: true, redirectTo: kycVerified ? '/feed' : '/onboarding' }
}

export async function signup(formData: FormData) {
  const supabase = await createClient()
  
  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

const { error } = await supabase.auth.signUp(data)

if (error) {
  console.log("SUPABASE SIGNUP ERROR:", error.message)
  redirect('/auth/login?error=Could not create user')
}

  // New users always go to onboarding
  return { success: true, redirectTo: '/onboarding' }
}
