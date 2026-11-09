import { useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useApiResource } from '../../src/hooks/useApiResource'
import type { ListingPage, Listing } from '../../src/lib/types'
import { api, errorMessage } from '../../src/lib/api'
import { ListingCard } from '../../src/components/ListingCard'
import { Field } from '../../src/components/Field'
import { Button } from '../../src/components/Button'
import { StatusView } from '../../src/components/StatusView'
import { colors, fonts, radius, space } from '../../src/theme'

type Category = 'all' | 'house' | 'car' | 'boat'
const categories: { value: Category; label: string; icon: 'grid-outline' | 'home-outline' | 'car-sport-outline' | 'boat-outline' }[] = [
  { value: 'all', label: 'All', icon: 'grid-outline' }, { value: 'house', label: 'Homes', icon: 'home-outline' }, { value: 'car', label: 'Cars', icon: 'car-sport-outline' }, { value: 'boat', label: 'Boats', icon: 'boat-outline' },
]
export default function Explore() {
  const [category, setCategory] = useState<Category>('all')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [priceQuery, setPriceQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const path = `/listings?category=${category}&q=${encodeURIComponent(search)}${priceQuery}`
  const resource = useApiResource<ListingPage>(path)
  const [extra, setExtra] = useState<{ path: string; page: ListingPage; items: Listing[]; cursor: string | null } | null>(null)
  const [pendingMore, setPendingMore] = useState<{ path: string; page: ListingPage } | null>(null)
  const [pagingError, setPagingError] = useState<{ path: string; page: ListingPage; message: string } | null>(null)
  const currentPage = useRef<{ path: string; page: ListingPage | null }>({ path, page: resource.data })
  const pagingRequest = useRef<{ path: string; page: ListingPage } | null>(null)
  useEffect(() => { currentPage.current = { path, page: resource.data } }, [path, resource.data])
  const matchingExtra = extra?.path === path && extra.page === resource.data ? extra : null
  const loadingMore = pendingMore?.path === path && pendingMore.page === resource.data
  const moreError = pagingError?.path === path && pagingError.page === resource.data ? pagingError.message : null
  const items = [...(resource.data?.items ?? []), ...(matchingExtra?.items ?? [])]
  const cursor = matchingExtra ? matchingExtra.cursor : resource.data?.pagination.nextCursor
  async function loadMore(): Promise<void> {
    if (!cursor || !resource.data || loadingMore || pagingRequest.current?.page === resource.data) return
    const startedPath = path
    const page = resource.data
    const request = { path: startedPath, page }
    pagingRequest.current = request
    setPendingMore(request); setPagingError(null)
    try {
      const next = await api<ListingPage>(`${path}&cursor=${encodeURIComponent(cursor)}`)
      if (currentPage.current.path !== startedPath || currentPage.current.page !== page) return
      setExtra(previous => {
        const existing = previous?.path === startedPath && previous.page === page ? previous.items : []
        const seen = new Set([...page.items, ...existing].map(item => item.id))
        return { path: startedPath, page, items: [...existing, ...next.items.filter(item => !seen.has(item.id))], cursor: next.pagination.nextCursor }
      })
    } catch (reason) {
      if (currentPage.current.path === startedPath && currentPage.current.page === page) setPagingError({ path: startedPath, page, message: errorMessage(reason) })
    } finally {
      if (pagingRequest.current === request) { pagingRequest.current = null; setPendingMore(null) }
    }
  }
  function refresh(): void { currentPage.current = { path, page: null }; setExtra(null); setPagingError(null); resource.refresh() }
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}><FlatList data={items} keyExtractor={item => item.id} renderItem={({ item }) => <ListingCard listing={item} />}
    contentContainerStyle={styles.content} ItemSeparatorComponent={() => <View style={styles.spacer} />} refreshing={resource.loading} onRefresh={refresh} keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<View style={styles.header}><View style={styles.brandRow}><Text style={styles.brand}>rentral.</Text><View style={styles.location}><Ionicons name="location-outline" size={14} color={colors.accentBright} /><Text style={styles.locationText}>Lagos, Nigeria</Text></View></View>
      <Text accessibilityRole="header" style={styles.title}>Find your next{ '\n' }good thing.</Text><Text style={styles.subtitle}>A home. A weekend drive. A day on the water.</Text>
      <View style={styles.searchRow}><View style={styles.flex}><Field label="Search by location" placeholder="Try Lekki, Yaba, Ikoyi…" value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={() => setSearch(query.trim())} /></View><Pressable accessibilityRole="button" accessibilityLabel="Search listings" onPress={() => setSearch(query.trim())} style={styles.searchButton}><Ionicons name="search" color={colors.inverse} size={22} /></Pressable></View>
      <View style={styles.categories}>{categories.map(item => <Pressable accessibilityRole="button" accessibilityState={{ selected: category === item.value }} key={item.value} onPress={() => setCategory(item.value)} style={[styles.category, category === item.value && styles.selected]}><Ionicons name={item.icon} size={20} color={category === item.value ? colors.accentBright : colors.muted} /><Text style={[styles.categoryLabel, category === item.value && styles.selectedText]}>{item.label}</Text></Pressable>)}</View>
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>{search ? `Places around ${search}` : 'Explore the marketplace'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Price filters" accessibilityState={{ expanded: showFilters }} onPress={() => setShowFilters(value => !value)} style={styles.filter}><Ionicons name="options-outline" size={20} color={colors.text} /></Pressable></View>
      {showFilters ? <View style={styles.filterPanel}><View style={styles.searchRow}><View style={styles.flex}><Field label="Min price (₦)" keyboardType="decimal-pad" value={minPrice} onChangeText={setMinPrice} /></View><View style={styles.flex}><Field label="Max price (₦)" keyboardType="decimal-pad" value={maxPrice} onChangeText={setMaxPrice} /></View></View><Button secondary title="Apply price filter" onPress={() => { setPriceQuery(`${minPrice ? `&minPrice=${encodeURIComponent(minPrice)}` : ''}${maxPrice ? `&maxPrice=${encodeURIComponent(maxPrice)}` : ''}`); setShowFilters(false) }} /></View> : null}
    </View>}
    ListEmptyComponent={<StatusView loading={resource.loading} title={resource.error ? 'Could not load listings' : resource.loading ? undefined : 'Room for something new'} message={resource.error ?? (resource.loading ? 'Finding your next move…' : 'No listings match just yet. Try another location or category.')} onRetry={resource.error ? resource.refresh : undefined} />}
    ListFooterComponent={<View style={styles.footer}>{moreError ? <Text accessibilityRole="alert" style={styles.error}>{moreError}</Text> : null}{cursor ? <Button title="More listings" onPress={() => { void loadMore() }} busy={loadingMore} secondary /> : items.length ? <Text style={styles.subtitle}>You’re all caught up.</Text> : null}</View>}
  /></SafeAreaView>
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: space.xl, paddingBottom: space.xxl }, header: { gap: space.xl, paddingBottom: space.xl }, brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }, brand: { fontFamily: fonts.bold, color: colors.text, fontSize: 27, letterSpacing: -1.5 }, location: { flexDirection: 'row', alignItems: 'center', gap: space.xs }, locationText: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 11 },
  title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 40, lineHeight: 45, letterSpacing: -1.4 }, subtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 }, searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }, flex: { flex: 1 }, searchButton: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.accentBright, alignItems: 'center', justifyContent: 'center' }, categories: { flexDirection: 'row', gap: space.sm }, category: { flex: 1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', paddingVertical: space.md, gap: space.sm }, selected: { backgroundColor: colors.accentMuted, borderColor: colors.accent }, categoryLabel: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 }, selectedText: { color: colors.accentBright },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }, sectionTitle: { flex: 1, fontFamily: fonts.semibold, color: colors.text, fontSize: 17 }, filter: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.glass }, filterPanel: { gap: space.lg }, spacer: { height: space.xl }, footer: { paddingVertical: space.xl, gap: space.md }, error: { color: colors.warning, fontSize: 13, fontFamily: fonts.medium, lineHeight: 20 },
})
