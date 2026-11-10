import { ScrollView, StyleSheet, Text, View, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { ReactNode } from 'react'
import { colors, fonts, space } from '../theme'

type Props = { title: ReactNode; subtitle?: string; children: ReactNode; refreshing?: boolean; onRefresh?: () => void }
export function Page({ title, subtitle, children, refreshing = false, onRefresh }: Props) {
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}
    refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accentBright} /> : undefined}>
    <View style={styles.header}>{typeof title === 'string' ? <Text accessibilityRole="header" style={styles.title}>{title}</Text> : title}{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>
    {children}
  </ScrollView></SafeAreaView>
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: space.xl, gap: space.xl, paddingBottom: space.xxl * 2 },
  header: { gap: space.sm }, title: { color: colors.text, fontFamily: fonts.bold, fontSize: 30, letterSpacing: -0.8 },
  subtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 },
})
