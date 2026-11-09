import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, type FlatListProps } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import * as Crypto from 'expo-crypto'
import type { MatchMessage } from '../../../../lib/matching/contracts'
import { Button } from '../../src/components/Button'
import { Field } from '../../src/components/Field'
import { StatusView } from '../../src/components/StatusView'
import { MatchingProfileCard } from '../../src/components/matching-profile-card'
import { useAuth } from '../../src/providers/AuthProvider'
import { useMemberResource } from '../../src/hooks/use-member-resource'
import { useMatchingMessages } from '../../src/hooks/use-matching-messages'
import { decideMatchingContact, matchConnectionSchema, matchingReportContextSchema, readMatchingMessages, setMatchingBlock } from '../../src/lib/matching-api'
import { confirmReadMatchingMessage, dismissPendingMatchingMessage, loadPendingMatchingMessage, submitPendingMatchingMessage, type PendingMatchingMessage } from '../../src/lib/matching-pending-store'
import { bookingOutcomeUncertain } from '../../src/lib/booking-api'
import { ApiError, errorMessage } from '../../src/lib/api'
import { colors, fonts, radius, space } from '../../src/theme'
import { invalidateMatchingPrivacy } from '../../src/lib/matching-privacy'

type Visible = Parameters<NonNullable<FlatListProps<MatchMessage>['onViewableItemsChanged']>>[0]
export default function MatchingThreadScreen() {
  const params = useLocalSearchParams<{ id: string }>(), id = typeof params.id === 'string' ? params.id : ''
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  const { session } = useAuth(), actorId = session?.user.id ?? '', key = `${actorId}:${id}`
  const actor = useRef(key)
  const knownContact = useRef<string | null>(null)
  useEffect(() => { actor.current = key }, [key])
  const connectionSchema = useMemo(() => matchConnectionSchema.refine(value => value.id === id), [id])
  const connection = useMemberResource(`/squat-mates/connections/${id}`, connectionSchema, validId, 5000)
  const clearConnection = connection.clear
  const denied = useCallback(() => { knownContact.current = null; invalidateMatchingPrivacy(actorId); clearConnection('This matching contact is unavailable. Cached profile and messages have been cleared.') }, [actorId, clearConnection])
  const contact = connection.data, accepted = contact?.status === 'accepted'
  useEffect(() => {
    if (contact) knownContact.current = key
    else if (connection.error && knownContact.current === key) { knownContact.current = null; invalidateMatchingPrivacy(actorId) }
  }, [actorId, contact, connection.error, key])
  const messages = useMatchingMessages(id, actorId, Boolean(accepted), denied)
  const reportSchema = useMemo(() => matchingReportContextSchema.refine(value => value.connectionId === id), [id])
  const context = useMemberResource(`/squat-mates/connections/${id}/report-context`, reportSchema, validId && Boolean(connection.error && !contact))
  const [outbox, setOutbox] = useState<{ key: string; record: PendingMatchingMessage | null; error: string | null } | null>(null)
  const [draftState, setDraft] = useState({ key, value: '' })
  const draft = draftState.key === key ? draftState.value : ''
  const [checked, setChecked] = useState<string | null>(null), [uncertain, setUncertain] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<'close' | 'block' | 'dismiss' | null>(null)
  const [notice, setNotice] = useState<{ key: string; text: string } | null>(null)
  const lock = useRef(false), list = useRef<FlatList<MatchMessage>>(null), nearBottom = useRef(true)
  const insets = useSafeAreaInsets()
  const saved = outbox?.key === key ? outbox : null
  const record = saved?.record, recovery = Boolean(record || saved?.error), mutationUnknown = uncertain === key
  const shown = notice?.key === key ? notice.text : null
  const feedback = (text: string) => setNotice({ key, text })
  useFocusEffect(useCallback(() => {
    if (!actorId || !validId) return
    let active = true
    setChecked(null)
    void loadPendingMatchingMessage(actorId, id).then(record => { if (active) setOutbox({ key, record, error: null }) }, reason => { if (active) setOutbox({ key, record: null, error: errorMessage(reason) }) })
    return () => { active = false }
  }, [actorId, id, key, validId]))

  const visibleMessage = useRef<string | null>(null)
  const [viewability] = useState({ itemVisiblePercentThreshold: 70 })
  const onVisible = useCallback(({ viewableItems }: Visible) => {
    const last = viewableItems.filter(item => item.isViewable && !item.item.own).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).at(-1)
    visibleMessage.current = last?.item.id ?? null
  }, [])
  useFocusEffect(useCallback(() => {
    if (!accepted || !actorId) return
    let active = true, reading = false, readId: string | null = null, lastRead = 0
    const tick = () => {
      const messageId = visibleMessage.current
      if (!active || AppState.currentState !== 'active' || reading || !messageId || messageId === readId || Date.now() - lastRead < 15000) return
      reading = true; lastRead = Date.now()
      void readMatchingMessages(id, messageId, actorId).then(() => { readId = messageId }, reason => { if (active && reason instanceof ApiError && [401, 403, 404].includes(reason.status)) denied() }).finally(() => { reading = false })
    }
    tick(); const timer = setInterval(tick, 1000)
    return () => { active = false; visibleMessage.current = null; clearInterval(timer) }
  }, [accepted, actorId, id, denied]))

  async function check() {
    if (lock.current) return
    lock.current = true; setBusy(true)
    const captured = key
    try {
      await connection.refresh(true)
      const latest = accepted ? await messages.refresh() : null
      if (actor.current !== captured) return
      const found = record && latest?.items.find(item => item.own && item.clientId === record.command.clientId)
      if (found) {
        const result = await confirmReadMatchingMessage(actorId, id, found)
        if (actor.current === captured) { setOutbox({ key: captured, record: result.cleanupPending ? { command: record!.command, confirmedId: found.id } : null, error: null }); setDraft({ key: captured, value: '' }); feedback('Your saved message was found in the conversation. No send was repeated.') }
      } else { setChecked(captured); feedback('Latest contact and messages loaded. Earlier messages can be outside this window. An explicit retry keeps the original message identifier and text.') }
      setUncertain(null); setConfirmation(null)
    } catch (reason) { if (actor.current === captured) feedback(errorMessage(reason)) }
    finally { lock.current = false; setBusy(false) }
  }
  async function send() {
    if (lock.current || !accepted || !saved || saved.error || (record && checked !== key && !record.confirmedId)) return
    const command = record?.command ?? { clientId: Crypto.randomUUID(), body: draft.trim() }
    if (!command.body) return
    const captured = key
    lock.current = true; setBusy(true); setChecked(null); setOutbox({ key, record: record ?? { command }, error: null })
    try {
      const result = await submitPendingMatchingMessage(actorId, id, command)
      if (actor.current === captured) {
        setOutbox({ key: captured, record: result.cleanupPending ? { command, confirmedId: result.id } : null, error: null }); setDraft({ key: captured, value: '' }); feedback(result.cleanupPending ? 'Message acknowledged. Its device recovery still needs confirmation.' : 'Matching message sent.'); nearBottom.current = true
        void messages.refresh().catch(() => undefined)
      }
    } catch (reason) {
      if (actor.current === captured) {
        feedback(errorMessage(reason))
        try { const pending = await loadPendingMatchingMessage(actorId, id); if (actor.current === captured) setOutbox({ key: captured, record: pending, error: null }) }
        catch (failure) { if (actor.current === captured) setOutbox({ key: captured, record: null, error: errorMessage(failure) }) }
      }
    } finally { lock.current = false; setBusy(false) }
  }
  async function action(operation: 'accept' | 'decline' | 'close' | 'block') {
    if (lock.current || !contact || mutationUnknown) return
    const captured = key
    lock.current = true; setBusy(true)
    try {
      if (operation === 'block') await setMatchingBlock(contact.other.id, true, actorId)
      else await decideMatchingContact(id, operation, actorId)
      if (actor.current !== captured) return
      setConfirmation(null)
      if (operation === 'accept') { await connection.refresh(); feedback('Contact accepted. You can now exchange messages while both profiles remain available.') }
      else { clearConnection(operation === 'block' ? 'Matching contact blocked. Cached profile and messages have been cleared.' : 'This matching contact has ended. Cached profile and messages have been cleared.'); messages.clear() }
    } catch (reason) { if (actor.current === captured) { feedback(errorMessage(reason)); if (bookingOutcomeUncertain(reason)) setUncertain(captured) } }
    finally { lock.current = false; setBusy(false) }
  }
  async function dismiss() {
    if (lock.current || (checked !== key && contact)) return
    lock.current = true; setBusy(true)
    try { await dismissPendingMatchingMessage(actorId, id); setOutbox({ key, record: null, error: null }); setConfirmation(null); feedback('Local matching-message recovery removed. A delivered message is separate.') }
    catch (reason) { feedback(errorMessage(reason)) }
    finally { lock.current = false; setBusy(false) }
  }
  const report = (messageId?: string) => router.push({ pathname: '/match-report', params: { connectionId: id, ...(messageId ? { messageId } : {}) } })
  return <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}><Stack.Screen options={{ title: contact?.other.username ? `@${contact.other.username}` : 'Matching contact' }} /><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}>
    {!validId ? <StatusView title="Contact unavailable" message="This matching contact link is invalid." /> : !contact ? <ScrollView contentContainerStyle={styles.content}>{connection.loading ? <StatusView loading message="Opening matching contact…" /> : <StatusView title="Matching contact unavailable" message={connection.error ?? 'This contact cannot be opened.'} onRetry={() => { void connection.refresh().catch(() => undefined) }} />}{context.data ? <><Text style={styles.help}>You can still submit a private report about this existing contact. Hidden profile and message contents are not shown.</Text><Button title="Report this unavailable matching contact" secondary onPress={() => report()} /></> : null}{recovery ? <><Text style={styles.help}>This device has a pending send for this contact. Its content is not shown while contact access is unavailable.</Text>{confirmation === 'dismiss' ? <><Text style={styles.warning}>Removing recovery does not delete a delivered message.</Text><Button title="Confirm discarding local matching-message recovery" secondary onPress={() => { void dismiss() }} /></> : <Button title="Discard this device’s pending matching send" secondary onPress={() => setConfirmation('dismiss')} />}</> : null}</ScrollView> : <>
      <FlatList ref={list} data={accepted ? messages.page?.items ?? [] : []} keyExtractor={item => item.id} contentContainerStyle={styles.content} maintainVisibleContentPosition={{ minIndexForVisible: 0 }} viewabilityConfig={viewability} onViewableItemsChanged={onVisible}
        onScroll={event => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; nearBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 120 }} scrollEventThrottle={100} onContentSizeChange={() => { if (nearBottom.current) list.current?.scrollToEnd({ animated: false }) }}
        ListHeaderComponent={<View style={styles.section}><MatchingProfileCard profile={contact.other} /><Text style={styles.help}>{accepted ? 'Contact accepted. Read markers reflect displayed messages. This conversation refreshes every few seconds while open.' : contact.requestedByMe ? 'Your contact request is waiting for the invited member’s decision.' : 'Choose whether to accept this contact request before exchanging messages.'}</Text>
          {contact.status === 'requested' && !contact.requestedByMe ? <><Button title="Accept matching contact" disabled={busy || mutationUnknown} onPress={() => { void action('accept') }} /><Button title="Decline matching contact" secondary disabled={busy || mutationUnknown} onPress={() => { void action('decline') }} /></> : null}
          {confirmation === 'close' || confirmation === 'block' ? <><Text style={styles.warning}>{confirmation === 'block' ? 'Blocking ends matching contact and discovery between the accounts. Reporting stays available.' : 'Closing this contact ends its message access. New contact requests may have a waiting period.'}</Text><Button title={confirmation === 'block' ? 'Confirm blocking matching contact' : 'Confirm closing matching contact'} secondary disabled={busy || mutationUnknown} onPress={() => { void action(confirmation) }} /><Button title="Keep this matching contact" secondary disabled={busy} onPress={() => setConfirmation(null)} /></> : <><Button title={contact.status === 'requested' && contact.requestedByMe ? 'Withdraw matching contact request' : 'Close matching contact'} secondary disabled={busy || mutationUnknown} onPress={() => setConfirmation('close')} /><Button title="Block matching contact" secondary disabled={busy || mutationUnknown} onPress={() => setConfirmation('block')} /></>}
          <Button title="Report matching contact privately" secondary onPress={() => report()} />
          {connection.error || messages.error ? <Text style={styles.warning}>Could not refresh: {connection.error ?? messages.error}</Text> : null}
          {mutationUnknown ? <Text style={styles.warning}>This contact update may already be saved. Refresh its status before another change.</Text> : null}<Button title="Refresh matching contact and messages" secondary disabled={busy} onPress={() => { void check() }} />
          {messages.gap ? <Text style={styles.help}>More than one page arrived while you were away. Load earlier messages to recover the middle.</Text> : null}{messages.page?.nextCursor ? <Button title="Load earlier matching messages" secondary busy={messages.loadingOlder} onPress={() => { nearBottom.current = false; void messages.loadOlder() }} /> : null}
          {messages.loading && !messages.page ? <StatusView loading message="Opening accepted-contact messages…" /> : null}
        </View>}
        renderItem={({ item }) => <View style={[styles.bubble, item.own && styles.ownBubble]}><Text selectable style={styles.body}>{item.body}</Text><Text style={styles.help}>{new Date(item.createdAt).toLocaleString()}{item.own && contact.otherReadAt && item.createdAt <= contact.otherReadAt ? ' · Read' : ''}</Text>{!item.own ? <Button title="Report this matching message" secondary onPress={() => report(item.id)} /> : null}</View>} />
      {accepted ? <View style={styles.composer}><Field label={recovery ? 'Saved matching message' : 'Matching message'} value={record?.command.body ?? draft} onChangeText={value => setDraft({ key, value })} editable={!busy && !recovery && Boolean(saved)} multiline maxLength={2000} style={styles.input} />
        {recovery ? <ScrollView style={styles.recovery} keyboardShouldPersistTaps="handled"><View style={styles.section}>{saved?.error ? <Text style={styles.warning}>{saved.error}</Text> : <Text style={styles.help}>This message may already exist. Checking its echoed request identifier can confirm it without another send.</Text>}<Button title="Check matching messages before retry" secondary disabled={busy} onPress={() => { void check() }} />{record ? <Button title={record.confirmedId ? 'Confirm acknowledged matching message' : 'Retry exact saved matching message'} busy={busy} disabled={!record.confirmedId && checked !== key} onPress={() => { void send() }} /> : null}{checked === key ? confirmation === 'dismiss' ? <><Text style={styles.warning}>A new send can deliver another copy. Local removal does not delete delivered content.</Text><Button title="Confirm discarding local matching-message recovery" secondary disabled={busy} onPress={() => { void dismiss() }} /></> : <Button title="Discard local matching-message recovery" secondary disabled={busy} onPress={() => setConfirmation('dismiss')} /> : null}</View></ScrollView> : <Button title="Send matching message" busy={busy} disabled={!saved || !draft.trim()} onPress={() => { void send() }} />}
      </View> : null}
    </>}
    {shown ? <Text selectable accessibilityLiveRegion="polite" style={styles.notice}>{shown}</Text> : null}
  </KeyboardAvoidingView></SafeAreaView>
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 }, content: { padding: space.lg, gap: space.lg, paddingBottom: space.xl }, section: { gap: space.md }, body: { color: colors.text, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 19 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 12, lineHeight: 21 }, bubble: { maxWidth: '90%', alignSelf: 'flex-start', padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: space.sm }, ownBubble: { alignSelf: 'flex-end', backgroundColor: colors.accentMuted }, composer: { borderTopWidth: 1, borderTopColor: colors.border, padding: space.lg, gap: space.md }, input: { minHeight: 52, maxHeight: 100 }, recovery: { maxHeight: 200 }, notice: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 19, paddingHorizontal: space.lg, paddingBottom: space.sm } })
