import { useCallback, useRef, useState } from 'react'
import { AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import * as Crypto from 'expo-crypto'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { MessageBubble } from '../../src/components/MessageBubble'
import { StatusView } from '../../src/components/StatusView'
import { Field } from '../../src/components/Field'
import { Button } from '../../src/components/Button'
import { api, errorMessage } from '../../src/lib/api'
import type { Message, Thread } from '../../src/lib/types'
import { colors, fonts, space } from '../../src/theme'

function mergeMessages(older: Message[], newer: Message[]): Message[] {
  const messages = new Map(older.map(message => [message.id, message]))
  for (const message of newer) messages.set(message.id, message)
  return Array.from(messages.values()).sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id))
}

export default function ConversationScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const id = typeof params.id === 'string' ? params.id : ''
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  const insets = useSafeAreaInsets()
  const [thread, setThread] = useState<Thread | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const focused = useRef(false)
  const sendingLock = useRef(false)
  const pending = useRef<{ clientId: string; body: string } | null>(null)
  const list = useRef<FlatList<Message>>(null)
  const nearBottom = useRef(true)
  const activeRequest = useRef('')
  const requestKey = `${id}:${refreshKey}`
  const current = thread?.id === id ? thread : null

  useFocusEffect(useCallback(() => {
    if (!validId) return
    focused.current = true
    activeRequest.current = requestKey
    const controller = new AbortController()
    let fetching = false
    const latest = async (): Promise<void> => {
      if (fetching || !focused.current || AppState.currentState !== 'active') return
      fetching = true
      try {
        const next = await api<Thread>(`/messages/${id}`, { signal: controller.signal })
        if (focused.current && !controller.signal.aborted && activeRequest.current === requestKey) {
          setThread(previous => {
            if (previous?.id !== next.id) return next
            const previousIds = new Set(previous.messages.map(message => message.id))
            const overlap = next.messages.some(message => previousIds.has(message.id))
            // If more than one page arrived while backgrounded, keep the latest
            // contiguous window so "Load older" can recover the missing middle.
            if (!overlap && next.hasMore) return next
            return { ...next, hasMore: previous.hasMore, messages: mergeMessages(previous.messages, next.messages) }
          })
          setError(null)
        }
      } catch (reason) { if (focused.current && !controller.signal.aborted && activeRequest.current === requestKey) setError(errorMessage(reason)) }
      finally { fetching = false; if (focused.current && activeRequest.current === requestKey) setLoading(false) }
    }
    void latest()
    const timer = setInterval(() => { void latest() }, 5000)
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void latest() })
    return () => { focused.current = false; controller.abort(); clearInterval(timer); listener.remove() }
  }, [id, validId, requestKey]))

  async function loadOlder(): Promise<void> {
    if (!current?.hasMore || loadingOlder || !current.messages[0]) return
    setLoadingOlder(true); nearBottom.current = false
    try {
      const older = await api<Thread>(`/messages/${id}?before=${encodeURIComponent(current.messages[0].id)}`)
      if (focused.current) setThread(previous => previous?.id === id ? { ...previous, hasMore: older.hasMore, messages: mergeMessages(older.messages, previous.messages) } : previous)
    } catch (reason) { if (focused.current) setError(errorMessage(reason)) }
    finally { setLoadingOlder(false) }
  }

  async function send(): Promise<void> {
    const body = draft.trim()
    if (!body || !current || sendingLock.current) return
    sendingLock.current = true; setSending(true); setError(null); setNotice(null)
    const retry = pending.current?.body === body ? pending.current : { clientId: Crypto.randomUUID(), body }
    pending.current = retry
    try {
      await api<{ id: string }>(`/messages/${id}`, { method: 'POST', body: retry })
      pending.current = null
      setDraft(value => value.trim() === body ? '' : value); setNotice('Message sent.'); nearBottom.current = true; setRefreshKey(value => value + 1)
    } catch (reason) { setError(errorMessage(reason)) }
    finally { sendingLock.current = false; setSending(false) }
  }

  return <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
    <Stack.Screen options={{ title: current?.otherName ?? 'Conversation', headerShown: true, headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }} />
    <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}>
      {!validId ? <StatusView title="Conversation unavailable" message="This conversation link is invalid." /> : <>
        {current ? <Pressable accessibilityRole="button" style={styles.listingLink} onPress={() => router.push({ pathname: '/listing/[id]', params: { id: current.listingId } })}><Text style={styles.listingLinkText}>View listing ↗</Text></Pressable> : null}
        {error ? <View style={styles.feedback}><Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text><Button title="Refresh conversation" secondary onPress={() => setRefreshKey(value => value + 1)} /></View> : null}
        <FlatList ref={list} data={current?.messages ?? []} keyExtractor={message => message.id} contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled" maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onScroll={event => { const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent; nearBottom.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - 120 }} scrollEventThrottle={100}
          onContentSizeChange={() => { if (nearBottom.current) list.current?.scrollToEnd({ animated: false }) }}
          ListHeaderComponent={current?.hasMore ? <Button title="Load older messages" secondary busy={loadingOlder} onPress={() => { void loadOlder() }} /> : undefined}
          ListEmptyComponent={loading ? <StatusView loading message="Opening conversation…" /> : !error ? <StatusView title="Say hello" message="Ask a question about the listing or arrange your next step." /> : undefined}
          renderItem={({ item }) => <MessageBubble message={item} own={item.senderId === current?.userId} read={Boolean(current?.otherReadAt && item.sentAt <= current.otherReadAt)} />} />
        {current ? <View style={styles.composer}>
          <Field label="Message" value={draft} onChangeText={value => { setDraft(value); setNotice(null) }} editable={!sending} multiline maxLength={4000} placeholder={`Message ${current.otherName}`} style={styles.messageInput} />
          <Button title="Send message" busy={sending} disabled={!draft.trim()} onPress={() => { void send() }} />
          {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
        </View> : null}
      </>}
    </KeyboardAvoidingView>
  </SafeAreaView>
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, keyboard: { flex: 1 },
  listingLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xl, borderBottomWidth: 1, borderBottomColor: colors.border }, listingLinkText: { color: colors.accentBright, fontFamily: fonts.medium, fontSize: 12 },
  messages: { flexGrow: 1, padding: space.lg, gap: space.sm }, feedback: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  error: { color: colors.warning, fontFamily: fonts.regular, fontSize: 12, lineHeight: 19 }, composer: { borderTopWidth: 1, borderTopColor: colors.border, padding: space.lg, gap: space.md },
  messageInput: { minHeight: 52, maxHeight: 120 }, notice: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 18 },
})
