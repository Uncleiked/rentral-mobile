import { useCallback } from 'react'
import { Text, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Page } from '../../src/components/Page'
import { StatusView } from '../../src/components/StatusView'
import { Button } from '../../src/components/Button'
import { BookingCard } from '../../src/components/BookingCard'
import { useApiResource } from '../../src/hooks/useApiResource'
import type { Booking } from '../../src/lib/types'
import { colors, fonts } from '../../src/theme'

type BookingCollection = { items: Booking[]; limit: number }

export default function BookingsScreen() {
  const { data, loading, error, refresh } = useApiResource<BookingCollection>('/bookings')
  useFocusEffect(useCallback(() => { refresh() }, [refresh]))
  return <Page title="Your bookings" subtitle="Inspections, rentals and holds, all in one place." refreshing={loading} onRefresh={refresh}>
    {loading ? <StatusView loading message="Loading your bookings…" /> : error ? <StatusView title="Bookings unavailable" message={error} onRetry={refresh} /> : data?.items.length ? <>
      {data.items.map(booking => <BookingCard key={booking.id} booking={booking} />)}
      {data.items.length >= data.limit ? <Text style={styles.note}>Showing your {data.limit} most recent bookings.</Text> : null}
    </> : <><StatusView title="Make room for your next plan" message="Book an inspection, rent a home, find a car or spend a day on the water. Your requests will appear here." /><Button title="Explore Rentral" onPress={() => router.navigate('/(tabs)/explore')} /></>}
  </Page>
}

const styles = StyleSheet.create({ note: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center', lineHeight: 20 } })
