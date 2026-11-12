import { AccountPage } from '@/components/layout/AccountPage'
import { EmailConfirmationForm } from '@/components/account/EmailConfirmationForm'
import { accountCard } from '@/components/ui/account-styles'

export default function ConfirmEmailPage() {
  return <AccountPage><section className={accountCard}>
    <p className="text-xs font-semibold uppercase tracking-widest text-accent-hover">Your Rentral account</p>
    <h1 className="mb-5 mt-3 text-2xl font-semibold tracking-tight text-text-primary">Confirm your email change</h1>
    <EmailConfirmationForm />
  </section></AccountPage>
}
