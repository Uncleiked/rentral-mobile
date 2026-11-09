import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View, Platform } from 'react-native'
import * as Crypto from 'expo-crypto'
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Page } from '../src/components/Page'
import { Button } from '../src/components/Button'
import { Field } from '../src/components/Field'
import { StatusView } from '../src/components/StatusView'
import { useAuth } from '../src/providers/AuthProvider'
import { clearDeviceSavedSearches, deviceSearchDescription, loadDeviceSavedSearches, removeDeviceSavedSearch, saveDeviceSearch, type DeviceSavedSearch } from '../src/lib/device-saved-searches'
import { discoveryFilterCount, normalizedDiscoveryFilters } from '../src/lib/discovery-input'
import { errorMessage } from '../src/lib/api'
import { colors, fonts, radius, space } from '../src/theme'

export default function SavedSearchesScreen() {
  const params = useLocalSearchParams<Record<string, string | string[]>>()
  const filters = normalizedDiscoveryFilters(params)
  const { session } = useAuth()
  const actorId = session?.user.id ?? ''
  const actor = useRef(actorId)
  useEffect(() => { actor.current = actorId }, [actorId])
  const [saved, setSaved] = useState<{ actorId: string; items: DeviceSavedSearch[]; error: string | null } | null>(null)
  const [name, setName] = useState(''), [message, setMessage] = useState<string | null>(null), [busy, setBusy] = useState(false), [confirmReset, setConfirmReset] = useState(false)
  const lock = useRef(false)
  const current = saved?.actorId === actorId ? saved : null
  useFocusEffect(useCallback(() => {
    if (!actorId) return
    let active = true
    void loadDeviceSavedSearches(actorId).then(items => { if (active) setSaved({ actorId, items, error: null }) }, reason => { if (active) setSaved({ actorId, items: [], error: errorMessage(reason) }) })
    return () => { active = false }
  }, [actorId]))
  async function change(operation: 'save' | 'remove' | 'clear', id?: string) {
    if (lock.current || !actorId || !current) return
    const capturedActor = actorId
    lock.current = true; setBusy(true); setMessage(null)
    try {
      let items: DeviceSavedSearch[]
      if (operation === 'clear') { await clearDeviceSavedSearches(capturedActor); items = [] }
      else if (operation === 'remove') items = await removeDeviceSavedSearch(capturedActor, id ?? '')
      else items = await saveDeviceSearch(capturedActor, { id: Crypto.randomUUID(), name, filters })
      if (actor.current === capturedActor) { setSaved({ actorId: capturedActor, items, error: null }); setConfirmReset(false); if (operation === 'save') setName(''); setMessage(operation === 'save' ? 'Search saved on this device.' : operation === 'remove' ? 'This saved search was removed.' : 'Saved searches were cleared on this device.') }
    } catch (reason) { if (actor.current === capturedActor) setMessage(errorMessage(reason)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <><Stack.Screen options={{ title: 'Saved searches' }} /><Page title="Find it again" subtitle={Platform.OS === 'web' ? 'Saved in this browser tab for your signed-in account. Searches do not sync across devices.' : 'Saved on this device for your signed-in account. Searches do not sync across devices.'}>
    {!current ? <StatusView loading message="Opening saved searches…" /> : current.error ? <View style={styles.card}><Text style={styles.warning}>{current.error}</Text>{confirmReset ? <><Text style={styles.help}>This removes all saved search names and filters from this device. Marketplace listings are separate.</Text><Button title="Confirm clearing saved searches on this device" secondary disabled={busy} onPress={() => { void change('clear') }} /></> : <Button title="Clear unreadable saved searches" secondary onPress={() => setConfirmReset(true)} />}</View> : <>
      {params.from === 'discovery' ? <View style={styles.card}><Text style={styles.heading}>Save your current search</Text><Text style={styles.help}>{filters.category === 'all' ? 'All asset categories' : filters.category} · {discoveryFilterCount(filters)} filters{filters.q ? ` · ${filters.q}` : ''}{filters.view === 'feed' ? ' · Walkthrough feed' : ''}</Text><Field label="Saved search name" value={name} onChangeText={setName} maxLength={60} editable={!busy} placeholder="Weekend cars in Lekki" /><Button title="Save this search on this device" busy={busy} disabled={!name.trim()} onPress={() => { void change('save') }} /></View> : null}
      {current.items.length ? current.items.map(item => <View key={item.id} style={styles.card}><Text style={styles.heading}>{item.name}</Text><Text style={styles.help}>{deviceSearchDescription(item.params)}</Text><Button title={`Open saved search ${item.name}`} secondary disabled={busy} onPress={() => router.dismissTo({ pathname: item.params.view === 'feed' ? '/walkthrough-feed' : '/(tabs)/explore', params: item.params })} /><Button title={`Remove saved search ${item.name}`} secondary disabled={busy} onPress={() => { void change('remove', item.id) }} /></View>) : <StatusView title="Keep a search you like" message="Open discovery filters or Explore, then choose Save this search. Saved searches keep filters; they do not reserve or save individual listings." />}
    </>}
    {message ? <Text selectable accessibilityLiveRegion="polite" style={styles.warning}>{message}</Text> : null}
  </Page></>
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 18 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
