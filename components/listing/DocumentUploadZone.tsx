'use client'

import { useRef, useState } from 'react'
import { FileCheck2, ShieldCheck, UploadCloud } from 'lucide-react'
import { useRentralStore } from '@/store/useRentralStore'

const DOCUMENT_COPY: Record<string, { title: string; description: string }> = {
  house: {
    title: 'Certificate of Occupancy / Deed of Assignment',
    description: 'Upload proof of ownership so Gemini can run a forensic authenticity check.',
  },
  car: {
    title: 'Vehicle Particulars',
    description: 'Upload the vehicle logbook or registration so Gemini can verify authenticity.',
  },
  boat: {
    title: 'Boat Registration',
    description: 'Upload the vessel registration or captain license for verification.',
  },
}

// Mirrors the compliance-docs bucket constraints (migration
// add_listing_storage_buckets) so rejects happen before upload time.
const ACCEPTED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024 // 10MB

export function DocumentUploadZone() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const category = useRentralStore((state) => state.category)
  const documentFile = useRentralStore((state) => state.documentFile)
  const remoteDocumentPath = useRentralStore((state) => state.remoteDocumentPath)
  const remoteDocumentName = useRentralStore((state) => state.remoteDocumentName)
  const setDocumentFile = useRentralStore((state) => state.setDocumentFile)
  const goNext = useRentralStore((state) => state.goNext)
  const goBack = useRentralStore((state) => state.goBack)

  if (!category) return null
  const copy = DOCUMENT_COPY[category]
  // A resumed draft's document already lives in Storage; picking a new file
  // simply replaces it at the next save.
  const documentName = documentFile?.name ?? remoteDocumentName
  const hasDocument = documentFile !== null || remoteDocumentPath !== null

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
      setFileError('That file type is not supported — upload a PDF, JPG, or PNG.')
      return
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setFileError('That file is too large — documents must be 10MB or smaller.')
      return
    }
    setFileError(null)
    setDocumentFile(file)
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-bold text-text-primary tracking-wide mb-2">
          Verify ownership
        </h2>
        <p className="text-sm text-text-secondary">{copy.title}</p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-12 text-center transition-all ${
          isDragging ? 'border-accent-primary bg-accent-muted' : 'border-border-subtle bg-surface-card'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {hasDocument ? (
          <>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-muted">
              <FileCheck2 className="h-6 w-6 text-accent-hover" />
            </span>
            <p className="text-sm font-semibold text-text-primary">{documentName ?? 'Uploaded document'}</p>
            <p className="text-xs font-medium text-text-muted">Tap to replace file</p>
          </>
        ) : (
          <>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-glass-light">
              <UploadCloud className="h-6 w-6 text-text-muted" />
            </span>
            <p className="text-sm font-medium text-text-secondary">{copy.description}</p>
            <p className="text-xs font-medium text-text-muted">PDF, JPG, or PNG</p>
          </>
        )}
      </div>

      {fileError && <p className="mt-3 text-center text-xs text-trust-flagged">{fileError}</p>}

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-glass-border-success bg-accent-muted px-4 py-3">
        <ShieldCheck className="h-4 w-4 shrink-0 text-accent-hover" />
        <p className="text-xs font-medium text-text-secondary">
          AI Forgery Check — documents are screened for tampering before your listing goes live.
        </p>
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
          disabled={!hasDocument}
          className="flex-1 rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
