import Link from 'next/link';
import { ArrowUpRight, CalendarClock, FileCheck2, Video } from 'lucide-react';
import { ListingVideo } from '@/components/listing/ListingVideo';
import type { VaultCapture } from '@/lib/vault-data';

type Props = { capture: VaultCapture };

export function VaultCaptureCard({ capture }: Props): React.JSX.Element {
  return (
    <article className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-card">
      <div className="relative aspect-[4/3] overflow-hidden bg-background-app">
        <ListingVideo listingId={capture.id} useMux={false} src={capture.videoUrl} poster={capture.posterUrl ?? undefined} controls muted playsInline className="h-full w-full object-cover" />
        <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-glass-border-light bg-glass-dark px-3 py-1 text-[10px] font-semibold text-text-primary backdrop-blur-sm"><Video className="h-3 w-3" aria-hidden="true" /> {capture.category} draft</span>
      </div>
      <div className="space-y-3 p-4"><h3 className="truncate text-base font-semibold text-text-primary">{capture.title}</h3><p className="flex items-center gap-2 text-xs text-text-muted"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /><time dateTime={capture.savedAt}>Saved at {capture.savedLabel} WAT</time></p><p className="flex items-center gap-2 text-xs text-text-muted"><FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />{capture.hasDocument ? 'Proof document added' : 'Proof document to add'}</p><Link href={`/marketplace/listing/create?draft=${capture.id}`} className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-accent-primary px-4 py-3 text-xs font-semibold text-text-inverse transition-colors hover:bg-accent-hover">Continue this listing <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link></div>
    </article>
  );
}
