import { afterEach, describe, expect, it, vi } from 'vitest'
import { MuteVoiceGuidance, VoiceGuidanceService, type SpeechSynthesisLike, type SpeechUtteranceLike } from './voiceGuidance'

class FakeUtterance implements SpeechUtteranceLike {
  text: string
  lang = ''
  rate = 1
  pitch = 1
  volume = 1
  constructor(text: string) {
    this.text = text
  }
}

function fakeSynthesis(): SpeechSynthesisLike & { spoken: FakeUtterance[] } {
  const state = { spoken: [] as FakeUtterance[] }
  return {
    spoken: state.spoken,
    cancel: vi.fn(),
    speak(utterance) {
      state.spoken.push(utterance as FakeUtterance)
    },
  }
}

describe('VoiceGuidanceService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports support when speech synthesis + utterance exist', () => {
    const svc = new VoiceGuidanceService({ synthesis: fakeSynthesis(), utteranceCtor: FakeUtterance })
    expect(svc.isSupported()).toBe(true)
  })

  it('is unsupported (and inert) without an engine', () => {
    const svc = new VoiceGuidanceService({ synthesis: null })
    expect(svc.isSupported()).toBe(false)
    expect(svc.isEnabled()).toBe(false)
    expect(() => svc.speak('k', 'hello')).not.toThrow()
    expect(() => svc.stop()).not.toThrow()
  })

  it('speaks an announcement when enabled', () => {
    const synth = fakeSynthesis()
    const svc = new VoiceGuidanceService({ synthesis: synth, utteranceCtor: FakeUtterance, enabled: true })
    svc.speak('step-1:far', 'Turn right in 250 meters')
    expect(synth.spoken).toHaveLength(1)
    expect(synth.spoken[0].text).toBe('Turn right in 250 meters')
    expect(synth.spoken[0].lang).toBe('en-US')
  })

  it('does not speak the same key twice', () => {
    const synth = fakeSynthesis()
    const svc = new VoiceGuidanceService({ synthesis: synth, utteranceCtor: FakeUtterance, enabled: true })
    svc.speak('step-1:far', 'Turn right in 250 meters')
    svc.speak('step-1:far', 'Turn right in 250 meters')
    expect(synth.spoken).toHaveLength(1)
  })

  it('force-speaks even when the key was already announced', () => {
    const synth = fakeSynthesis()
    const svc = new VoiceGuidanceService({ synthesis: synth, utteranceCtor: FakeUtterance, enabled: true })
    svc.speak('arrive', 'You have arrived', true)
    svc.speak('arrive', 'You have arrived', true)
    expect(synth.spoken).toHaveLength(2)
  })

  it('stays silent when disabled', () => {
    const synth = fakeSynthesis()
    const svc = new VoiceGuidanceService({ synthesis: synth, utteranceCtor: FakeUtterance, enabled: false })
    svc.speak('k', 'hello')
    expect(synth.spoken).toHaveLength(0)
  })

  it('toggling off stops the current utterance', () => {
    const synth = fakeSynthesis()
    const svc = new VoiceGuidanceService({ synthesis: synth, utteranceCtor: FakeUtterance, enabled: true })
    svc.speak('k', 'hello')
    svc.setEnabled(false)
    expect(synth.cancel).toHaveBeenCalled()
    svc.speak('k2', 'world')
    expect(synth.spoken).toHaveLength(1)
  })

  it('reset allows a key to be spoken again (new route)', () => {
    const synth = fakeSynthesis()
    const svc = new VoiceGuidanceService({ synthesis: synth, utteranceCtor: FakeUtterance, enabled: true })
    svc.speak('step-1:far', 'Turn right')
    svc.reset()
    svc.speak('step-1:far', 'Turn right')
    expect(synth.spoken).toHaveLength(2)
  })

  it('stop cancels the current utterance', () => {
    const synth = fakeSynthesis()
    const svc = new VoiceGuidanceService({ synthesis: synth, utteranceCtor: FakeUtterance, enabled: true })
    svc.speak('k', 'hello')
    svc.stop()
    expect(synth.cancel).toHaveBeenCalled()
  })

  it('the mute implementation never speaks', () => {
    const mute = new MuteVoiceGuidance()
    expect(mute.isSupported()).toBe(false)
    expect(mute.isEnabled()).toBe(false)
    expect(() => mute.speak('k', 'x')).not.toThrow()
    expect(() => mute.stop()).not.toThrow()
  })
})