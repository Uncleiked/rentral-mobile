/** Keep full-photo frames useful without allowing corrupt dimensions to create unbounded layouts. */
export function nativePhotoAspectRatio(width: unknown, height: unknown): number {
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 4 / 3
  const ratio = width / height
  return Number.isFinite(ratio) && ratio > 0 ? Math.min(4, Math.max(0.25, ratio)) : 4 / 3
}
