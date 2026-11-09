import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type FlatListProps } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { MessageBubble } from '../../src/components/MessageBubble'
import { StatusView } from '../../src/components/StatusView'
import { Field } from '../../src/components/Field'
import { Button } from '../../src/components/Button'
import { ListingSharePicker } from '../../src/components/listing-share-picker'
import { useNativeConversation } from '../../src/hooks/use-native-conversation'
import { useConversationActivity } from '../../src/hooks/use-conversation-activity'
import type { NativeMessage } from '../../src/lib/messaging-api'
import { colors, fonts, space } from '../../src/theme'

type Viewability = Parameters<NonNullable<FlatListProps<NativeMessage>['onViewableItemsChanged']>>[0]
export default function ConversationScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const id = typeof params.id === 'string' ? params.id : ''
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  const insets = useSafeAreaInsets()
  const conversation = useNativeConversation(id, validId)
  const current = conversation.thread
  const presence = useConversationActivity(id, conversation.actorId, Boolean(current), conversation.denied)
  const [showPicker, setShowPicker] = useState(false)
  const [confirmDismissal, setConfirmDismissal] = useState(false)
  const list = useRef<FlatList<NativeMessage>>(null)
  const nearBottom = useRef(true)
  const displayed = useRef(presence.displayed)
  useEffect(() => { displayed.current = presence.displayed }, [presence.displayed])
  const [visibility] = useState({ itemVisiblePercentThreshold: 70 })
  const onViewable = useCallback(({ viewableItems }: Viewability) => {
    const last = viewableItems.filter(item => item.isViewable && item.index !== null).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).at(-1)
    displayed.current(last?.item.id ?? null)
  }, [])
  const record = conversation.recovery?.record
  const recoveryError = conversation.recovery?.error
  const recovering = Boolean(record || recoveryError)
  const locked = conversation.sending || recovering || !conversation.recovery
  const refresh = () => { void conversation.refresh().catch(() => undefined) }
  return <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
    <Stack.Screen options={{ title: current?.otherName ?? 'Conversation', headerShown: true }} />
    <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}>
      {!validId ? <StatusView title="Conversation unavailable" message="This conversation link is invalid." /> : <>
        {current ? <View style={styles.header}><Pressable accessibilityRole="button" style={styles.listingLink} onPress={() => router.push({ pathname: '/listing/[id]', params: { id: current.listingId } })}><Text style={styles.listingLinkText}>View listing ↗</Text></Pressable>
          <Text accessibilityLiveRegion="polite" style={styles.help}>{presence.activity?.otherTyping ? `${current.otherName} is typing…` : presence.activity?.otherOnline ? 'Online now' : presence.activity ? 'Currently offline' : 'Activity unavailable'}</Text><Text style={styles.help}>Updates every few seconds while this conversation is open.</Text></View> : null}
        {conversation.error ? <View style={styles.feedback}><Text accessibilityRole="alert" style={styles.error}>{conversation.error}</Text><Button title="Refresh conversation" secondary onPress={refresh} /></View> : null}
        <FlatList ref={list} data={current?.messages ?? []} keyExtractor={message => message.id} contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled" maintainVisibleContentPosition={{ minIndexForVisible: 0 }} viewabilityConfig={visibility} onViewableItemsChanged={onViewable}
          onScroll={event => { const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent; nearBottom.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - 120 }} scrollEventThrottle={100}
          onContentSizeChange={() => { if (nearBottom.current) list.current?.scrollToEnd({ animated: false }) }}
          ListHeaderComponent={current?.hasMore ? <View style={styles.feedback}>{conversation.gap ? <Text style={styles.help}>More than one page arrived while you were away. Load earlier messages to recover the middle of this conversation.</Text> : null}<Button title="Load older messages" secondary busy={conversation.loadingOlder} onPress={() => { nearBottom.current = false; void conversation.loadOlder() }} /></View> : undefined}
          ListEmptyComponent={conversation.loading ? <StatusView loading message="Opening conversation…" /> : !conversation.error ? <StatusView title="Say hello" message="Ask a question about the listing or arrange your next step." /> : undefined}
          renderItem={({ item }) => <MessageBubble message={item} own={item.senderId === current?.userId} read={Boolean((presence.activity?.otherReadAt ?? current?.otherReadAt) && item.sentAt <= (presence.activity?.otherReadAt ?? current?.otherReadAt ?? ''))} />} />
        {current ? <View style={styles.composer}>
          {showPicker && !locked ? <ScrollView style={styles.picker} keyboardShouldPersistTaps="handled"><ListingSharePicker onSelect={listing => { conversation.setShared(listing); setShowPicker(false) }} onClose={() => setShowPicker(false)} /></ScrollView> : <>
            {recoveryError ? <Text accessibilityRole="alert" style={styles.error}>{recoveryError}</Text> : null}
            <Field label={recovering ? 'Saved message' : 'Message'} value={record?.command.body ?? conversation.draft} onChangeText={value => { conversation.setDraft(value); presence.typing(value) }} editable={!locked} multiline maxLength={4000} placeholder={`Message ${current.otherName}`} style={styles.messageInput} />
            {record?.command.sharedListingId ? <Text style={styles.help}>The saved request includes a shared listing.</Text> : conversation.shared ? <View style={styles.feedback}><Text style={styles.help}>Sharing: {conversation.shared.title}</Text><Button title="Remove shared listing" secondary disabled={locked} onPress={() => conversation.setShared(null)} /></View> : null}
            {recovering ? <ScrollView style={styles.recovery} keyboardShouldPersistTaps="handled"><View style={styles.feedback}>
              <Text selectable style={styles.help}>{record?.confirmedId ? 'Message acknowledged. Confirming clears this device’s recovery record without resending it.' : 'This message may have reached Rentral. Read the latest conversation before retrying its exact saved text and listing.'}</Text>
              {record ? <Text selectable style={styles.help}>Request: {record.command.clientId}</Text> : null}
              <Button title="Check latest messages before retry" secondary disabled={conversation.sending} onPress={() => { setConfirmDismissal(false); void conversation.check() }} />
              {record ? <Button title={record.confirmedId ? 'Confirm saved message' : 'Retry exact saved message'} busy={conversation.sending} disabled={!conversation.checked && !record.confirmedId} onPress={() => { nearBottom.current = true; presence.typing(''); void conversation.send() }} /> : null}
              {conversation.checked ? confirmDismissal ? <><Text style={styles.error}>A delivered message still exists after local dismissal. A new send can deliver another copy.</Text><Button title="Confirm dismissal of local message recovery" secondary disabled={conversation.sending} onPress={() => { void conversation.dismiss() }} /><Button title="Keep saved message recovery" secondary onPress={() => setConfirmDismissal(false)} /></> : <Button title="Dismiss local message recovery" secondary onPress={() => setConfirmDismissal(true)} /> : null}
            </View></ScrollView> : <View style={styles.actions}><View style={styles.flex}><Button title="Share a listing" secondary disabled={locked} onPress={() => setShowPicker(true)} /></View><View style={styles.flex}><Button title="Send message" busy={conversation.sending} disabled={locked || (!conversation.draft.trim() && !conversation.shared)} onPress={() => { nearBottom.current = true; presence.typing(''); void conversation.send() }} /></View></View>}
            {conversation.notice ? <Text accessibilityLiveRegion="polite" style={styles.help}>{conversation.notice}</Text> : null}
          </>}
        </View> : null}
      </>}
    </KeyboardAvoidingView>
  </SafeAreaView>
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, keyboard: { flex: 1 }, header: { paddingHorizontal: space.lg, paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  listingLink: { minHeight: 44, justifyContent: 'center' }, listingLinkText: { color: colors.accentBright, fontFamily: fonts.medium, fontSize: 12 },
  messages: { flexGrow: 1, padding: space.lg, gap: space.sm }, feedback: { gap: space.sm, paddingVertical: space.sm }, error: { color: colors.warning, fontFamily: fonts.regular, fontSize: 12, lineHeight: 19 },
  composer: { borderTopWidth: 1, borderTopColor: colors.border, padding: space.lg, gap: space.sm }, messageInput: { minHeight: 52, maxHeight: 120 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: space.sm }, flex: { flex: 1 }, picker: { maxHeight: 300 }, recovery: { maxHeight: 240 } })
