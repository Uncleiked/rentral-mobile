'use client'

import { useState, useTransition } from 'react'
import { z } from 'zod'
import type { OwnMatchProfile } from '@/lib/matching/contracts'
import { budgetNairaToKobo, MATCH_AREAS, MATCH_AREA_LABELS, matchingProfileInputSchema } from '@/lib/matching/policy'
import { matchingButton, matchingField, matchingNaira, matchingProfileResultSchema, matchingSecondary } from '@/lib/matching/client'
import { useMatchingRequest } from '@/components/account/ApiActorScope'

const options = {
  smoking: [['smoke_free', 'Smoke-free home'], ['smoking_ok', 'Smoking is okay'], ['flexible', 'Flexible']],
  pets: [['pet_free', 'Pet-free home'], ['pets_ok', 'Pets are okay'], ['flexible', 'Flexible']],
  guests: [['quiet', 'Few visitors'], ['occasional', 'Occasional guests'], ['social', 'Frequent guests'], ['flexible', 'Flexible']],
  quietHours: [['early', 'Prefer early quiet hours'], ['late', 'Prefer later quiet hours'], ['flexible', 'Flexible']],
} as const
export function MatchingPreferences({ profile, onSaved }: { profile: OwnMatchProfile | null; onSaved: (value: OwnMatchProfile | null) => void }) {
  const matchingRequest = useMatchingRequest()
  const [areas, setAreas] = useState<string[]>(profile?.neighborhoods ?? [])
  const [minimum, setMinimum] = useState(profile ? matchingNaira(profile.monthlyMinKobo) : '')
  const [maximum, setMaximum] = useState(profile ? matchingNaira(profile.monthlyMaxKobo) : '')
  const [bio, setBio] = useState(profile?.bio ?? ''), [visible, setVisible] = useState(profile?.isVisible ?? false)
  const [preferences, setPreferences] = useState({ smoking: profile?.smoking ?? 'flexible', pets: profile?.pets ?? 'flexible', guests: profile?.guests ?? 'flexible', quietHours: profile?.quietHours ?? 'flexible' })
  const [message, setMessage] = useState(''), [pending, startTransition] = useTransition()
  return <form className="space-y-5 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-7" onSubmit={event => { event.preventDefault(); startTransition(async () => {
    try {
      const input = matchingProfileInputSchema.parse({ bio, neighborhoods: areas, monthlyMinKobo: budgetNairaToKobo(minimum), monthlyMaxKobo: budgetNairaToKobo(maximum), ...preferences, isVisible: visible })
      const saved = await matchingRequest('squat-mates/profile', matchingProfileResultSchema, { method: 'PUT', body: input })
      setMessage('Preferences saved. Visibility follows your choice and any safety review.'); onSaved(saved.profile)
    } catch (error) { setMessage(error instanceof z.ZodError ? 'Choose up to three areas and a valid monthly budget.' : error instanceof Error ? error.message : 'Refresh your preferences before trying again.') }
  }) }}>
    <div><h2 className="text-xl font-semibold">Your matching preferences</h2><p className="mt-2 text-sm leading-relaxed text-text-muted">Only opt-in members can see these preferences. Choose coarse areas; keep your address, workplace, phone number and financial details private.</p></div>
    {profile?.moderationStatus === 'restricted' && <p role="status" className="rounded-xl border border-border-subtle p-4 text-sm text-trust-flagged">Matching is restricted after review. {profile.moderationReason} Your visibility setting does not remove this restriction.</p>}
    <fieldset><legend className="text-sm font-semibold">Areas you would consider · choose up to three</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{MATCH_AREAS.map(area => <label key={area} className="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle p-3 text-sm"><input type="checkbox" checked={areas.includes(area)} disabled={pending || (!areas.includes(area) && areas.length >= 3)} onChange={event => setAreas(current => event.target.checked ? [...current, area] : current.filter(item => item !== area))} />{MATCH_AREA_LABELS[area]}</label>)}</div></fieldset>
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm text-text-secondary">Minimum monthly share (₦)<input required inputMode="decimal" value={minimum} onChange={event => setMinimum(event.target.value)} className={matchingField} /></label><label className="text-sm text-text-secondary">Maximum monthly share (₦)<input required inputMode="decimal" value={maximum} onChange={event => setMaximum(event.target.value)} className={matchingField} /></label></div>
    <div className="grid gap-4 sm:grid-cols-2">{Object.entries(options).map(([key, choices]) => <label key={key} className="text-sm text-text-secondary">{key === 'quietHours' ? 'Quiet hours' : key[0].toUpperCase() + key.slice(1)}<select value={preferences[key as keyof typeof preferences]} onChange={event => setPreferences(current => ({ ...current, [key]: event.target.value }))} className={matchingField}>{choices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</div>
    <label className="block text-sm text-text-secondary">A short introduction<textarea maxLength={500} rows={3} value={bio} onChange={event => setBio(event.target.value)} className={matchingField} /></label>
    <label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} className="mt-1" />Show my profile to other opted-in members and allow contact requests. I understand that an overlap score describes stated preferences, and does not verify compatibility or financial reliability.</label>
    <div className="flex flex-wrap gap-3"><button disabled={pending} className={matchingButton}>{pending ? 'Saving…' : 'Save preferences'}</button>{profile && <button type="button" disabled={pending} className={matchingSecondary} onClick={() => startTransition(async () => {
      try { await matchingRequest('squat-mates/profile', z.object({ withdrawn: z.literal(true) }), { method: 'DELETE', body: {} }); setVisible(false); onSaved({ ...profile, isVisible: false }); setMessage('Your profile is hidden. Matching conversations are unavailable while it is hidden. Your records and private reports are preserved.') }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Refresh to check your visibility.') }
    })}>Withdraw from matching</button>}</div>
    {message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
  </form>
}
