import { Image, StyleSheet, Text, View, type ImageProps } from 'react-native'
import mark from '../../assets/brand-mark.png'
import { brandType, colors, fonts, space } from '../theme'

export function BrandMark({ size = 44, onLoadEnd }: { size?: number; onLoadEnd?: ImageProps['onLoadEnd'] }) {
  return <Image source={mark} alt="" accessible={false} accessibilityIgnoresInvertColors fadeDuration={0} onLoadEnd={onLoadEnd} style={{ width: size, height: size }} resizeMode="contain" />
}

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  const sizing = compact ? brandType.compact : brandType.standard
  return <View accessible accessibilityRole="image" accessibilityLabel="Rentral" style={styles.row}>
    <BrandMark size={sizing.mark} />
    <Text accessible={false} style={[styles.wordmark, { fontSize: sizing.wordmark }]}>rentral</Text>
  </View>
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 0 },
  wordmark: { color: colors.text, fontFamily: fonts.semibold, letterSpacing: -1.4 },
})
