import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Button } from './Button'
import { colors, fonts, radius, space } from '../theme'

type Props = { title?: string; message?: string; loading?: boolean; onRetry?: () => void }
export function StatusView({ title, message, loading, onRetry }: Props) {
  return <View accessibilityLiveRegion="polite" style={styles.container}>
    {loading ? <ActivityIndicator size="large" color={colors.accentBright} /> : <View style={styles.icon}><Ionicons name="leaf-outline" color={colors.muted} size={28} /></View>}
    {title ? <Text style={styles.title}>{title}</Text> : null}{message ? <Text style={styles.message}>{message}</Text> : null}
    {onRetry ? <Button title="Try again" onPress={onRetry} secondary /> : null}
  </View>
}
const styles = StyleSheet.create({
  container: { paddingVertical: space.xxl, alignItems: 'center', gap: space.lg }, icon: { backgroundColor: colors.glass, padding: space.lg, borderRadius: radius.pill },
  title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 17, textAlign: 'center' }, message: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, textAlign: 'center', lineHeight: 22 },
})
