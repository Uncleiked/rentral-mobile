import { useCallback, useState } from 'react'
import { Alert, BackHandler, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { Page } from '../src/components/Page'
import { Button } from '../src/components/Button'
import { ChoiceChips } from '../src/components/ChoiceChips'
import { WalkthroughCapture } from '../src/components/WalkthroughCapture'
import { NativeListingFields } from '../src/components/NativeListingFields'
import { OwnerListingMedia } from '../src/components/owner-listing-media'
import { StatusView } from '../src/components/StatusView'
import { useNativeListingDraft } from '../src/hooks/use-native-listing-draft'
import { MAX_NATIVE_DOCUMENT_BYTES } from '../src/lib/native-listing'
import { errorMessage } from '../src/lib/api'
import { colors, fonts, radius, space } from '../src/theme'
import { CaptureAddressCheck } from '../src/components/capture-address-check'
import { draftCaptureId, isLegacyDraftCommand } from '../src/lib/native-draft-workflow'

export default function CreateListingScreen() {
  const params = useLocalSearchParams<{ draft?: string }>()
  const serverId = typeof params.draft === 'string' ? params.draft : null
  const resource = useNativeListingDraft(serverId)
  const draft = resource.draft
  const [captureBusy, setCaptureBusy] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const locked = resource.busy || captureBusy
  const submitted = Boolean(draft?.server && draft.server.status !== 'draft')
  const unknownUpload = draft?.videoUpload?.state === 'unknown' || draft?.documentUpload?.state === 'unknown'
  const captureNeedsReadback = Boolean(draft?.captureSession && ['starting','recording','finishing','sealing'].includes(draft.captureSession.phase))
  const canCheckAddress = Boolean(draft && draftCaptureId(draft) && (!draft.capture || ['recorded','sealed'].includes(draft.captureSession?.phase ?? '')))
  useFocusEffect(useCallback(() => {
    if (Platform.OS === 'web') return
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!locked) return false
      Alert.alert('Please wait', captureBusy ? 'Finish recording before leaving this page.' : 'Your file or listing is being kept safely. Wait for the current operation to finish before leaving.')
      return true
    })
    return () => listener.remove()
  }, [locked, captureBusy]))
  async function pickDocument(): Promise<void> {
    setPickError(null)
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['application/pdf','image/jpeg','image/png','image/webp'], copyToCacheDirectory: true, multiple: false })
      if (picked.canceled) return
      const file = picked.assets[0]
      if (!file.mimeType || !['application/pdf','image/jpeg','image/png','image/webp'].includes(file.mimeType) || (file.size !== undefined && (file.size <= 0 || file.size > MAX_NATIVE_DOCUMENT_BYTES))) throw new Error('Choose a non-empty PDF, JPG, PNG or WebP document no larger than 10MB.')
      await resource.document({ uri: file.uri, name: file.name, mimeType: file.mimeType as 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' })
    } catch (failure) { setPickError(errorMessage(failure)) }
  }
  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <Stack.Screen options={{ title: 'Listing draft', headerShown: true, gestureEnabled: !locked, headerBackVisible: !locked }} />
    <Page title={submitted ? 'Your listing is saved' : 'List on Rentral'} subtitle="Record the actual asset, keep a recoverable draft and submit its details for review.">
      {resource.loading ? <StatusView loading message="Opening device and server draft recovery…" /> : !draft ? <StatusView title={resource.error ? 'Draft recovery needs attention' : 'No active device draft'} message={resource.error ?? 'Start a new device draft or open a saved server draft from My listings.'} onRetry={!resource.error ? resource.reload : undefined} /> : resource.differentServerDraft ? <View style={styles.section}>
        <Text style={styles.heading}>An unfinished device draft is already saved</Text><Text style={styles.help}>Keep working on it, save it to the server or review and discard its device recovery before opening a different draft. Its recording and request identifiers have been kept.</Text><Button title="Resume recovered device draft" onPress={() => router.replace('/create-listing')} />
      </View> : submitted ? <View style={styles.section}><Text style={styles.heading}>Status: {draft.server?.status.replace(/_/g,' ')}</Text><Text style={styles.help}>Your listing is stored on the server. Asset review, publication, processing and fees each require their own confirmed result.</Text><Button title="Manage saved listing" onPress={() => router.push({ pathname: '/owner-listing/[id]', params: { id: draft.server!.id } })} /></View> : draft.pending ? <View style={styles.section}>
        <Text style={styles.heading}>A saved request needs confirmation</Text><Text selectable style={styles.help}>Request identifier: {draft.pending.listing.clientId}</Text><Text style={styles.help}>Its result may already be stored. Check your inventory, then retry only these exact saved instructions. The request identifier is retained across app restarts.</Text>
        <Text selectable style={styles.document}>{draft.pending.mode === 'draft' ? 'Save draft' : 'Submit for asset review'} · {draft.category} · {draft.form.listingTitle || 'Untitled listing'}</Text><Text selectable style={styles.help}>{draft.pending.listing.address || 'Address not added'}{draft.pending.listing.basePrice ? ` · ₦${draft.pending.listing.basePrice}` : ''}</Text>
        <Button title="Check saved request result" secondary busy={resource.busy} onPress={() => { void resource.checkRequest() }} />{isLegacyDraftCommand(draft.pending) ? <Text style={styles.help}>This earlier request is preserved for readback. It cannot create a new listing without a fresh recording location lock.</Text> : <Button title="Retry exact listing request" disabled={!resource.checked || locked} onPress={() => { void resource.send(draft.pending!.mode) }} />}
      </View> : <>
        <View style={styles.section}><Text style={styles.heading}>Draft recovery</Text><Text style={styles.help}>{resource.deviceSavedAt ? `Device recovery confirmed ${new Date(resource.deviceSavedAt).toLocaleString()}.` : 'Device recovery has not been confirmed yet.'} A server draft is saved separately with the button below. Exact capture coordinates stay private.</Text>{draft.server ? <><Text style={styles.help}>Server draft: revision {draft.server.revision}</Text><Text style={styles.help}>Loading server details replaces the device form and selected files with the current server draft.</Text><Button title="Use latest server draft" secondary disabled={locked} onPress={() => { void resource.reloadServer() }} /></> : null}</View>
        <ChoiceChips label="What are you listing?" value={draft.category} options={[{ value:'house',label:'Home' },{ value:'car',label:'Car' },{ value:'boat',label:'Boat' }]} disabled={locked} onChange={category => resource.updateForm(category,{...draft.form,pricePeriod:category==='house'?'year':category==='boat'?'trip':'day'})} />
        <View style={styles.section}>{draft.server?.videoPath && !draft.capture ? <><Text style={styles.heading}>Saved server walkthrough</Text><Text style={styles.help}>{draft.server.captureId ? 'The original recording and its backend location session remain paired. Replacing it needs a fresh online recording.' : 'This earlier walkthrough has no backend recording-location session. Keep its saved evidence and record a fresh walkthrough before submitting.'}</Text><OwnerListingMedia id={draft.server.id} /><Button title="Replace saved walkthrough" secondary disabled={locked || Platform.OS==='web' || captureNeedsReadback} onPress={() => { void resource.capture(null).catch(() => undefined) }} /></> : <WalkthroughCapture value={draft.capture} onChange={resource.capture} onBegin={resource.beginCapture} onComplete={resource.completeCapture} onInterrupted={resource.interruptCapture} isSessionActive={resource.isCaptureSessionActive} disabled={resource.busy || captureNeedsReadback} onBusyChange={setCaptureBusy} />}
          {draft.captureSession ? <><Text style={styles.help}>{draft.captureSession.phase === 'sealed' ? 'Uploaded walkthrough and backend location binding confirmed.' : draft.captureSession.phase === 'recorded' ? 'Start and end location confirmed. The video will be bound to this session after upload.' : ['interrupted','expired'].includes(draft.captureSession.phase) ? 'This session cannot continue. Record a fresh walkthrough; your draft details are kept.' : 'This recording session needs confirmation before another take or save. No location request is repeated automatically.'}</Text>{captureNeedsReadback ? <Button title="Check saved recording status" secondary disabled={captureBusy} busy={resource.busy} onPress={() => { void resource.checkCapture() }} /> : null}</> : null}
        </View>
        <View style={styles.section}><Text style={styles.heading}>Asset details and disclosed fees</Text><NativeListingFields category={draft.category} value={draft.form} onChange={form => resource.updateForm(draft.category,form)} disabled={locked} /></View>
        <View style={styles.section}><CaptureAddressCheck status={resource.addressCheck?.status ?? null} disabled={locked || captureNeedsReadback} canCheck={canCheckAddress && draft.form.address.trim().length >= 5} onCheck={() => { void resource.checkAddress() }} /></View>
        <View style={styles.section}><Text style={styles.heading}>Ownership or listing authority</Text><Text style={styles.help}>{draft.category==='house'?'Provide the title deed, Certificate of Occupancy or signed authority to list this home.':draft.category==='car'?'Provide current vehicle particulars and authority to list this vehicle.':'Provide registration and authority to list or operate this vessel.'} This asset evidence is stored privately.</Text>
          {draft.document || draft.server?.documentPath ? <Text style={styles.document}>{draft.document?.name ?? draft.server?.documentName ?? 'Private authority document saved'}</Text> : null}
          <Button title={draft.document || draft.server?.documentPath?'Choose another authority document':'Choose authority document'} secondary disabled={locked || Platform.OS==='web'} onPress={() => { void pickDocument() }} /><Text style={styles.help}>PDF, JPG, PNG or WebP · maximum10MB{Platform.OS==='web'?' · Use Android or iOS to choose a new device document.':''}</Text>
        </View>
        {unknownUpload ? <View style={styles.section}><Text style={styles.heading}>Upload confirmation needed</Text><Text style={styles.help}>The original files and chosen upload paths are kept. Check their server status before continuing. No unknown upload is repeated automatically.</Text><Button title="Check saved upload status" secondary busy={resource.busy} onPress={() => { void resource.checkUploads() }} /></View> : null}
        <Button title={resource.phase || 'Save server draft'} secondary busy={resource.busy} disabled={captureBusy || unknownUpload || captureNeedsReadback} onPress={() => { void resource.send('draft') }} /><Button title="Submit for asset review" disabled={locked || unknownUpload || captureNeedsReadback || !resource.addressMatched} onPress={() => { void resource.send('submit') }} />
      </>}
      {resource.phase ? <Text accessibilityLiveRegion="polite" style={styles.help}>{resource.phase}</Text> : null}
      {resource.uploading ? <Button title="Stop upload and keep recovery" secondary onPress={resource.cancelUpload} /> : null}
      {resource.error || pickError ? <Text selectable accessibilityRole="alert" style={styles.error}>{resource.error ?? pickError}</Text> : null}
      {resource.message ? <Text selectable accessibilityLiveRegion="polite" style={styles.notice}>{resource.message}</Text> : null}
      <Button title="Review My listings" secondary disabled={locked} onPress={() => { setReviewed(true); router.push('/my-listings') }} />
      {draft || resource.error ? <View style={styles.section}><Text style={styles.help}>Discarding removes device recovery and local recording/document copies. It does not cancel server requests or delete server evidence. Review My listings first, especially after an uncertain result.</Text>{reviewed || submitted ? <Button title="Discard device recovery and local copies" secondary disabled={locked} onPress={() => { void resource.dismiss() }} /> : <Text style={styles.help}>Open My listings above before discarding device recovery.</Text>}</View> : null}
    </Page>
  </KeyboardAvoidingView>
}
const styles = StyleSheet.create({ keyboard:{flex:1,backgroundColor:colors.background},section:{borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,borderRadius:radius.xl,padding:space.lg,gap:space.lg},heading:{color:colors.text,fontFamily:fonts.semibold,fontSize:19},help:{color:colors.muted,fontFamily:fonts.regular,fontSize:13,lineHeight:22},document:{color:colors.accentBright,fontFamily:fonts.medium,fontSize:13,lineHeight:22},error:{color:colors.warning,fontFamily:fonts.medium,fontSize:13,lineHeight:22},notice:{color:colors.accentBright,fontFamily:fonts.medium,fontSize:13,lineHeight:22} })
