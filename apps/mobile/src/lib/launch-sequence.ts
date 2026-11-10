/** A launch is cosmetic: missing image/layout/animation callbacks cannot trap it. */
export function createLaunchSequence({ duration, safetyTimeout, onStart, onFinish }: {
  duration: number; safetyTimeout: number; onStart: () => void; onFinish: () => void
}) {
  let started = false, ended = false, disposed = false
  let completion: ReturnType<typeof setTimeout> | undefined
  const finish = () => {
    if (disposed || ended) return
    ended = true
    clearTimeout(safety)
    if (completion) clearTimeout(completion)
    onFinish()
  }
  const safety = setTimeout(finish, safetyTimeout)
  return {
    ready() {
      if (disposed || ended || started) return
      started = true
      onStart()
      completion = setTimeout(finish, duration)
    },
    dispose() {
      disposed = true
      clearTimeout(safety)
      if (completion) clearTimeout(completion)
    },
  }
}
