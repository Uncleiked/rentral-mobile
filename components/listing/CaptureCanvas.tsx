'use client'

import { useEffect, useRef, useState } from 'react'
import { Video, VideoOff } from 'lucide-react'
import { useRentralStore } from '@/store/useRentralStore'

const WALKTHROUGH_SECONDS = 120
const GPS_LOCK_DELAY_MS = 2000

export function CaptureCanvas() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const capture = useRentralStore((state) => state.capture)
  const updateCapture = useRentralStore((state) => state.updateCapture)
  const goNext = useRentralStore((state) => state.goNext)
  const goBack = useRentralStore((state) => state.goBack)

  // Real camera preview only — no recording, upload, or geolocation calls in this UI-only phase.
  useEffect(() => {
    let stream: MediaStream | null = null

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((mediaStream) => {
        stream = mediaStream
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
      })
      .catch(() => {
        setCameraError("We couldn't access your camera. Check permissions and try again.")
      })

    return () => {
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (!capture.isRecording) return

    const gpsTimer = setTimeout(() => updateCapture({ gpsLocked: true }), GPS_LOCK_DELAY_MS)
    const tick = setInterval(() => {
      updateCapture({ countdown: Math.max(0, useRentralStore.getState().capture.countdown - 1) })
    }, 1000)

    return () => {
      clearTimeout(gpsTimer)
      clearInterval(tick)
    }
  }, [capture.isRecording, updateCapture])

  useEffect(() => {
    if (capture.isRecording && capture.countdown === 0) {
      updateCapture({ isRecording: false, isComplete: true })
    }
  }, [capture.isRecording, capture.countdown, updateCapture])

  const handleStart = () => {
    updateCapture({ hasStarted: true, isRecording: true, countdown: WALKTHROUGH_SECONDS, gpsLocked: false, isComplete: false })
  }

  const handleFinishEarly = () => {
    updateCapture({ isRecording: false, isComplete: true })
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
        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-glass-light p-4">
              <VideoOff className="h-6 w-6 text-text-muted" />
            </span>
            <p className="text-sm font-medium text-text-muted">{cameraError}</p>
          </div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        )}

        {/* Top overlay — GPS lock indicator */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
          <div className="flex items-center gap-2 rounded-full border border-glass-border-light bg-glass-dark px-3 py-1.5 backdrop-blur-lg">
            <span
              className={`h-2 w-2 rounded-full ${capture.gpsLocked ? 'bg-trust-verified' : 'bg-trust-flagged'}`}
            />
            <span className="text-xs font-semibold text-text-primary">
              {capture.gpsLocked ? 'GPS Locked' : 'Acquiring GPS...'}
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
          {capture.hasStarted && (
            <span className="text-3xl font-extrabold tracking-tight text-text-primary">
              {String(Math.floor(capture.countdown / 60)).padStart(2, '0')}:
              {String(capture.countdown % 60).padStart(2, '0')}
            </span>
          )}

          {!capture.hasStarted && !capture.isComplete && (
            <button
              type="button"
              onClick={handleStart}
              disabled={!!cameraError}
              className="glass-btn flex w-full items-center justify-center gap-2 rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Video className="h-4 w-4" />
              Start 120s Walkthrough
            </button>
          )}

          {capture.isRecording && (
            <button
              type="button"
              onClick={handleFinishEarly}
              className="w-full rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98"
            >
              Finish Early
            </button>
          )}

          {capture.isComplete && (
            <p className="text-xs font-semibold uppercase tracking-wide text-trust-verified">
              Walkthrough captured
            </p>
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
