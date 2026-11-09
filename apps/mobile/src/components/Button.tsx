import { Pressable, StyleSheet, Text, ActivityIndicator } from 'react-native'
import { colors, fonts, radius, space } from '../theme'

type Props = { title: string; onPress: () => void; disabled?: boolean; busy?: boolean; secondary?: boolean }
export function Button({ title, onPress, disabled, busy, secondary }: Props) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, pressed && styles.pressed, (disabled || busy) && styles.disabled]}>
    {busy ? <ActivityIndicator color={secondary ? colors.text : colors.inverse} /> : <Text style={[styles.label, secondary && styles.secondaryLabel]}>{title}</Text>}
  </Pressable>
}
const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: radius.lg, backgroundColor: colors.accentBright, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, paddingVertical: space.md },
  secondary: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.inverse, fontFamily: fonts.semibold, fontSize: 14 }, secondaryLabel: { color: colors.text },
  pressed: { opacity: 0.8 }, disabled: { opacity: 0.5 },
})
