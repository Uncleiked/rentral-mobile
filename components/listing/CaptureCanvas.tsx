'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { RotateCcw, Video, VideoOff } from 'lucide-react'
import { listingMediaUrl, VIDEO_MIME_CANDIDATES } from '@/lib/storage'
import { isWizardCurrent, useRentralStore } from '@/store/useRentralStore'
import { captureStatusSchema } from '@/lib/contracts/capture'
import { browserCaptureReading, browserPosition, CaptureRequestError, listingRequest } from '@/lib/listings/capture-client'

const WALKTHROUGH_SECONDS = 120

const GPS_REQUIRED_COPY =
  'Location access is required — Rentral only accepts walkthroughs recorded with live GPS.'

// Browsers block camera AND geolocation on non-HTTPS origins (localhost is the
// only exception) — the most common dev trap is opening the LAN IP over http.
const INSECURE_CONTEXT_COPY =
  "Camera and GPS require a secure connection. On this computer open http://localhost:3000. On your phone use the Rentral Android or iOS app."

const GPS_ERROR_COPY: Record<number, string> = {
  1: 'Location permission was denied. Allow location for this site (padlock icon → Site settings), then retry.', // PERMISSION_DENIED
  2: "Your device couldn't determine its position. Turn on Location Services (Mac: System Settings → Privacy & Security → Location Services), then retry.", // POSITION_UNAVAILABLE
  3: 'A precise GPS fix is taking too long. Try outdoors with precise location enabled.', // TIMEOUT
}

// window.isSecureContext never changes for a loaded page; the SSR snapshot
// assumes secure so the server renders the normal UI and the client corrects it.
const subscribeToNothing = () => () => {}
function pageIsHidden(): boolean { return document.visibilityState === 'hidden' }
function useIsSecureContext(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => window.isSecureContext,
    () => true
  )
}

export function CaptureCanvas({ actorId }: { actorId: string }) {
  const generation = useRentralStore(state => state.generation)
  return <CaptureSession key={`${actorId}:${generation}`} actorId={actorId} generation={generation} />
}

function CaptureSession({ actorId, generation }: { actorId: string; generation: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const alive = useRef(true)
  const busy = useRef(false)
  const interrupted = useRef(false)
  const [needsRetake, setNeedsRetake] = useState(() => {
    const store = useRentralStore.getState()
    return store.capture.hasStarted && !store.capture.isComplete && !store.capturePending
  })
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [isAcquiringGps, setIsAcquiringGps] = useState(false)
  const [gpsPermission, setGpsPermission] = useState<PermissionState | 'unknown'>('unknown')
  const isSecure = useIsSecureContext()
  const capture = useRentralStore((state) => state.capture)
  const videoBlob = useRentralStore((state) => state.videoBlob)
  const coords = useRentralStore((state) => state.coords)
  const remoteVideoPath = useRentralStore((state) => state.remoteVideoPath)
  const draftListingId = useRentralStore((state) => state.draftListingId)
  const hasRemoteCoords = useRentralStore((state) => state.hasRemoteCoords)
  const captureId = useRentralStore((state) => state.captureId)
  const capturePending = useRentralStore((state) => state.capturePending)
  const unconfirmed = capturePending !== null
  const updateCapture = useRentralStore((state) => state.updateCapture)
  const setRecordedVideo = useRentralStore((state) => state.setRecordedVideo)
  const setCoords = useRentralStore((state) => state.setCoords)
  const resetCapture = useRentralStore((state) => state.resetCapture)
  const goNext = useRentralStore((state) => state.goNext)
  const goBack = useRentralStore((state) => state.goBack)
  const isCurrent = useCallback(() => alive.current && isWizardCurrent(actorId, generation), [actorId, generation])
  const pendingMatches = (id: string, phase: 'begin' | 'finish') => {
    const saved = useRentralStore.getState().capturePending
    return isCurrent() && saved?.id === id && saved.phase === phase
  }

  // Track browser-level geolocation permission so a hard "denied" is shown
  // proactively (the browser will never re-prompt on its own) and clears
  // itself the moment the user unblocks the site.
  useEffect(() => {
    alive.current = true
    let status: PermissionStatus | null = null
    let cancelled = false
    const onChange = () => {
      if (!cancelled && isCurrent() && status) setGpsPermission(status.state)
    }
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((permissionStatus) => {
        if (cancelled || !isCurrent()) return
        status = permissionStatus
        setGpsPermission(permissionStatus.state)
        permissionStatus.addEventListener('change', onChange)
      })
      .catch(() => {
        // Older Safari can't query geolocation permission — stay 'unknown'.
      })
    return () => {
      alive.current = false
      cancelled = true
      status?.removeEventListener('change', onChange)
    }
  }, [isCurrent])

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false

    // Insecure origins have no navigator.mediaDevices at all — bail before
    // touching it; the render shows the secure-connection instructions.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      return
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((mediaStream) => {
        // The permission prompt can outlive this mount (Strict Mode remount,
        // user navigating away) — a stream that arrives late must be stopped
        // here or the camera stays on with no owner.
        if (cancelled || !isCurrent()) {
          mediaStream.getTracks().forEach((track) => track.stop())
          return
        }
        stream = mediaStream
        streamRef.current = mediaStream
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
      })
      .catch(() => {
        if (!cancelled && isCurrent()) {
          setCameraError("We couldn't access your camera. Check permissions and try again.")
        }
      })

    return () => {
      cancelled = true
      // Stop hardware owned by this mount. Keep any uncertain command and its
      // in-memory finished Blob in the actor-scoped store for explicit readback.
      const recorder = recorderRef.current
      if (recorder) {
        recorder.onstop = null
        recorder.ondataavailable = null
        if (recorder.state !== 'inactive') { try { recorder.stop() } catch { /* Hardware already stopped. */ } }
      }
      if (isWizardCurrent(actorId, generation)) useRentralStore.getState().updateCapture({ isRecording: false })
      stream?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [actorId, generation, isCurrent])

  useEffect(() => {
    const visibility = () => {
      if (!isCurrent() || document.visibilityState !== 'hidden') return
      const state = useRentralStore.getState().capture
      if (state.hasStarted && !state.isComplete) {
        interrupted.current = true
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      }
    }
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [isCurrent])

  // A resumed draft has its take in Storage rather than in memory — preview it
  // through an authorized route; a GPS lock recorded in an earlier session lives only
  // server-side and is represented by hasRemoteCoords.
  const remoteVideoUrl = remoteVideoPath && draftListingId ? listingMediaUrl(draftListingId, 'video') : null
  const showPreview = capture.isComplete && (videoBlob !== null || remoteVideoUrl !== null)
  const gpsLocked = captureId !== null && (coords !== null || hasRemoteCoords)

  // The recorded take is previewed from an object URL tied to the store blob,
  // so it survives leaving and re-entering this step. Cleanup revokes the URL
  // on retake, reset, and unmount alike.
  useEffect(() => {
    const video = previewVideoRef.current
    if (!showPreview || !video) return
    if (videoBlob) {
      const url = URL.createObjectURL(videoBlob)
      video.src = url
      return () => URL.revokeObjectURL(url)
    }
    if (remoteVideoUrl) {
      video.src = remoteVideoUrl
    }
  }, [showPreview, videoBlob, remoteVideoUrl])

  // Re-attach the live stream after a retake swaps the preview element back out.
  useEffect(() => {
    if (!showPreview && videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [showPreview])

  useEffect(() => {
    if (!capture.isRecording) return

    const tick = setInterval(() => {
      if (!isCurrent() || !useRentralStore.getState().capture.isRecording) return
      updateCapture({ countdown: Math.max(0, useRentralStore.getState().capture.countdown - 1) })
    }, 1000)

    return () => clearInterval(tick)
  }, [capture.isRecording, updateCapture, isCurrent])

  const stopRecording = useCallback(() => {
    if (!isCurrent()) return
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }, [isCurrent])

  useEffect(() => {
    if (capture.isRecording && capture.countdown === 0) {
      stopRecording()
    }
  }, [capture.isRecording, capture.countdown, stopRecording])

  const capturePosterFrame = (): Promise<Blob | null> => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return Promise.resolve(null)
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) return Promise.resolve(null)
    context.drawImage(video, 0, 0)
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
  }

  const handleStart = async () => {
    const initial = useRentralStore.getState()
    if (!isCurrent() || busy.current || initial.capturePending || initial.capture.isRecording || initial.mutationBusy || initial.pendingCommand || initial.recoveryError) return
    setGpsError(null)
    const stream = streamRef.current
    if (!stream) return
    if (typeof MediaRecorder === 'undefined') {
      setCameraError("Recording isn't supported in this browser.")
      return
    }
    if (!('geolocation' in navigator)) {
      setGpsError(GPS_REQUIRED_COPY)
      return
    }
    if (gpsPermission === 'denied') {
      // No prompt will appear in this state — send the user to site settings.
      setGpsError(GPS_ERROR_COPY[1])
      return
    }

    busy.current = true
    setIsAcquiringGps(true); setNeedsRetake(false); interrupted.current = false
    updateCapture({ hasStarted: true, isRecording: false, isComplete: false })
    try {
      const reading = browserCaptureReading(await browserPosition())
      if (!isCurrent()) return
      if (pageIsHidden()) throw new CaptureRequestError('Keep Rentral open while obtaining the recording location, then try again.', 400, 'CAPTURE_INTERRUPTED')
      const state = useRentralStore.getState()
      if (state.mutationBusy || state.pendingCommand || state.recoveryError) throw new CaptureRequestError('Finish checking the saved listing request before recording a walkthrough.', 409, 'REQUEST_IN_PROGRESS')
      const id = crypto.randomUUID()
      // Persist the actor-scoped marker before the first request. If storage is
      // unavailable this throws, and no untracked begin command is sent.
      useRentralStore.getState().setCapturePending({ id, phase: 'begin' })
      if (!isCurrent()) return
      useRentralStore.getState().setCaptureId(id)
      if (!isCurrent()) return
      updateCapture({ hasStarted: true, isComplete: false })
      if (!pendingMatches(id, 'begin')) return
      const locked = await listingRequest(actorId, '/api/v1/captures', captureStatusSchema, { id, reading })
      if (!pendingMatches(id, 'begin')) return
      if (locked.id !== id || !['recording', 'expired'].includes(locked.status)) throw new CaptureRequestError('The recording location response could not be confirmed. Check its saved status.', 0, 'INVALID_RESPONSE')
      if (locked.status !== 'recording' || pageIsHidden() || interrupted.current) throw new CaptureRequestError('The location lock is no longer ready. Record a fresh walkthrough.', 409, 'CAPTURE_CHANGED')
      useRentralStore.getState().clearCapturePending()
      if (!isCurrent()) return
      setCoords({ lat: reading.latitude, lng: reading.longitude, accuracy: reading.accuracy })
      const mimeType = VIDEO_MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const started = performance.now()
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (isCurrent() && event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        if (!isCurrent()) return
        updateCapture({ isRecording: false })
        setIsAcquiringGps(true)
        const baseMime = (recorder.mimeType || mimeType || 'video/webm').split(';')[0]
        const blob = new Blob(chunksRef.current, { type: baseMime })
        chunksRef.current = []
        const durationSeconds = Math.min(120, (performance.now() - started) / 1000)
        try {
          if (pageIsHidden() || interrupted.current || !blob.size || durationSeconds < 1) throw new CaptureRequestError('The recording was interrupted or too short. Record a fresh walkthrough.', 400, 'CAPTURE_INTERRUPTED')
          // Keep the finished bytes in the shared store before any further
          // await, so a step unmount cannot strand an acknowledged finish.
          useRentralStore.getState().setCapturePending({ id, phase: 'finish', blob, mime: baseMime, poster: null })
          const poster = await capturePosterFrame()
          if (!pendingMatches(id, 'finish')) return
          useRentralStore.getState().setCapturePending({ id, phase: 'finish', blob, mime: baseMime, poster })
          const endReading = browserCaptureReading(await browserPosition())
          if (!pendingMatches(id, 'finish')) return
          if (pageIsHidden() || interrupted.current) throw new CaptureRequestError('Keep Rentral open and record a fresh walkthrough.', 400, 'CAPTURE_INTERRUPTED')
          const finished = await listingRequest(actorId, `/api/v1/captures/${id}/finish`, captureStatusSchema, { reading: endReading, durationSeconds })
          if (!pendingMatches(id, 'finish')) return
          if (finished.id !== id || finished.status !== 'recorded') throw new CaptureRequestError('The recording finish could not be confirmed.')
          setRecordedVideo(blob, baseMime, poster)
          if (!isCurrent()) return
          updateCapture({ isComplete: true })
          if (!isCurrent()) return
          useRentralStore.getState().clearCapturePending()
          setGpsError(null)
        } catch (reason) {
          if (!isCurrent()) return
          setGpsError(reason instanceof Error ? reason.message : 'The recording location could not be confirmed.')
          const saved = useRentralStore.getState().capturePending
          if (!saved || reason instanceof CaptureRequestError && reason.status > 0 && reason.status < 500 && reason.code !== 'INVALID_RESPONSE') {
            try { if (saved) useRentralStore.getState().clearCapturePending(); setNeedsRetake(true) }
            catch { setGpsError('The recovery record could not be cleared. Allow this site to save local data, then check recording status again.') }
          }
        } finally { if (isCurrent()) { busy.current = false; setIsAcquiringGps(false) } }
      }

      recorderRef.current = recorder
      recorder.start(1000)
      setIsAcquiringGps(false)
      updateCapture({
        hasStarted: true,
        isRecording: true,
        countdown: WALKTHROUGH_SECONDS,
        isComplete: false,
      })
    } catch (reason) {
      if (!isCurrent()) return
      setGpsError(reason instanceof Error ? reason.message : 'Your recording location could not be locked. Try outdoors with precise location enabled.')
      const saved = useRentralStore.getState().capturePending
      if (!saved || reason instanceof CaptureRequestError && reason.status > 0 && reason.status < 500 && reason.code !== 'INVALID_RESPONSE') {
        try {
          if (saved) useRentralStore.getState().clearCapturePending()
          if (!isCurrent()) return
          if (!useRentralStore.getState().captureId) updateCapture({ hasStarted: false, isRecording: false, isComplete: false })
          setNeedsRetake(useRentralStore.getState().capture.hasStarted)
        }
        catch { setGpsError('The recovery record could not be cleared. Allow this site to save local data, then check recording status again.') }
      }
    } finally {
      if (isCurrent() && !useRentralStore.getState().capture.isRecording) { busy.current = false; setIsAcquiringGps(false) }
    }
  }

  const checkPending = async () => {
    const saved = useRentralStore.getState().capturePending
    if (!isCurrent() || !saved || busy.current) return
    busy.current = true
    setIsAcquiringGps(true)
    try {
      const current = await listingRequest(actorId, `/api/v1/captures/${saved.id}`, captureStatusSchema)
      if (!pendingMatches(saved.id, saved.phase)) return
      if (current.id !== saved.id) throw new CaptureRequestError('The server returned another recording. Check the saved recording again.', 0, 'INVALID_RESPONSE')
      if (saved.phase === 'finish' && ['recorded', 'sealed'].includes(current.status) && saved.blob && saved.mime) {
        setRecordedVideo(saved.blob, saved.mime, saved.poster ?? null)
        if (!isCurrent()) return
        useRentralStore.getState().setCaptureId(saved.id)
        if (!isCurrent()) return
        updateCapture({ hasStarted: true, isRecording: false, isComplete: true })
        if (!isCurrent()) return
        useRentralStore.getState().clearCapturePending()
        setNeedsRetake(false); setGpsError(null)
      } else {
        useRentralStore.getState().clearCapturePending()
        if (!isCurrent()) return
        updateCapture({ hasStarted: true, isRecording: false, isComplete: false })
        setNeedsRetake(true)
        setGpsError(saved.phase === 'finish' && ['recorded', 'sealed'].includes(current.status)
          ? 'The backend recorded this take, but this page no longer has its video. Reloading cannot restore unsaved footage. Record a fresh walkthrough.'
          : 'The location record was checked. Record a fresh walkthrough to complete recording safely.')
      }
    } catch (reason) {
      if (!pendingMatches(saved.id, saved.phase)) return
      if (reason instanceof CaptureRequestError && reason.status === 404) {
        try {
          useRentralStore.getState().clearCapturePending()
          if (!isCurrent()) return
          useRentralStore.getState().setCaptureId(null)
          if (!isCurrent()) return
          setCoords(null)
          if (!isCurrent()) return
          updateCapture({ hasStarted: true, isRecording: false, isComplete: false })
          setNeedsRetake(true); setGpsError('No recording lock was saved. Record a fresh walkthrough.')
        } catch { setGpsError('The recovery record could not be cleared. Allow this site to save local data, then check recording status again.') }
      } else setGpsError(reason instanceof Error ? reason.message : 'Recording status is unavailable. Check again before starting another.')
    } finally { if (isCurrent()) { busy.current = false; setIsAcquiringGps(false) } }
  }

  const recordingBusy = isAcquiringGps || capture.isRecording || unconfirmed
  const retake = () => {
    if (!isCurrent() || busy.current || useRentralStore.getState().capturePending || useRentralStore.getState().capture.isRecording) return
    resetCapture()
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-text-primary tracking-wide mb-2 break-words">
          Record your walkthrough
        </h2>
        <p className="text-sm text-text-secondary">
          Keep Rentral open and stay at the space. Recording starts after the backend locks your GPS; a fresh location is checked again when you finish.
        </p>
      </div>

      <div className="relative isolate aspect-[9/16] w-full overflow-hidden rounded-2xl border border-border-subtle bg-background-app shadow-2xl">
        {showPreview ? (
          <>
            <video key="preview" ref={previewVideoRef} controls playsInline className="h-full w-full object-cover"
              onError={() => setPreviewError(true)} onLoadedData={() => setPreviewError(false)} onLoadStart={() => setPreviewError(false)} />
            {previewError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background-app px-4 text-center text-sm text-text-secondary">
                <p role="status">Video unavailable</p>
                <button type="button" title="Retry video" aria-label="Retry video"
                  onClick={() => { setPreviewError(false); previewVideoRef.current?.load() }}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-glass-light hover:bg-glass-light-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary min-h-11 max-w-full whitespace-normal break-words">
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        ) : !isSecure || cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-glass-light p-4">
              <VideoOff className="h-6 w-6 text-text-muted" />
            </span>
            <p className="text-sm font-medium text-text-muted">{!isSecure ? INSECURE_CONTEXT_COPY : cameraError}</p>
          </div>
        ) : (
          <video key="live" ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        )}

        {/* Top overlay — GPS lock indicator */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between min-w-0 flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-full border border-glass-border-light bg-glass-dark px-3 py-1.5 backdrop-blur-lg">
            <span
              className={`h-2 w-2 rounded-full ${gpsLocked ? 'bg-trust-verified' : 'bg-trust-flagged'}`}
            />
            <span className="text-xs font-semibold text-text-primary">
              {gpsLocked
                ? 'GPS Locked'
                : gpsPermission === 'denied'
                  ? 'GPS Blocked'
                  : isAcquiringGps
                    ? 'Acquiring GPS...'
                    : 'GPS Required'}
            </span>
          </div>
          {capture.isRecording && (
            <div className="flex items-center gap-2 rounded-full border border-trust-flagged bg-glass-warning px-3 py-1.5 backdrop-blur-md">
              <span className="h-2 w-2 animate-pulse rounded-full bg-text-primary" />
              <span className="text-xs font-semibold text-text-primary">REC</span>
            </div>
          )}
        </div>

        {/* Bottom overlay — countdown + controls */}
        <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-col items-center gap-4 rounded-xl border border-glass-border-light bg-glass-dark px-5 py-5 backdrop-blur-lg">
          {capture.hasStarted && !capture.isComplete && (
            <span className="text-3xl font-extrabold tracking-tight text-text-primary">
              {String(Math.floor(capture.countdown / 60)).padStart(2, '0')}:
              {String(capture.countdown % 60).padStart(2, '0')}
            </span>
          )}

          {(gpsError || (gpsPermission === 'denied' && !gpsLocked)) && (
            <p className="text-center text-xs font-semibold text-trust-flagged">
              {gpsError ?? GPS_ERROR_COPY[1]}
            </p>
          )}

          {isSecure && !capture.hasStarted && !capture.isComplete && !unconfirmed && (
            <button
              type="button"
              onClick={handleStart}
              disabled={!!cameraError || recordingBusy}
              className="glass-btn flex w-full items-center justify-center gap-2 rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98 disabled:cursor-not-allowed disabled:opacity-70 min-h-11 max-w-full whitespace-normal break-words"
            >
              <Video className="h-4 w-4" />
              {isAcquiringGps ? 'Locking GPS...' : gpsError ? 'Retry Walkthrough' : 'Start 120s Walkthrough'}
            </button>
          )}

          {capture.isRecording && (
            <button
              type="button"
              onClick={stopRecording}
              className="w-full rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98 min-h-11 max-w-full whitespace-normal break-words"
            >
              Finish Early
            </button>
          )}

          {capture.isComplete && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-trust-verified">
                Walkthrough captured — review it above
              </p>
              <button
                type="button"
                onClick={retake}
                disabled={recordingBusy}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98 disabled:cursor-not-allowed disabled:opacity-40 min-h-11 max-w-full whitespace-normal break-words"
              >
                <RotateCcw className="h-4 w-4" />
                Retake Walkthrough
              </button>
            </>
          )}
        </div>
      </div>

      {unconfirmed ? <div className="mt-4 text-sm text-text-secondary"><p role="status">A recording request still needs confirmation. Check its saved status before recording another take.</p><button type="button" disabled={isAcquiringGps} onClick={() => { void checkPending() }} className="mt-3 min-h-11 w-full rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-40 max-w-full whitespace-normal break-words">{isAcquiringGps ? 'Checking recording…' : 'Check recording status'}</button></div> : null}
      {needsRetake || (showPreview && !captureId) ? <div className="mt-4 text-sm text-text-secondary"><p>This recording has no completed backend location lock. Keep your draft details and record a new walkthrough before submitting.</p><button type="button" disabled={recordingBusy} className="mt-2 min-h-11 text-accent-primary disabled:cursor-not-allowed disabled:opacity-40 max-w-full whitespace-normal break-words" onClick={retake}>Record a new walkthrough</button></div> : null}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => { if (isCurrent() && !busy.current && !recordingBusy) goBack() }}
          disabled={recordingBusy}
          className="flex-1 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98 disabled:cursor-not-allowed disabled:opacity-40 min-h-11 max-w-full whitespace-normal break-words"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => { if (isCurrent() && !busy.current && !recordingBusy && !needsRetake) goNext() }}
          disabled={!capture.isComplete || !captureId || recordingBusy || needsRetake}
          className="flex-1 rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98 disabled:cursor-not-allowed disabled:opacity-40 min-h-11 max-w-full whitespace-normal break-words"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
