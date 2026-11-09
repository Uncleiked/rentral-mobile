import { useCallback, useRef, useState } from 'react'
import { Alert, BackHandler, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { Stack, router, useFocusEffect } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { Page } from '../src/components/Page'
import { Button } from '../src/components/Button'
import { ChoiceChips } from '../src/components/ChoiceChips'
import { WalkthroughCapture } from '../src/components/WalkthroughCapture'
import { NativeListingFields } from '../src/components/NativeListingFields'
import { ApiError, api, errorMessage } from '../src/lib/api'
import { uploadNativeListingFile } from '../src/lib/native-upload'
import { EMPTY_LISTING_FORM, MAX_NATIVE_DOCUMENT_BYTES, listingFormError, nativeListingMetadata, type ListingCategory, type NativeCapture } from '../src/lib/native-listing'
import { colors, fonts, radius, space } from '../src/theme'

type PickedDocument = { uri: string; name: string; mimeType: string }
type SavedListing = { id: string; status: string }

export default function CreateListingScreen() {
  const [category, setCategory] = useState<ListingCategory>('house')
  const [form, setForm] = useState(EMPTY_LISTING_FORM)
  const [capture, setCapture] = useState<NativeCapture | null>(null)
  const [document, setDocument] = useState<PickedDocument | null>(null)
  const [captureBusy, setCaptureBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('Submit for review')
  const [error, setError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const [saved, setSaved] = useState<SavedListing | null>(null)
  const uploaded = useRef<{ videoUri?: string; videoPath?: string; documentUri?: string; documentPath?: string }>({})
  const submitLock = useRef(false)
  const locked = busy || captureBusy

  useFocusEffect(useCallback(() => {
    if (Platform.OS === 'web') return
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!locked) return false
      Alert.alert('Please wait', captureBusy ? 'Finish the recording before leaving this page.' : 'Your listing is being uploaded or saved. Wait for the result before leaving.')
      return true
    })
    return () => listener.remove()
  }, [locked, captureBusy]))

  async function pickDocument(): Promise<void> {
    setError(null)
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true, multiple: false })
      if (result.canceled) return
      const asset = result.assets[0]
      const size = asset.size ?? new File(asset.uri).size
      if (!asset.mimeType || !['application/pdf', 'image/jpeg', 'image/png'].includes(asset.mimeType) || size <= 0 || size > MAX_NATIVE_DOCUMENT_BYTES) throw new Error('Choose a non-empty PDF, JPG or PNG document up to 10MB.')
      setDocument({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType })
    } catch (reason) { setError(errorMessage(reason)) }
  }

  async function submit(): Promise<void> {
    if (submitLock.current || uncertain || saved) return
    const invalid = listingFormError(category, form)
    if (invalid || !capture || !document) { setError(invalid ?? (!capture ? 'Record a walkthrough with a fresh GPS fix first.' : 'Choose your ownership or listing-authority document.')); return }
    submitLock.current = true; setBusy(true); setError(null)
    let saving = false
    try {
      if (uploaded.current.videoUri !== capture.uri || !uploaded.current.videoPath) {
        setPhase('Uploading walkthrough…')
        const path = await uploadNativeListingFile(capture.uri, 'video')
        uploaded.current = { ...uploaded.current, videoUri: capture.uri, videoPath: path }
      }
      if (uploaded.current.documentUri !== document.uri || !uploaded.current.documentPath) {
        setPhase('Uploading private document…')
        const path = await uploadNativeListingFile(document.uri, 'document', document.mimeType)
        uploaded.current = { ...uploaded.current, documentUri: document.uri, documentPath: path }
      }
      setPhase('Submitting your listing…'); saving = true
      const result = await api<SavedListing>('/my-listings', { method: 'POST', body: { mode: 'submit', listing: {
        category, address: form.address.trim(), basePrice: form.basePrice, metadata: nativeListingMetadata(category, form),
        videoPath: uploaded.current.videoPath, documentPath: uploaded.current.documentPath, lat: capture.lat, lng: capture.lng, accuracy: capture.accuracy,
      } } })
      setSaved(result)
    } catch (reason) {
      // A request may have committed before its response was lost. Retain files
      // and disable blind re-submission until the owner checks the real inventory.
      if (saving && (!(reason instanceof ApiError) || reason.status < 400 || reason.status >= 500 || reason.code === 'INVALID_RESPONSE')) {
        setUncertain(true); setError('The save result could not be confirmed. Your listing may already exist. Check My listings before creating another request; your recording and files are kept here.')
      } else setError(errorMessage(reason))
    } finally { submitLock.current = false; setBusy(false); setPhase('Submit for review') }
  }

  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <Stack.Screen options={{ title: 'Create listing', headerShown: true, gestureEnabled: !locked, headerBackVisible: !locked }} />
    <Page title={saved ? 'Listing submitted' : 'List on Rentral'} subtitle={saved ? 'Your walkthrough, asset details and authority document have been saved for review.' : 'Show your asset. Add the details. Make it discoverable.'}>
      {saved ? <View style={styles.section}><Text style={styles.heading}>Waiting for review</Text><Text style={styles.help}>Your listing is not public yet. This submission does not confirm any listing fee, payment or verification outcome.</Text><Button title="Go to My listings" onPress={() => router.replace('/my-listings')} /></View> : <>
        <ChoiceChips label="What are you listing?" value={category} options={[{ value: 'house', label: 'Home' }, { value: 'car', label: 'Car' }, { value: 'boat', label: 'Boat' }]} disabled={locked || uncertain} onChange={next => { setCategory(next); setForm(previous => ({ ...previous, pricePeriod: next === 'house' ? 'year' : next === 'boat' ? 'trip' : 'day' })); setError(null) }} />
        <View style={styles.section}><WalkthroughCapture value={capture} onChange={setCapture} disabled={busy || uncertain} onBusyChange={setCaptureBusy} /></View>
        <View style={styles.section}><Text style={styles.heading}>Asset details</Text><NativeListingFields category={category} value={form} onChange={setForm} disabled={locked || uncertain} /></View>
        <View style={styles.section}><Text style={styles.heading}>Ownership and listing authority</Text><Text style={styles.help}>{category === 'house' ? 'Provide the title deed, Certificate of Occupancy or signed authority to list this home.' : category === 'car' ? 'Provide current vehicle particulars and authority to list it.' : 'Provide boat registration and authority to list or operate it.'} Your document is stored privately.</Text>
          {document ? <Text style={styles.document}>{document.name}</Text> : null}<Button title={document ? 'Change document' : 'Choose document'} secondary disabled={locked || uncertain} onPress={() => { void pickDocument() }} /><Text style={styles.help}>PDF, JPG or PNG · maximum 10MB</Text></View>
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        {uncertain ? <Button title="Check My listings" onPress={() => router.push('/my-listings')} /> : <Button title={phase} busy={busy} disabled={captureBusy || Platform.OS === 'web'} onPress={() => { void submit() }} />}
      </>}
    </Page>
  </KeyboardAvoidingView>
}

const styles = StyleSheet.create({
  keyboard: { flex: 1, backgroundColor: colors.background }, section: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.lg, gap: space.lg },
  heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 18 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 }, document: { color: colors.accentBright, fontFamily: fonts.medium, fontSize: 13, lineHeight: 21 }, error: { color: colors.warning, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 },
})
