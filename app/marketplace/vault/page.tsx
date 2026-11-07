import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Camera, FolderOpen, MapPin, Monitor, Plus, Smartphone } from 'lucide-react';
import { MarketplaceShell } from '@/components/layout/MarketplaceShell';
import { VaultCaptureCard } from '@/components/vault/VaultCaptureCard';
import { getMediaVault } from '@/lib/vault-data';

export const dynamic = 'force-dynamic';

export default async function MediaVaultPage(): Promise<React.JSX.Element> {
  const vault = await getMediaVault();
  if (!vault) redirect('/sign-in');
  return (
    <MarketplaceShell>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-hover">Capture now. Finish when you’re ready.</p><h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">Your Media Vault</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-text-muted">Your saved walkthroughs, ready for their next chapter. Continue a draft on this device or sign in to the same account on your computer.</p></div><Link href="/marketplace/listing/create" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover"><Plus className="h-4 w-4" aria-hidden="true" />New capture</Link></div>

        <div className="my-8 grid gap-4 rounded-2xl border border-glass-border-light bg-brand-vault-muted p-5 sm:grid-cols-3 sm:p-6"><div className="flex gap-3"><Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-accent-hover" aria-hidden="true" /><div><h2 className="text-sm font-medium">Record on location</h2><p className="mt-1 text-xs leading-relaxed text-text-muted">Choose the asset and record a walkthrough with location permission enabled.</p></div></div><div className="flex gap-3"><FolderOpen className="mt-0.5 h-5 w-5 shrink-0 text-accent-hover" aria-hidden="true" /><div><h2 className="text-sm font-medium">Save your draft</h2><p className="mt-1 text-xs leading-relaxed text-text-muted">Tap Save Draft &amp; Exit before leaving the capture flow. Unsaved recordings stay on that device.</p></div></div><div className="flex gap-3"><Monitor className="mt-0.5 h-5 w-5 shrink-0 text-accent-hover" aria-hidden="true" /><div><h2 className="text-sm font-medium">Finish anywhere</h2><p className="mt-1 text-xs leading-relaxed text-text-muted">Add the description, prices and proof documents on mobile or desktop.</p></div></div></div>

        {vault.count === 0 ? <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-subtle px-5 py-16 text-center"><span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-glass-light"><Camera className="h-7 w-7 text-text-muted" aria-hidden="true" /></span><h2 className="text-lg font-semibold">A little empty. A lot of possibility.</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-text-muted">Saved drafts with a walkthrough appear here. Each recording stays separate, even when you capture several assets at the same location.</p><Link href="/marketplace/listing/create" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse hover:bg-accent-hover">Record your first walkthrough <Camera className="h-4 w-4" aria-hidden="true" /></Link><Link href="/marketplace/listing" className="mt-4 p-2 text-xs text-text-muted hover:text-text-primary">View all your listings</Link></div> : <div className="space-y-10">{vault.groups.map((group) => <section key={group.key} aria-labelledby={`vault-${group.captures[0].id}`}><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 id={`vault-${group.captures[0].id}`} className="flex items-center gap-2 text-base font-semibold"><MapPin className="h-4 w-4 text-accent-hover" aria-hidden="true" />{group.area}<span className="ml-1 text-xs font-normal text-text-muted">{group.captures.length} {group.captures.length === 1 ? 'walkthrough' : 'walkthroughs'}</span></h2><p className="text-xs text-text-muted">Saved {group.dateLabel}</p></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{group.captures.map((capture) => <VaultCaptureCard key={capture.id} capture={capture} />)}</div></section>)}</div>}
        <p className="mt-7 text-xs leading-relaxed text-text-muted">{vault.limited ? 'Showing your 100 most recent saved walkthroughs. ' : ''}Times are shown in Lagos time (WAT). “Saved” is the first draft save, not a verified capture timestamp. Location groups use broad areas; exact coordinates are never shown.</p>
      </div>
    </MarketplaceShell>
  );
}
