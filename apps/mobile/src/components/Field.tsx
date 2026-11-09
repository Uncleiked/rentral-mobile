import { useState } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { colors, fonts, radius, space } from '../theme'

type Props = TextInputProps & { label: string }
export function Field({ label, ...props }: Props) {
  const [focused, setFocused] = useState(false)
  return <View style={styles.container}><Text style={styles.label}>{label}</Text><TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.muted}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={[styles.input, focused && styles.focused, props.multiline && styles.multiline, props.style]} /></View>
}
const styles = StyleSheet.create({
  container: { gap: space.sm }, label: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 13 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, minHeight: 52, paddingHorizontal: space.lg, paddingVertical: space.md, color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
  focused: { borderColor: colors.accentBright }, multiline: { minHeight: 100, textAlignVertical: 'top' },
})
