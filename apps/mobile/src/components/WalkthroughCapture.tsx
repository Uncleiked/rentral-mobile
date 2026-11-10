import { useCallback, useRef, useState } from 'react'
import { AppState, Linking, Platform, StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Location from 'expo-location'
import { File } from 'expo-file-system'
import { useFocusEffect } from 'expo-router'
import { Button } from './Button'
import { NativeVideoPreview } from './NativeVideoPreview'
import { MAX_NATIVE_VIDEO_BYTES, type NativeCapture } from '../lib/native-listing'
import { nativeCaptureReading } from '../lib/capture-api'
import { errorMessage } from '../lib/api'
import type { CaptureReading } from '../../../../lib/contracts/capture'
import { colors, fonts, radius, space } from '../theme'

type Props = { value: NativeCapture | null; onChange: (capture: NativeCapture | null) => void | Promise<void>;
  onBegin: (reading: CaptureReading) => Promise<string>; onComplete: (capture: NativeCapture, reading: CaptureReading) => Promise<void>; onInterrupted: (id: string) => Promise<void>;
  isSessionActive: (id: string) => boolean;
  disabled?: boolean; onBusyChange: (busy: boolean) => void }
class CaptureError extends Error {}

async function captureLocation(): Promise<Location.LocationObject> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new CaptureError('Location is taking too long. Move outdoors, enable precise location, then retry.')), 20000) }),
    ])
  } finally { if (timer) clearTimeout(timer) }
}

export function WalkthroughCapture({ value, onChange, onBegin, onComplete, onInterrupted, isSessionActive, disabled, onBusyChange }: Props) {
  const [permission, requestPermission, getPermission] = useCameraPermissions()
  const [ready, setReady] = useState(false)
  const [recording, setRecording] = useState(false)
  const [acquiring, setAcquiring] = useState(false)
  const [phase, setPhase] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(true)
  const [cameraVersion, setCameraVersion] = useState(0)
  const camera = useRef<CameraView>(null)
  const active = useRef(true)
  const busy = useRef(false)
  const sessionStarted = useRef(false)
  const invalidated = useRef(false)
  const duration = useRef(0)

  useFocusEffect(useCallback(() => {
    active.current = true; setFocused(true)
    void getPermission().catch(() => { if (active.current) setError('Could not check camera access. Open your device settings and retry.') })
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active' && busy.current && sessionStarted.current) { invalidated.current = true; camera.current?.stopRecording(); setError('Recording was interrupted. Keep Rentral open and record a fresh walkthrough.') }
    })
    return () => { active.current = false; invalidated.current = true; camera.current?.stopRecording(); listener.remove(); setFocused(false); setReady(false); onBusyChange(false) }
  }, [onBusyChange, getPermission]))

  async function enableCamera(): Promise<void> {
    setError(null)
    try {
      if (permission && !permission.canAskAgain) await Linking.openSettings()
      else if (!(await requestPermission()).granted) setError('Camera access is needed to record your listing. You can enable it in your device settings.')
    } catch { setError('Could not request camera access. Open your device settings and try again.') }
  }

  async function record(): Promise<void> {
    if (!ready || !camera.current || busy.current || disabled) return
    busy.current = true; invalidated.current = false; setAcquiring(true); setError(null); onBusyChange(true)
    let captureId: string | null = null
    let handedOff = false
    let watcher: Location.LocationSubscription | null = null
    try {
      setPhase('Getting your GPS fix…')
      const authorization = await Location.requestForegroundPermissionsAsync()
      if (!authorization.granted) throw new CaptureError('Allow precise location to attach a GPS fix to the walkthrough. Enable it in your device settings, then retry.')
      const location = await captureLocation()
      if (!active.current || invalidated.current) return
      const reading = nativeCaptureReading(location)
      if (AppState.currentState !== 'active') throw new CaptureError('Keep Rentral open while recording, then try again.')
      sessionStarted.current = true
      setPhase('Locking recording location on Rentral…')
      captureId = await onBegin(reading)
      if (!active.current || invalidated.current) return
      if (!camera.current) throw new CaptureError('The camera is unavailable. Return to the capture step and retry.')
      if (AppState.currentState !== 'active') throw new CaptureError('Keep Rentral open while recording, then try again.')
      let lastLocation = location
      watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 }, next => {
        lastLocation = next
        if (next.mocked) { invalidated.current = true; camera.current?.stopRecording(); if (active.current) setError('A simulated location was detected. Turn it off and record a fresh walkthrough at the asset.') }
      })
      if (!active.current || invalidated.current || AppState.currentState !== 'active' || !isSessionActive(captureId)) return
      const recordingStartedAt = Date.now()
      setAcquiring(false); setRecording(true); duration.current = 0; setSeconds(0)
      const result = await camera.current.recordAsync({ maxDuration: 119, maxFileSize: MAX_NATIVE_VIDEO_BYTES, codec: 'avc1', progressUpdateInterval: 0.5 })
      if (!active.current || invalidated.current || !isSessionActive(captureId)) return
      setRecording(false); setAcquiring(true); setPhase('Confirming the end location…')
      if (!result?.uri || duration.current <= 0) throw new CaptureError('The recording was too short or could not be saved. Record a fresh walkthrough.')
      const file = new File(result.uri)
      if (!file.exists || file.size <= 0 || file.size > MAX_NATIVE_VIDEO_BYTES) throw new CaptureError('The video is empty or larger than 200MB. Record a shorter walkthrough.')
      const endLocation = lastLocation.timestamp >= recordingStartedAt && Date.now() - lastLocation.timestamp <= 15000 ? lastLocation : await captureLocation()
      const endReading = nativeCaptureReading(endLocation)
      if (!active.current || invalidated.current || AppState.currentState !== 'active' || !isSessionActive(captureId)) return
      setPhase('Keeping the walkthrough and confirming its location…')
      handedOff = true
      sessionStarted.current = false
      await onComplete({ uri: result.uri, captureId, duration: duration.current }, endReading)
    } catch (reason) { if (active.current) setError(errorMessage(reason)) }
    finally {
      watcher?.remove()
      if (captureId && !handedOff) await onInterrupted(captureId).catch(() => undefined)
      busy.current = false; sessionStarted.current = false; onBusyChange(false); if (active.current) { setRecording(false); setAcquiring(false); setPhase('') }
    }
  }

  return <View style={styles.container}>
    <Text style={styles.heading}>Record a walkthrough</Text><Text style={styles.help}>Show the actual asset in one continuous take, up to two minutes. Stay online: Rentral locks your starting location before the camera records and checks your location again when you finish. Walkthroughs are recorded without sound.</Text>
    {Platform.OS === 'web' ? <Text style={styles.help}>Use the Android or iOS app to record a listing walkthrough.</Text> : value ? <>
      <NativeVideoPreview key={value.uri} uri={value.uri} /><Text style={styles.success}>Walkthrough kept on this device · {Math.ceil(value.duration)} seconds</Text>
      {!value.captureId ? <Text style={styles.error}>This earlier recording has no backend location session. Record a fresh walkthrough to continue.</Text> : null}
      <Button title="Record again" secondary disabled={disabled} onPress={() => { setReady(false); void Promise.resolve(onChange(null)).catch(() => { setError('This recording could not be replaced safely. Keep the current walkthrough and retry.') }) }} />
    </> : permission?.granted ? <>
      {focused ? <CameraView key={cameraVersion} ref={camera} style={styles.camera} facing="back" mode="video" mute videoQuality="720p" videoBitrate={2500000} onCameraReady={() => setReady(true)}
        onMountError={() => { setReady(false); setError('The camera could not start. Check camera access and try on a physical device.') }}
        onRecordingProgress={progress => { duration.current = progress.duration; setSeconds(Math.floor(progress.duration)) }} /> : null}
      {recording ? <><Text accessibilityLiveRegion="polite" style={styles.success}>Recording · {seconds}s / 120s</Text><Button title="Finish walkthrough" onPress={() => camera.current?.stopRecording()} /></>
        : <Button title={acquiring ? phase : ready ? 'Start recording' : 'Starting camera…'} busy={acquiring} disabled={disabled || !ready} onPress={() => { void record() }} />}
    </> : <Button title="Enable camera" secondary disabled={disabled} onPress={() => { void enableCamera() }} />}
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    {error && permission?.granted && !ready && !recording && !acquiring ? <Button title="Retry camera" secondary disabled={disabled} onPress={() => { setError(null); setCameraVersion(previous => previous + 1) }} /> : null}
  </View>
}

const styles = StyleSheet.create({
  container: { gap: space.lg }, heading: { color: colors.text, fontFamily: fonts.semibold, fontSize: 18 }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 },
  camera: { width: '100%', aspectRatio: 9 / 16, maxHeight: 480, borderRadius: radius.xl, overflow: 'hidden' }, success: { color: colors.accentBright, fontFamily: fonts.medium, fontSize: 12, lineHeight: 20 }, error: { color: colors.warning, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 },
})
