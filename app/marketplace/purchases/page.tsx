import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { requireUserId } from '@/lib/action-helpers'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { PurchasesWorkspace } from '@/components/commerce/PurchasesWorkspace'
export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!await requireUserId()) redirect('/sign-in')
  const search = await searchParams, order = search.order === undefined ? undefined : z.uuid().safeParse(search.order)
  if (order && !order.success) notFound()
  return <MarketplaceShell><div className="mx-auto w-full max-w-4xl space-y-7 px-4 py-8 sm:px-6 sm:py-12"><header><p className="text-xs uppercase tracking-widest text-accent-hover">Your commercial services</p><h1 className="mt-3 text-3xl font-semibold">Purchases and payment status</h1><p className="mt-3 text-sm leading-relaxed text-text-muted">Review the exact order, use Paystack checkout when available, and reconcile an existing reference before creating another payment.</p></header><PurchasesWorkspace selectedOrderId={order?.success ? order.data : undefined} /></div></MarketplaceShell>
}
