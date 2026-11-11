'use client'

type Props = { label: string; description?: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }

export function AdminToggle({ label, description, checked, disabled, onChange }: Props) {
  return <label className={`flex min-h-12 items-center justify-between gap-4 rounded-xl border border-border-subtle bg-background-app p-4 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
    <span className="min-w-0"><span className="block text-sm font-medium text-text-primary">{label}</span>{description && <span className="mt-1 block text-xs leading-5 text-text-muted">{description}</span>}</span>
    <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} aria-label={label} onChange={event => onChange(event.target.checked)} className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border border-glass-border-medium bg-glass-light transition-colors peer-checked:border-accent-primary peer-checked:bg-accent-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-accent-hover" />
      <span aria-hidden="true" className="pointer-events-none relative ml-1 size-4 rounded-full bg-text-primary transition-transform peer-checked:translate-x-5 peer-checked:bg-text-inverse" />
    </span>
  </label>
}