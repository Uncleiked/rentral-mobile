import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { Stack } from 'expo-router'
import { Page } from '../src/components/Page'
import { StatusView } from '../src/components/StatusView'
import { SafetyNoticeCard } from '../src/components/safety-notice-card'
import { useMemberResource } from '../src/hooks/use-member-resource'
import { ownSafetyNoticesSchema } from '../src/lib/member-contracts'
import { colors } from '../src/theme'

export default function AppealsScreen() {
  const resource = useMemberResource('/safety/notices', ownSafetyNoticesSchema)
  const refresh = () => resource.refresh(true)
  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <Stack.Screen options={{ title: 'Safety reviews', headerShown: true }} />
    <Page title="Safety reviews and appeals" subtitle="Read decisions concerning your account and respond privately." refreshing={resource.refreshing} onRefresh={() => { void refresh().catch(() => undefined) }}>
      {resource.loading ? <StatusView loading message="Loading your safety reviews…" /> : !resource.data ? <StatusView title="Safety reviews unavailable" message={resource.error ?? 'Try loading your reviews again.'} onRetry={() => { void refresh().catch(() => undefined) }} /> : !resource.data.enabled ? <StatusView title="Safety reviews are unavailable" message="Account safety review is not enabled on this server. No appeal has been submitted." /> : resource.data.items.length ? resource.data.items.map(notice => <SafetyNoticeCard key={notice.id} notice={notice} refresh={refresh} />) : <StatusView title="No reviewed notices" message="There are no safety notices concerning your account. Booking problems can be reported from the relevant booking." />}
    </Page>
  </KeyboardAvoidingView>
}
const styles = StyleSheet.create({ keyboard: { flex: 1, backgroundColor: colors.background } })
