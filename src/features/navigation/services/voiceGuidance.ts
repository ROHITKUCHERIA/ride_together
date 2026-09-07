/**
 * Voice guidance via the Web Speech API (SpeechSynthesis). Wrapped behind a
 * tiny interface so the UI and the navigation hook degrade gracefully when the
 * browser cannot speak (desktop Safari quirks, unsupported engines).
 *
 * Every announcement is keyed (`${instructionId}:far`, `${instructionId}:near`)
 * and spoken at most once per key unless `force` is used — so a maneuver is
 * never read twice as the distance countdown re-enters a threshold.
 */

export interface SpeechSynthesisLike {
  cancel(): void
  speak(utterance: unknown): void
}

export interface SpeechUtteranceLike {
  text: string
  lang: string
  rate: number
  pitch: number
  volume: number
}

export interface VoiceGuidanceDeps {
  synthesis?: SpeechSynthesisLike | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  utteranceCtor?: new (text: string) => any
  /** Initial enabled state — only honoured when speech is supported. */
  enabled?: boolean
}

export interface VoiceGuidance {
  speak(key: string, text: string, force?: boolean): void
  stop(): void
  isSupported(): boolean
  isEnabled(): boolean
  setEnabled(enabled: boolean): void
  /** Clear the spoken-key set when the route (or destination) changes. */
  reset(): void
}

function detectSynthesis(): SpeechSynthesisLike | null {
  if (typeof window === 'undefined') return null
  const synth = window.speechSynthesis
  const hasUtterance = typeof window.SpeechSynthesisUtterance === 'function'
  if (!synth || !hasUtterance) return null
  return synth as SpeechSynthesisLike
}

export class VoiceGuidanceService implements VoiceGuidance {
  private readonly synthesis: SpeechSynthesisLike | null
  private readonly utteranceCtor: (new (text: string) => SpeechUtteranceLike) | null
  private enabled: boolean
  private readonly spoken = new Set<string>()

  constructor(deps: VoiceGuidanceDeps = {}) {
    this.synthesis = deps.synthesis ?? detectSynthesis()
    this.utteranceCtor =
      deps.utteranceCtor ??
      (typeof window !== 'undefined' &&
      typeof window.SpeechSynthesisUtterance === 'function'
        ? (window.SpeechSynthesisUtterance as unknown as new (text: string) => SpeechUtteranceLike)
        : null)
    this.enabled = this.isSupported() && (deps.enabled ?? true)
  }

  isSupported(): boolean {
    return this.synthesis !== null && this.utteranceCtor !== null
  }

  isEnabled(): boolean {
    return this.isSupported() && this.enabled
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) this.stop()
  }

  speak(key: string, text: string, force = false): void {
    if (!this.isEnabled()) return
    if (!force && this.spoken.has(key)) return
    this.spoken.add(key)

    const synth = this.synthesis
    if (!synth) return
    const utterance = new (this.utteranceCtor as new (text: string) => SpeechUtteranceLike)(text)
    utterance.lang = 'en-US'
    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1
    // The previous countdown phrase should not overlap the next one.
    try {
      synth.cancel()
    } catch {
      /* speech synthesis cancel can throw in odd states — ignore */
    }
    synth.speak(utterance)
  }

  stop(): void {
    if (!this.isSupported()) return
    try {
      this.synthesis?.cancel()
    } catch {
      /* ignore */
    }
  }

  reset(): void {
    this.spoken.clear()
  }
}

/** Null-object that never speaks — useful for tests and disabled environments. */
export class MuteVoiceGuidance implements VoiceGuidance {
  speak(_key: string, _text: string, _force = false): void {}
  stop(): void {}
  isSupported(): boolean {
    return false
  }
  isEnabled(): boolean {
    return false
  }
  setEnabled(_enabled: boolean): void {}
  reset(): void {}
}