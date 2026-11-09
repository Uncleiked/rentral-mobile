import { SectionList, StyleSheet, Text, View } from 'react-native'
import { MemberAvatar } from './member-avatar'
import { ListingCard } from './ListingCard'
import { Button } from './Button'
import { StatusView } from './StatusView'
import { memberDate } from '../lib/member-format'
import type { CursorPage, MemberReview, ProfileListing, PublicMember } from '../lib/member-contracts'
import { colors, fonts, radius, space } from '../theme'

type Pages<T> = { items: T[]; data: CursorPage<T> | null; loading: boolean; error: string | null; hasMore: boolean; loadingMore: boolean; moreError: string | null;
  loadMore: () => Promise<void>; refresh: (showProgress?: boolean) => Promise<CursorPage<T>> }
type Row = { kind: 'review'; item: MemberReview } | { kind: 'listing'; item: ProfileListing }
type Section = { key: 'reviews' | 'listings'; title: string; data: Row[] }
type Props = { member: PublicMember; reviews: Pages<MemberReview>; listings: Pages<ProfileListing>; error: string | null; refreshing: boolean; onRefresh: () => void }

export function PublicMemberView({ member, reviews, listings, error, refreshing, onRefresh }: Props) {
  const sections: Section[] = [
    { key: 'reviews', title: 'Participant reviews', data: reviews.items.map(item => ({ kind: 'review', item })) },
    { key: 'listings', title: 'Active listings', data: listings.items.map(item => ({ kind: 'listing', item })) },
  ]
  return <SectionList<Row, Section> sections={sections} keyExtractor={row => `${row.kind}:${row.item.id}`} stickySectionHeadersEnabled={false} contentInsetAdjustmentBehavior="automatic"
    contentContainerStyle={styles.content} refreshing={refreshing} onRefresh={onRefresh}
    ListHeaderComponent={<View style={styles.header}><Text accessibilityRole="header" style={styles.title}>{member.displayName}</Text><Text style={styles.help}>@{member.username}</Text>
      {error ? <><Text accessibilityRole="alert" style={styles.error}>Could not refresh: {error}</Text><Button title="Refresh profile" secondary onPress={onRefresh} /></> : null}
      <View style={styles.identity}><MemberAvatar url={member.avatarUrl} name={member.displayName} /><View style={styles.flex}><Text style={styles.heading}>{member.accountType === 'organization' ? 'Organization' : 'Rentral member'}</Text><Text style={styles.help}>Member since {memberDate(member.memberSince)}</Text></View></View>
      {member.bio ? <Text selectable style={styles.body}>{member.bio}</Text> : null}
      {member.safetyNotice.active ? <View accessibilityLabel="Reviewed account safety notice" style={styles.warning}><Text style={styles.heading}>Active safety notice</Text><Text style={styles.body}>{member.safetyNotice.text ?? 'Rentral reviewed a safety report involving this account and issued an active notice. Use caution and keep communication and payments on the platform.'}</Text></View> : null}
      <View style={styles.card}><Text style={styles.heading}>Reviews from completed bookings</Text><Text style={styles.help}>{member.reviewCount ? `${member.averageRating?.toFixed(1)} out of 5 from ${member.reviewCount} ${member.reviewCount === 1 ? 'review' : 'reviews'}` : 'No participant reviews yet.'}</Text><Text style={styles.help}>Reviews describe participant experiences. They are not a financial credit rating or a guarantee of ownership or asset condition.</Text></View>
    </View>}
    renderSectionHeader={({ section }) => <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>}
    renderItem={({ item: row }) => row.kind === 'listing' ? <View style={styles.item}><ListingCard listing={row.item} /></View> : <View style={[styles.card, styles.item]}>
      <View style={styles.row}><Text style={styles.reviewer}>{row.item.author.username ? `@${row.item.author.username}` : 'Rentral member'}</Text><Text style={styles.rating}>{row.item.rating}/5</Text></View>
      <Text selectable style={styles.body}>{row.item.comment}</Text><Text style={styles.help}>{memberDate(row.item.createdAt)}</Text>
    </View>}
    renderSectionFooter={({ section }) => {
      const resource = section.key === 'reviews' ? reviews : listings
      return <View style={styles.footer}>
        {resource.loading ? <StatusView loading message={`Loading ${section.key}…`} /> : resource.error && !resource.data ? <StatusView title={`${section.title} unavailable`} message={resource.error} onRetry={() => { void resource.refresh(true).catch(() => undefined) }} /> : !resource.items.length ? <StatusView title={section.key === 'reviews' ? 'A fresh start' : 'No active listings'} message={section.key === 'reviews' ? 'Reviews appear after participants complete and review their bookings.' : 'This member has no active listings to display.'} /> : null}
        {resource.moreError || (resource.error && resource.data) ? <Text accessibilityRole="alert" style={styles.error}>{resource.moreError ?? resource.error}</Text> : null}
        {resource.hasMore ? <Button title={section.key === 'reviews' ? 'Older reviews' : 'More listings'} secondary busy={resource.loadingMore} onPress={() => { void resource.loadMore() }} /> : null}
      </View>
    }} />
}
const styles = StyleSheet.create({ content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: space.xl, paddingBottom: space.xxl }, header: { gap: space.xl }, title: { color: colors.text, fontFamily: fonts.bold, fontSize: 30 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.lg }, flex: { flex: 1, gap: space.sm }, sectionTitle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 21, paddingVertical: space.xl },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg }, warning: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.xl, padding: space.xl, gap: space.lg },
  heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 19 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 },
  error: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 }, row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space.md }, reviewer: { color: colors.text, fontFamily: fonts.medium, fontSize: 14 }, rating: { color: colors.accentBright, fontFamily: fonts.semibold, fontSize: 15 }, footer: { gap: space.md, paddingBottom: space.md }, item: { marginBottom: space.lg } })
