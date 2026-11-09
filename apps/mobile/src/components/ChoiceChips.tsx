import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, space } from '../theme'

type Props<T extends string> = { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; disabled?: boolean }

export function ChoiceChips<T extends string>({ label, value, options, onChange, disabled }: Props<T>) {
  return <View style={styles.container}><Text style={styles.label}>{label}</Text><View style={styles.options}>
    {options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: value === option.value, disabled }}
      disabled={disabled} onPress={() => onChange(option.value)} style={({ pressed }) => [styles.option, option.value === value && styles.selected, pressed && styles.pressed, disabled && styles.disabled]}>
      <Text style={[styles.text, option.value === value && styles.selectedText]}>{option.label}</Text>
    </Pressable>)}
  </View></View>
}

const styles = StyleSheet.create({
  container: { gap: space.sm }, label: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 13 }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: { minHeight: 44, paddingHorizontal: space.lg, justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill },
  selected: { borderColor: colors.accentBright, backgroundColor: colors.accentMuted }, text: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 }, selectedText: { color: colors.accentBright }, pressed: { opacity: 0.75 }, disabled: { opacity: 0.5 },
})
