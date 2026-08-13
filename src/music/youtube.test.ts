import { describe, expect, it } from 'vitest'
import { resolveAutoplayState, ytErrorToMessage, YT_ERROR_CODES } from './youtube'

describe('ytErrorToMessage', () => {
  it('maps an unavailable/removed video', () => {
    expect(ytErrorToMessage(YT_ERROR_CODES.notFound)).toContain('unavailable')
  })

  it('maps embedding-disabled videos to embedding copy', () => {
    expect(ytErrorToMessage(YT_ERROR_CODES.embeddingNotAllowed)).toContain('embedding')
    expect(ytErrorToMessage(YT_ERROR_CODES.embeddingNotAllowedAlt)).toContain('embedding')
  })

  it('falls back to a generic message', () => {
    expect(ytErrorToMessage(12345)).toBe('This video could not be played.')
  })
})

describe('resolveAutoplayState', () => {
  it('reports playing for the PLAYING state (1)', () => {
    expect(resolveAutoplayState(1)).toBe('playing')
  })

  it('reports buffering for the BUFFERING state (3)', () => {
    expect(resolveAutoplayState(3)).toBe('buffering')
  })

  it('reports blocked for cued/ended/paused/unstarted states', () => {
    expect(resolveAutoplayState(-1)).toBe('blocked')
    expect(resolveAutoplayState(0)).toBe('blocked')
    expect(resolveAutoplayState(2)).toBe('blocked')
    expect(resolveAutoplayState(5)).toBe('blocked')
  })
})