import Link from 'next/link'
import { PublicPage } from '@/components/layout/PublicPage'

export default function HelpPage() {
  return <PublicPage eyebrow="A little guidance" title="Make your next move with confidence.">
    <section><h2 className="mb-3 text-xl font-semibold text-text-primary">Find a place, a ride, or time on the water</h2><p>Explore homes, cars and boats. Filter by neighborhood, budget and the details that matter to you. Watch the walkthrough, read the host’s terms, and ask questions in the listing conversation before requesting a booking.</p></section>
    <section><h2 className="mb-3 text-xl font-semibold text-text-primary">One account. More possibilities.</h2><p>Sign in with your email and password to use protected marketplace features. Identity onboarding is not required. You can look for a rental and list an asset using the same account.</p></section>
    <section><h2 className="mb-3 text-xl font-semibold text-text-primary">Record on site. Finish on desktop.</h2><p>Use the camera in Rentral to record a walkthrough of up to two minutes with your device location enabled. Save the draft in your Media Vault, then return on your desktop to add details and documents. Each saved recording stays separate, including recordings made at the same location.</p></section>
    <section><h2 className="mb-3 text-xl font-semibold text-text-primary">Know what is verified</h2><p>Identity checks, address matching, document review and payment confirmation are separate. Device location is supporting evidence. A verification badge is not a guarantee of ownership, condition or a risk-free transaction.</p></section>
    <section><h2 className="mb-3 text-xl font-semibold text-text-primary">Bookings, check-in and payments</h2><p>Hosts review requests before checkout. Inspections use a time-limited code and on-site check-in. Only confirmed provider events count as payments. If payments are unavailable, Rentral will say so. Payment receipt, inspection completion and payout are shown as separate states.</p></section>
    <section><h2 className="mb-3 text-xl font-semibold text-text-primary">Something doesn’t look right?</h2><p>Open your booking to report a problem. Keep your conversation and transaction reference available. Never share passwords or identity documents in chat.</p><Link href="/marketplace/support" className="mt-4 inline-block font-semibold text-accent-hover">Open support →</Link></section>
  </PublicPage>
}
