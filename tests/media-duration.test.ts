import { describe, expect, it } from 'vitest'
import { mediaDecision } from '@/lib/media/policy'

describe('walkthrough duration boundary', () => {
  const output = { status: 'ready', playback_ids: [{ id: 'signed-playback', policy: 'signed' }], tracks: [{ type: 'video' }] }
  it('allows the two-minute maximum', () => { expect(mediaDecision({ ...output, duration: 120 }).status).toBe('ready') })
  it('denies videos exceeding two minutes', () => { expect(mediaDecision({ ...output, duration: 120.01 }).error_code).toBe('invalid_output') })
})
