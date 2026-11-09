import { requireUserId } from '@/lib/action-helpers'
import { analyticsPrivacy } from '@/lib/analytics/service'
import { PublicPage } from '@/components/layout/PublicPage'
import { AnalyticsPreferences } from '@/components/privacy/AnalyticsPreferences'

export default async function PrivacyPage() {
  const userId = await requireUserId()
  const allowed = userId ? (await analyticsPrivacy(userId)).allowed : false
  return <PublicPage eyebrow="Your information" title="Privacy, with clear choices.">
    <p>Rentral uses account information, listing recordings, device-location evidence and transaction records to operate the marketplace. There is no identity-verification onboarding. Exact recording coordinates and compliance documents stay outside public listing responses.</p>
    <section><h2 className="mb-3 text-xl font-semibold text-text-primary">How your information is used</h2><p>Account authentication and uploaded files use this backend. Optional video processing, document screening and Paystack payments share only the information needed for their enabled functions. Document screening supports human review. Personal documents are not public profile content.</p></section>
    <section><h2 className="mb-3 text-xl font-semibold text-text-primary">Messages and operational records</h2><p>Server checks limit conversations to their participants. Staff access follows current roles, and review decisions are audited. Financial and evidence records are retained separately from optional analytics. Closing an account does not erase financial obligations or review history.</p></section>
    <AnalyticsPreferences initialAllowed={allowed} />
    <section><h2 className="mb-3 text-xl font-semibold text-text-primary">Analytics retention</h2><p>Optional analytics use monthly pseudonymous identifiers and coarse preferences. They may include searches, listing views, checkout interest, verified bookings and labeled sponsorship interactions. Reports require at least ten distinct contributors for each displayed group. Raw analytics are retained for at most 90 days by the configured worker. You can withdraw consent and remove your mapped analytics above; private financial records remain separate.</p></section>
    <section><h2 className="mb-3 text-xl font-semibold text-text-primary">Optional remote notifications</h2><p>Remote push requires an explicit device opt-in. The backend encrypts the Expo push token and sends a generic prompt to open your notifications; message contents and private links are excluded. Revoking a device or signing out disables its session binding. An in-flight provider submission may already have left the backend.</p><p>The configured worker considers only unread notifications from the preceding 24 hours, after the operator cutoff and device opt-in. Derived push-delivery metadata is pruned after 90 days. Your in-app notification history and device proof/token hashes used to prevent reassignment remain; this pruning does not erase account, financial or evidence history.</p></section>
  </PublicPage>
}
