import Link from 'next/link'
import { ShieldCheck, ArrowUpRight } from 'lucide-react'

export function SecurityCard() {
  return <section id="account-security" className="scroll-mt-24 rounded-2xl border border-border-subtle bg-surface-card p-6"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-accent-hover" /><h2 className="text-sm font-semibold">Keep your account yours</h2></div><p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">Use a unique password and keep your recovery email up to date. You can edit your profile details or sign out from Settings above.</p><Link href="/forgot-password" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-accent-hover">Send a password reset link<ArrowUpRight className="h-3.5 w-3.5" /></Link></section>
}
