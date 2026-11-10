import { StyleSheet, Text, View } from 'react-native'
import { Button } from './Button'
import { colors, fonts, space } from '../theme'

type Props = { status: 'matched' | 'mismatch' | 'unavailable' | null; disabled: boolean; busy?: boolean; canCheck: boolean; onCheck: () => void }
export function CaptureAddressCheck({ status, disabled, busy, canCheck, onCheck }: Props) {
  return <View style={styles.container}>
    <Text style={styles.heading}>Address and recording location</Text>
    <Text style={styles.help}>Enter the complete building address. Rentral checks it against the location locked during your walkthrough, within 100 metres. Your exact capture coordinates stay private.</Text>
    {!canCheck ? <Text style={styles.help}>A confirmed recording location is needed before this check. Earlier recordings may need a fresh take.</Text> : null}
    {status ? <Text accessibilityLiveRegion="polite" style={status === 'matched' ? styles.matched : styles.warning}>{status === 'matched' ? 'Address matches the recording location. The backend checks this again when you submit.' : status === 'mismatch' ? 'This address does not match the recording location. Correct the address or record a new walkthrough at the actual asset. Submission is blocked.' : 'The building address could not be verified. Add the building number, street, city and state, then check again. Save your draft while the location service is unavailable.'}</Text> : <Text style={styles.help}>Check the address before submitting. Changing the address or recording requires a new check.</Text>}
    <Button title={status ? 'Check address again' : 'Check address location'} secondary busy={busy} disabled={disabled || !canCheck} onPress={onCheck} />
  </View>
}
const styles = StyleSheet.create({ container: { gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 17 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 }, matched: { color: colors.accentBright, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 } })
