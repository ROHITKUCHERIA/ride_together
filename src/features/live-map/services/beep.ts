let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/**
 * Short beep via WebAudio. Cooled down by the caller — this just plays.
 * Two short pulses (Google Maps-like double beep) for alerts.
 */
export function playBeep(kind: 'alert' | 'warning' = 'alert'): void {
  const c = getCtx()
  if (!c) return
  const now = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = kind === 'alert' ? 880 : 660
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.linearRampToValueAtTime(0.18, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
  osc.connect(gain).connect(c.destination)
  osc.start(now)
  osc.stop(now + 0.24)
  if (kind === 'alert') {
    const osc2 = c.createOscillator()
    const g2 = c.createGain()
    osc2.type = 'sine'
    osc2.frequency.value = 880
    g2.gain.setValueAtTime(0.0001, now + 0.28)
    g2.gain.linearRampToValueAtTime(0.18, now + 0.30)
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.50)
    osc2.connect(g2).connect(c.destination)
    osc2.start(now + 0.28)
    osc2.stop(now + 0.52)
  }
}
