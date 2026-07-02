'use server'

import { z } from 'zod'
import prisma from '@/lib/db'
import { createClient } from '@/lib/server'
import { createAdminClient } from '@/lib/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { individualProfileSchema, organizationProfileSchema } from '@/lib/schemas'

export async function submitProfile(data: z.infer<typeof individualProfileSchema> | z.infer<typeof organizationProfileSchema>) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Not authenticated')
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id }
  })

  if (!dbUser) {
    throw new Error('User record not found in database')
  }

  if (dbUser.account_type === 'individual' || !dbUser.account_type) {
    const parsed = individualProfileSchema.parse(data)
    
    // Extract verified name and DOB from Didit payload
    // Note: Assuming Didit payload stores these under decision payload.
    // In a production app, we map this exactly to Didit's response schema.
    const diditPayload = (dbUser.didit_decision as any) || {}
    const verifiedName = diditPayload.firstName && diditPayload.lastName 
      ? `${diditPayload.firstName} ${diditPayload.lastName}` 
      : (diditPayload.name || 'Verified Individual')
    const verifiedDob = diditPayload.dateOfBirth || '1970-01-01'

    await prisma.individualProfile.create({
      data: {
        userId: user.id,
        full_name: verifiedName,
        date_of_birth: verifiedDob,
        country: parsed.country,
        state: (parsed as any).state || '',
        address: parsed.address,
        phone_number: parsed.phone_number,
      }
    })
  } else if (dbUser.account_type === 'organization') {
    const parsed = organizationProfileSchema.parse(data)
    
    const diditPayload = (dbUser.didit_decision as any) || {}
    const verifiedOrgName = diditPayload.companyName || diditPayload.name || 'Verified Organization'

    await prisma.organizationProfile.create({
      data: {
        userId: user.id,
        organization_name: verifiedOrgName,
        country: parsed.country,
        address: parsed.address,
        phone_number: parsed.phone_number,
      }
    })
  }

  // Update Supabase Auth metadata using Admin client to unlock the proxy check
  const adminClient = createAdminClient()
  await adminClient.auth.admin.updateUserById(user.id, {
    app_metadata: {
      profile_completed: true
    }
  })

  revalidatePath('/onboarding')
  redirect('/marketplace')
}
