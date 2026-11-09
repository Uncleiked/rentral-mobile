import { useCallback } from 'react'
import { StyleSheet, Text } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Page } from '../../src/components/Page'
import { StatusView } from '../../src/components/StatusView'
import { Button } from '../../src/components/Button'
import { ConversationCard } from '../../src/components/ConversationCard'
import { useApiResource } from '../../src/hooks/useApiResource'
import type { Conversation } from '../../src/lib/types'
import { colors, fonts } from '../../src/theme'

type Inbox = { items: Conversation[]; limit: number }

export default function MessagesScreen() {
  const { data, loading, error, refresh } = useApiResource<Inbox>('/messages')
  useFocusEffect(useCallback(() => { refresh() }, [refresh]))
  return <Page title="Messages" subtitle="A direct line to your next place, ride or getaway." refreshing={loading} onRefresh={refresh}>
    {loading ? <StatusView loading message="Opening your inbox…" /> : error ? <StatusView title="Inbox unavailable" message={error} onRetry={refresh} /> : data?.items.length ? <>
      {data.items.map(conversation => <ConversationCard key={conversation.id} conversation={conversation} />)}
      {data.items.length >= data.limit ? <Text style={styles.note}>Showing your {data.limit} most recent conversations.</Text> : null}
    </> : <><StatusView title="Your conversations start here" message="Open a listing and tap Message host to ask a question or make a plan." /><Button title="Find a listing" onPress={() => router.navigate('/(tabs)/explore')} /></>}
  </Page>
}

const styles = StyleSheet.create({ note: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center', lineHeight: 20 } })
