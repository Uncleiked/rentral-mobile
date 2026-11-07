'use client'

export default function MessagesError({ reset }: { reset: () => void }) {
  return <main className="mx-auto flex min-h-[60dvh] max-w-lg flex-col justify-center gap-4 p-6"><h1 className="text-2xl font-semibold">Your inbox could not load.</h1><p className="text-sm text-text-muted">Your messages are saved. Check your connection and try again.</p><button type="button" onClick={reset} className="self-start rounded-xl bg-accent-primary px-5 py-3 text-text-inverse">Try again</button></main>
}
