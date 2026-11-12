type GalleryDraftSnapshot = {
  category: string
  form: Record<string, unknown>
  photos: { path: string | null; name: string }[]
  videoPath: string | null
  videoName: string | null
  documentPath: string | null
  documentName: string | null
}

/** Compares user content only: transport recovery/revision changes are not edits. */
export function galleryDraftSnapshot(value: GalleryDraftSnapshot): string {
  const form = Object.fromEntries(Object.entries(value.form)
    .filter(([, field]) => field !== undefined && field !== null && field !== '')
    .sort(([left], [right]) => left.localeCompare(right)))
  return JSON.stringify({ category: value.category, form,
    photos: value.photos.map(photo => photo.path ?? photo.name),
    video: value.videoPath ?? value.videoName, document: value.documentPath ?? value.documentName })
}
