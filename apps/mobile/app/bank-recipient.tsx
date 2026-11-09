import { useCallback, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { Host, Picker } from '@expo/ui'
import { Stack, useFocusEffect } from 'expo-router'
import { Page } from '../src/components/Page'
import { Button } from '../src/components/Button'
import { Field } from '../src/components/Field'
import { StatusView } from '../src/components/StatusView'
import { useFinancialWorkspace } from '../src/hooks/use-financial-workspace'
import { useMemberPages } from '../src/hooks/use-member-resource'
import { financialBanksSchema, disableFinancialRecipient, setupFinancialRecipient } from '../src/lib/financial-api'
import { recipientCommandSchema } from '../src/lib/financial-input'
import { bookingOutcomeUncertain } from '../src/lib/booking-api'
import { memberStatus } from '../src/lib/member-format'
import { errorMessage } from '../src/lib/api'
import { useAuth } from '../src/providers/AuthProvider'
import { colors, fonts, radius, space } from '../src/theme'

const bankPageSchema = financialBanksSchema.transform(page => ({ items: page.items, nextCursor: page.next, limit: 100 }))
type BankCommand = { bankCode: string; accountNumber: string }
export default function BankRecipientScreen() {
  const { session } = useAuth()
  const workspace = useFinancialWorkspace()
  const banks = useMemberPages('/financial/banks', bankPageSchema, Boolean(workspace.data?.settlementAvailable))
  const [bankCode, setBankCode] = useState('')
  const [search, setSearch] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [checked, setChecked] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [disabling, setDisabling] = useState<string | null>(null)
  const command = useRef<BankCommand | null>(null)
  const pending = useRef(false)
  const focused = useRef(false)
  useFocusEffect(useCallback(() => {
    focused.current = true
    return () => { focused.current = false; command.current = null; setAccountNumber(''); setUncertain(false); setChecked(false) }
  }, []))
  const filtered = banks.items.filter(item => item.active && item.name.toLowerCase().includes(search.trim().toLowerCase()))
  const selectedBank = filtered.find(item => item.code === bankCode) ?? filtered[0]
  async function setup(): Promise<void> {
    if (pending.current || !session || (uncertain && !checked)) return
    const input = command.current ?? { bankCode: selectedBank?.code ?? '', accountNumber }
    const parsed = recipientCommandSchema.safeParse(input)
    if (!parsed.success) { setMessage('Choose a bank and enter the ten-digit Nigerian account number.'); return }
    pending.current = true; setBusy(true); setMessage(null); setChecked(false); command.current = parsed.data
    try {
      const saved = await setupFinancialRecipient(parsed.data, session.user.id)
      if (focused.current) { setAccountNumber(''); command.current = null; setUncertain(false); setMessage(`Your bank recipient ending ${saved.accountLast4} is ${memberStatus(saved.status).toLowerCase()}.`); await workspace.refresh().catch(() => undefined) }
    } catch (failure) {
      if (focused.current) { setMessage(errorMessage(failure)); if (bookingOutcomeUncertain(failure)) setUncertain(true); else command.current = null }
    } finally { pending.current = false; setBusy(false) }
  }
  async function check(): Promise<void> {
    if (pending.current) return
    pending.current = true; setBusy(true); setMessage(null)
    try { await workspace.refresh(true); if (focused.current) { setChecked(true); setMessage('Saved recipients are refreshed. If needed, retry only the same bank details below.') } }
    catch (failure) { if (focused.current) setMessage(errorMessage(failure)) }
    finally { pending.current = false; setBusy(false) }
  }
  async function disable(id: string): Promise<void> {
    if (pending.current || !session) return
    pending.current = true; setDisabling(id); setMessage(null)
    try { await disableFinancialRecipient(id, session.user.id); if (focused.current) { await workspace.refresh(true); setMessage('This recipient is disabled for future requests. Existing operations keep their original review requirements.') } }
    catch (failure) { if (focused.current) setMessage(errorMessage(failure)) }
    finally { pending.current = false; setDisabling(null) }
  }
  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <Stack.Screen options={{ title: 'Bank recipients', headerShown: true }} />
    <Page title="Bank recipients" subtitle="Paystack verifies a bank recipient before it can be used for reviewed payouts." refreshing={workspace.refreshing} onRefresh={() => { void workspace.refresh(true).catch(() => undefined) }}>
      {workspace.loading ? <StatusView loading message="Loading saved recipients…" /> : !workspace.data ? <StatusView title="Bank recipients unavailable" message={workspace.error ?? 'Load your records again.'} onRetry={() => { void workspace.refresh(true).catch(() => undefined) }} /> : <>
        <View style={styles.card}><Text style={styles.heading}>Saved bank details</Text><Text style={styles.help}>Only the bank code and last four digits are returned. Disabling a recipient does not cancel a submitted payout.</Text>
          {workspace.data.recipients.length ? workspace.data.recipients.map(item => <View key={item.id} style={styles.recipient}><Text selectable style={styles.body}>Bank {item.bankCode} · account ending {item.accountLast4} · {memberStatus(item.status)} · {memberStatus(item.environment)} mode</Text>{item.status !== 'disabled' ? <Button title={`Disable recipient ending ${item.accountLast4}`} secondary disabled={busy || disabling !== null} busy={disabling === item.id} onPress={() => { void disable(item.id) }} /> : null}</View>) : <Text style={styles.help}>No saved recipients.</Text>}
        </View>
        {!workspace.data.settlementAvailable ? <StatusView title="Recipient setup unavailable" message="Bank recipient setup needs this merchant’s Paystack transfer capability. Your saved records remain available." /> : <View style={styles.card}><Text style={styles.heading}>Add a bank recipient</Text><Text style={styles.help}>Your full account number is sent only for this verification. It is held in memory while this form is open and cleared when you leave or receive a confirmed result. It is never saved to device storage.</Text>
          {banks.loading ? <StatusView loading message="Loading supported banks…" /> : banks.error && !banks.data ? <StatusView title="Banks unavailable" message={banks.error} onRetry={() => { void banks.refresh(true).catch(() => undefined) }} /> : <>
            <Field label="Find your bank" value={search} onChangeText={setSearch} editable={!busy && !uncertain} autoCorrect={false} />
            {filtered.length ? <><Text style={styles.help}>Bank</Text><Host matchContents colorScheme="dark" seedColor={colors.accentBright}><Picker selectedValue={selectedBank?.code ?? ''} onValueChange={setBankCode} enabled={!busy && !uncertain} testID="recipient-bank">{filtered.map(item => <Picker.Item key={item.id} value={item.code} label={item.name} />)}</Picker></Host></> : <Text style={styles.help}>No matching bank is loaded. Try another name or load more banks.</Text>}
            {banks.hasMore ? <Button title="Load more banks" secondary busy={banks.loadingMore} disabled={busy || uncertain} onPress={() => { void banks.loadMore() }} /> : null}
            <Field label="Ten-digit account number" value={accountNumber} onChangeText={value => setAccountNumber(value.replace(/\D/g, ''))} keyboardType="number-pad" inputMode="numeric" secureTextEntry maxLength={10} autoComplete="off" textContentType="none" autoCorrect={false} editable={!busy && !uncertain} />
            {uncertain ? <><Text style={styles.warning}>Bank verification may have reached Paystack. Check saved recipients before retrying the same details. Your full account number will not survive leaving this screen.</Text><Button title="Check saved recipients" secondary busy={busy} onPress={() => { void check() }} /><Button title="Retry same bank details" disabled={busy || !checked} onPress={() => { void setup() }} /></> : <Button title="Verify bank recipient" busy={busy} disabled={!selectedBank || accountNumber.length !== 10 || disabling !== null} onPress={() => { void setup() }} />}
            {banks.moreError || banks.error ? <Text accessibilityRole="alert" style={styles.warning}>{banks.moreError ?? banks.error}</Text> : null}
          </>}
        </View>}
        {workspace.error ? <Text accessibilityRole="alert" style={styles.warning}>Could not refresh: {workspace.error}</Text> : null}
      </>}
      {message ? <Text selectable accessibilityLiveRegion="polite" style={styles.warning}>{message}</Text> : null}
    </Page>
  </KeyboardAvoidingView>
}
const styles = StyleSheet.create({ keyboard: { flex: 1, backgroundColor: colors.background }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space.xl, gap: space.lg },
  heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 20 }, body: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 21 }, warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 }, recipient: { gap: space.md } })
