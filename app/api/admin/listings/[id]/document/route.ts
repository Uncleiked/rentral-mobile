import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStaffId } from '@/lib/operations/access'
import { createAdminClient } from '@/lib/admin'
import prisma from '@/lib/db'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
  try {
    if (!await requireStaffId('listing:review')) return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404, headers })
    const { id } = await params
    if (!z.uuid().safeParse(id).success) return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404, headers })
    const row = await prisma.listing.findUnique({ where: { id }, select: { document_path: true, lister_id: true } })
    if (!row?.document_path?.startsWith(`${row.lister_id}/`)) return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404, headers })
    const { data, error } = await createAdminClient().storage.from('compliance-docs').createSignedUrl(row.document_path, 60)
    if (error || !data) throw new Error('SIGNING_FAILED')
    return new Response(null, { status: 302, headers: { ...headers, Location: data.signedUrl } })
  } catch { return NextResponse.json({ success: false, error: 'Document could not be opened.' }, { status: 503, headers }) }
}
