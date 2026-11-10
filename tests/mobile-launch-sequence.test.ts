import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLaunchSequence } from '../apps/mobile/src/lib/launch-sequence'

describe('cosmetic launch sequence', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function sequence(duration = 720) {
    const onStart = vi.fn(), onFinish = vi.fn()
    return { onStart, onFinish, sequence: createLaunchSequence({ duration, safetyTimeout: 1500, onStart, onFinish }) }
  }

  it('waits for content, starts once, and completes without animation events', () => {
    const launch = sequence()
    vi.advanceTimersByTime(100)
    expect(launch.onStart).not.toHaveBeenCalled()
    launch.sequence.ready(); launch.sequence.ready()
    expect(launch.onStart).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(719)
    expect(launch.onFinish).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(launch.onFinish).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(2000)
    launch.sequence.ready()
    expect(launch.onFinish).toHaveBeenCalledOnce()
    expect(launch.onStart).toHaveBeenCalledOnce()
  })

  it('releases a launch whose image/layout callback never arrives', () => {
    const launch = sequence()
    vi.advanceTimersByTime(1500)
    expect(launch.onFinish).toHaveBeenCalledOnce()
    expect(launch.onStart).not.toHaveBeenCalled()
    launch.sequence.ready()
    expect(launch.onStart).not.toHaveBeenCalled()
  })

  it('does not extend the maximum time when content arrives late', () => {
    const launch = sequence()
    vi.advanceTimersByTime(1400)
    launch.sequence.ready()
    vi.advanceTimersByTime(100)
    expect(launch.onFinish).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1000)
    expect(launch.onFinish).toHaveBeenCalledOnce()
  })

  it('cleans up an unmounted launch before it is ready', () => {
    const launch = sequence()
    launch.sequence.dispose()
    launch.sequence.ready()
    vi.advanceTimersByTime(3000)
    expect(launch.onStart).not.toHaveBeenCalled()
    expect(launch.onFinish).not.toHaveBeenCalled()
  })

  it('cleans up completion callbacks after an interrupted reveal', () => {
    const launch = sequence()
    launch.sequence.ready()
    vi.advanceTimersByTime(200)
    launch.sequence.dispose()
    vi.advanceTimersByTime(3000)
    expect(launch.onFinish).not.toHaveBeenCalled()
  })

  it('allows a short reduced-motion handoff without the ordinary hold', () => {
    const launch = sequence(180)
    launch.sequence.ready()
    vi.advanceTimersByTime(180)
    expect(launch.onFinish).toHaveBeenCalledOnce()
  })
})
