import { HeroBackground } from '@/components/ui/HeroBackground'
import { EmailConfirmationForm } from '@/components/account/EmailConfirmationForm'

export default function ConfirmEmailPage() {
  return <HeroBackground className="min-h-screen"><main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10 sm:px-6">
    <section className="relative z-10 w-full rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-2xl sm:p-8">
      <h1 className="mb-5 text-2xl font-semibold text-text-primary">Confirm your email change</h1><EmailConfirmationForm />
    </section>
  </main></HeroBackground>
}
