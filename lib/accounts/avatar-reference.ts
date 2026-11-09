/** Public raster references only; private capabilities/external trackers stay out of profiles. */
export function publicAvatarReference(value: string | null, userId: string): string | null {
  const prefix = `/api/v1/files/profile-avatars/${userId}/`
  if (!value?.startsWith(prefix) || !/^[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(value.slice(prefix.length))) return null
  return value
}
