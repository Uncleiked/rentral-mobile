'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { RotateCcw, Video, VideoOff } from 'lucide-react'
import { listingsMediaPublicUrl, VIDEO_MIME_CANDIDATES } from '@/lib/storage'
import { useRentralStore } from '@/store/useRentralStore'

const WALKTHROUGH_SECONDS = 120

const GPS_REQUIRED_COPY =
  'Location access is required — Rentral only accepts walkthroughs recorded with live GPS.'

// Browsers block camera AND geolocation on non-HTTPS origins (localhost is the
// only exception) — the most common dev trap is opening the LAN IP over http.
const INSECURE_CONTEXT_COPY =
  "Your connection isn't secure, so the browser blocks the camera and GPS. On this computer open http://localhost:3000 — on a phone run `pnpm dev:https` and open the https:// address it prints."

const GPS_ERROR_COPY: Record<number, string> = {
  1: 'Location permission was denied. Allow location for this site (padlock icon → Site settings), then retry.', // PERMISSION_DENIED
  2: "Your device couldn't determine its position. Turn on Location Services (Mac: System Settings → Privacy & Security → Location Services), then retry.", // POSITION_UNAVAILABLE
  3: "Couldn't get a GPS fix in time — retry and we'll use a faster, lower-accuracy mode.", // TIMEOUT
}

// window.isSecureContext never changes for a loaded page; the SSR snapshot
// assumes secure so the server renders the normal UI and the client corrects it.
const subscribeToNothing = () => () => {}
function useIsSecureContext(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => window.isSecureContext,
    () => true
  )
}

export function CaptureCanvas() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [isAcquiringGps, setIsAcquiringGps] = useState(false)
  const [gpsPermission, setGpsPermission] = useState<PermissionState | 'unknown'>('unknown')
  const isSecure = useIsSecureContext()
  const capture = useRentralStore((state) => state.capture)
  const videoBlob = useRentralStore((state) => state.videoBlob)
  const coords = useRentralStore((state) => state.coords)
  const remoteVideoPath = useRentralStore((state) => state.remoteVideoPath)
  const hasRemoteCoords = useRentralStore((state) => state.hasRemoteCoords)
  const updateCapture = useRentralStore((state) => state.updateCapture)
  const setRecordedVideo = useRentralStore((state) => state.setRecordedVideo)
  const setCoords = useRentralStore((state) => state.setCoords)
  const resetCapture = useRentralStore((state) => state.resetCapture)
  const goNext = useRentralStore((state) => state.goNext)
  const goBack = useRentralStore((state) => state.goBack)

  // Track browser-level geolocation permission so a hard "denied" is shown
  // proactively (the browser will never re-prompt on its own) and clears
  // itself the moment the user unblocks the site.
  useEffect(() => {
    let status: PermissionStatus | null = null
    let cancelled = false
    const onChange = () => {
      if (!cancelled && status) setGpsPermission(status.state)
    }
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((permissionStatus) => {
        if (cancelled) return
        status = permissionStatus
        setGpsPermission(permissionStatus.state)
        permissionStatus.addEventListener('change', onChange)
      })
      .catch(() => {
        // Older Safari can't query geolocation permission — stay 'unknown'.
      })
    return () => {
      cancelled = true
      status?.removeEventListener('change', onChange)
    }
  }, [])

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
        if (cancelled) {
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
        if (!cancelled) {
          setCameraError("We couldn't access your camera. Check permissions and try again.")
        }
      })

    return () => {
      cancelled = true
      // Leaving mid-recording discards the take: silence onstop so no
      // half-assembled blob lands in the store, and clear the stale
      // isRecording flag so the countdown doesn't resume on re-entry.
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.onstop = null
        recorderRef.current.stop()
      }
      const store = useRentralStore.getState()
      if (store.capture.isRecording) {
        store.resetCapture()
      }
      stream?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  // A resumed draft has its take in Storage rather than in memory — preview it
  // from the public URL; a GPS lock recorded in an earlier session lives only
  // server-side and is represented by hasRemoteCoords.
  const remoteVideoUrl = useMemo(() => listingsMediaPublicUrl(remoteVideoPath), [remoteVideoPath])
  const showPreview = capture.isComplete && (videoBlob !== null || remoteVideoUrl !== null)
  const gpsLocked = coords !== null || hasRemoteCoords

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
      updateCapture({ countdown: Math.max(0, useRentralStore.getState().capture.countdown - 1) })
    }, 1000)

    return () => clearInterval(tick)
  }, [capture.isRecording, updateCapture])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }, [])

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

  const handleStart = () => {
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

    const startRecordingWithFix = (position: GeolocationPosition) => {
      setIsAcquiringGps(false)
      setCoords({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      })

      const mimeType = VIDEO_MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate))
      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      } catch {
        setCameraError("Recording isn't supported in this browser.")
        return
      }

      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        const baseMime = (recorder.mimeType || mimeType || 'video/webm').split(';')[0]
        const blob = new Blob(chunksRef.current, { type: baseMime })
        chunksRef.current = []
        const poster = await capturePosterFrame()
        setRecordedVideo(blob, baseMime, poster)
        updateCapture({ isRecording: false, isComplete: true })
      }

      recorderRef.current = recorder
      recorder.start(1000)
      updateCapture({
        hasStarted: true,
        isRecording: true,
        countdown: WALKTHROUGH_SECONDS,
        isComplete: false,
      })
    }

    const requestFix = (highAccuracy: boolean) => {
      navigator.geolocation.getCurrentPosition(
        startRecordingWithFix,
        (error) => {
          // Desktops rarely produce a high-accuracy fix (no GPS hardware) —
          // fall back once to network/Wi-Fi location before giving up.
          if (highAccuracy && (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE)) {
            requestFix(false)
            return
          }
          setIsAcquiringGps(false)
          setGpsError(GPS_ERROR_COPY[error.code] ?? GPS_REQUIRED_COPY)
        },
        highAccuracy
          ? { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
          : { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 }
      )
    }

    // Spatial invariant (build-plan Item 06): recording starts only after a
    // real GPS fix. Denied/unavailable location blocks capture entirely.
    setIsAcquiringGps(true)
    requestFix(true)
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-text-primary tracking-wide mb-2">
          Record your walkthrough
        </h2>
        <p className="text-sm text-text-secondary">
          Keep the camera moving through the entire space. Coordinates lock automatically.
        </p>
      </div>

      <div className="relative isolate aspect-[9/16] w-full overflow-hidden rounded-2xl border border-border-subtle bg-background-app shadow-2xl">
        {!isSecure || cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-glass-light p-4">
              <VideoOff className="h-6 w-6 text-text-muted" />
            </span>
            <p className="text-sm font-medium text-text-muted">{!isSecure ? INSECURE_CONTEXT_COPY : cameraError}</p>
          </div>
        ) : showPreview ? (
          <video key="preview" ref={previewVideoRef} controls playsInline className="h-full w-full object-cover" />
        ) : (
          <video key="live" ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        )}

        {/* Top overlay — GPS lock indicator */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
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

          {isSecure && !capture.hasStarted && !capture.isComplete && (
            <button
              type="button"
              onClick={handleStart}
              disabled={!!cameraError || isAcquiringGps}
              className="glass-btn flex w-full items-center justify-center gap-2 rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Video className="h-4 w-4" />
              {isAcquiringGps ? 'Locking GPS...' : gpsError ? 'Retry Walkthrough' : 'Start 120s Walkthrough'}
            </button>
          )}

          {capture.isRecording && (
            <button
              type="button"
              onClick={stopRecording}
              className="w-full rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98"
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
                onClick={resetCapture}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98"
              >
                <RotateCcw className="h-4 w-4" />
                Retake Walkthrough
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={goBack}
          className="flex-1 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98"
        >
          Back
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!capture.isComplete}
          className="flex-1 rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
