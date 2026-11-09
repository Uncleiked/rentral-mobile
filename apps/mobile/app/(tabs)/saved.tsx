import { useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { Page } from '../../src/components/Page'
import { StatusView } from '../../src/components/StatusView'
import { ListingCard } from '../../src/components/ListingCard'
import { useApiResource } from '../../src/hooks/useApiResource'
import type { Listing } from '../../src/lib/types'

export default function Saved() {
  const { data, loading, error, refresh } = useApiResource<{ items: Listing[]; limit: number }>('/saved')
  useFocusEffect(useCallback(() => { refresh() }, [refresh]))
  return <Page title="Worth coming back to" subtitle="Your saved homes, cars and boats." refreshing={loading} onRefresh={refresh}>
    {loading || error ? <StatusView loading={loading} title={error ? 'Could not load your saves' : undefined} message={error ?? undefined} onRetry={error ? refresh : undefined} /> : data?.items.length ? data.items.map(listing => <ListingCard key={listing.id} listing={listing} onSaved={refresh} />) : <StatusView title="Keep a few favourites" message="Tap the heart on a listing and you’ll find it here." />}
  </Page>
}
