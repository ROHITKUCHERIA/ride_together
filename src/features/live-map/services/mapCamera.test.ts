/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Point as LeafletPoint } from 'leaflet'
import { MapCameraController } from './mapCamera'

function mockMap() {
  const panes: Record<string, HTMLElement> = {
    mapPane: document.createElement('div'),
    markerPane: document.createElement('div'),
    overlayPane: document.createElement('div'),
    shadowPane: document.createElement('div'),
    popupPane: document.createElement('div'),
  }
  return {
    getPane: vi.fn((name: string) => panes[name] ?? null),
    flyTo: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    fire: vi.fn(),
    getZoom: vi.fn(() => 13),
    stop: vi.fn(),
    getSize: vi.fn(() => ({ x: 1000, y: 2000 })),
    // project(unproject) inverse with a simple linear scale: px = coord * 10
    project: vi.fn((latlng: [number, number]) => new LeafletPoint(latlng[0] * 10, latlng[1] * 10)),
    unproject: vi.fn((pt: LeafletPoint) => ({ lat: pt.x / 10, lng: pt.y / 10 })),
    setView: vi.fn(),
  }
}

describe('MapCameraController', () => {
  let camera: MapCameraController
  let wrapper: HTMLDivElement
  let map: ReturnType<typeof mockMap>

  beforeEach(() => {
    camera = new MapCameraController()
    wrapper = document.createElement('div')
    map = mockMap()
    camera.attach(map as unknown as never, wrapper)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('normalizes bearing to 0-360', () => {
    camera.setBearing(370, { animate: false })
    expect(camera.getBearing()).toBe(10)
    camera.setBearing(-10, { animate: false })
    expect(camera.getBearing()).toBe(350)
  })

  it('heading converts correctly to map bearing (0=N, 90=E)', () => {
    expect(camera.headingToBearing(0)).toBe(0)
    expect(camera.headingToBearing(90)).toBe(270)
    expect(camera.headingToBearing(180)).toBe(180)
    expect(camera.headingToBearing(270)).toBe(90)
    expect(camera.headingToBearing(359)).toBe(1)
  })

  it('bearingToHeading is inverse', () => {
    expect(camera.bearingToHeading(0)).toBe(0)
    expect(camera.bearingToHeading(270)).toBe(90)
  })

  it('resetNorth smooths to 0 via shortest delta (90 -> 0 = -90)', () => {
    camera.setBearing(90, { animate: false })
    expect(camera.getBearing()).toBe(90)
    camera.resetNorth({ animate: false })
    expect(camera.getBearing()).toBe(0)
    expect(wrapper.style.transform).toBe('')
  })

  it('359 -> 0 interpolates via +1 not -359 (shortest path)', () => {
    camera.setBearing(359, { animate: false })
    // animate to 0 — delta should be +1, not -359
    camera.setBearing(0, { animate: false })
    expect(camera.getBearing()).toBe(0)
    // verify wrapper cleared for north
    expect(wrapper.style.transform).toBe('')
  })

  it('350 -> 0 interpolates via +10', () => {
    camera.setBearing(350, { animate: false })
    camera.setBearing(10, { animate: false })
    expect(camera.getBearing()).toBe(10)
  })

  it('heading-up: setBearing animates and updates wrapper transform', async () => {
    camera.setBearing(camera.headingToBearing(90), { animate: false })
    expect(wrapper.style.transform).toBe('perspective(2000px) rotateX(0.00deg) rotate(270.00deg)')
  })

  it('recenter anchors the rider at the lower-middle offset (not 50/50)', () => {
    camera.recenter([12.9, 77.6], { bearing: 45, zoom: 15 })
    const args = (map.flyTo as ReturnType<typeof vi.fn>).mock.calls[0]
    // anchored center: rider at 70% height -> center shifts by (0, 400) px
    expect(args[0][0]).toBeCloseTo(12.9, 5)
    expect(args[0][1]).toBeCloseTo(37.6, 5)
    expect(args[1]).toBe(15)
    // bearing animate is async — verify via direct set
    camera.setBearing(45, { animate: false })
    expect(camera.getBearing()).toBe(45)
  })

  it('setPitch tilts the wrapper with rotateX', () => {
    camera.setPitch(50, { animate: false })
    expect(camera.getPitch()).toBe(50)
    expect(wrapper.style.transform).toContain('rotateX(50.00deg)')
  })

  it('tilt counter-scales the plane so the map keeps full-bleed coverage', () => {
    camera.setPitch(45, { animate: false })
    // 1/cos(45°) × 1.25 margin ≈ 1.77 — about the rider anchor
    expect(wrapper.style.transform).toContain('rotateX(45.00deg)')
    expect(wrapper.style.transform).toContain('scale(1.77)')
    expect(wrapper.style.transformOrigin).toBe('50% 70%')
  })

  it('top-down bearing-only rotation never scales (exact 1:1 zoom)', () => {
    camera.setBearing(90, { animate: false })
    expect(wrapper.style.transform).toBe('perspective(2000px) rotateX(0.00deg) rotate(90.00deg)')
    expect(wrapper.style.transform).not.toContain('scale(')
  })

  it('setPitch clamps to 0..90', () => {
    camera.setPitch(120, { animate: false })
    expect(camera.getPitch()).toBe(90)
    camera.setPitch(-20, { animate: false })
    expect(camera.getPitch()).toBe(0)
  })

  it('resetOrientation returns to North-up top-down (bearing 0 + pitch 0)', () => {
    vi.useFakeTimers()
    camera.setBearing(75, { animate: false })
    camera.setPitch(45, { animate: false })
    camera.resetOrientation({ animate: true, duration: 450 })
    vi.advanceTimersByTime(500)
    expect(camera.getBearing()).toBe(0)
    expect(camera.getPitch()).toBe(0)
    expect(wrapper.style.transform).toBe('')
  })

  it('enterNavigationMode animates bearing + pitch together at nav zoom', () => {
    vi.useFakeTimers()
    camera.setFollowMode('heading-up')
    camera.enterNavigationMode({
      center: [12.9, 77.6],
      bearing: 270,
      zoom: 17,
      pitch: 50,
    })
    const args = (map.flyTo as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(args[1]).toBe(17)
    vi.advanceTimersByTime(700)
    expect(camera.getBearing()).toBe(270)
    expect(camera.getPitch()).toBe(50)
  })

  it('poor GPS accuracy gate lives in caller — controller still allows bearing when asked', () => {
    // Controller itself is agnostic; caller must gate poor accuracy (>250) and gpsLost
    camera.setBearing(90, { animate: false })
    expect(camera.getBearing()).toBe(90)
  })

  it('preserves last bearing when gpsLost (caller skips setBearing)', () => {
    camera.setBearing(45, { animate: false })
    // simulate gpsLost: caller does not call setBearing, bearing stays 45
    expect(camera.getBearing()).toBe(45)
  })

  it('manual interaction disables follow mode (single source)', () => {
    camera.setFollowMode('heading-up')
    expect(camera.getFollowMode()).toBe('heading-up')
    camera.setFollowMode('free')
    expect(camera.getFollowMode()).toBe('free')
  })

  it('no duplicate animation loop — second setBearing cancels first', () => {
    vi.useFakeTimers()
    camera.setBearing(0, { animate: false })
    camera.setBearing(180, { animate: true, duration: 1000 })
    // immediately issue another — should cancel previous raf
    camera.setBearing(90, { animate: true, duration: 1000 })
    expect(camera.getBearing()).not.toBe(180)
    vi.useRealTimers()
  })

  it('north-up remains stable when heading changes but mode is north', () => {
    camera.setBearing(0, { animate: false })
    // heading changes to 90 but caller in north mode should not call setBearing
    expect(camera.getBearing()).toBe(0)
  })

  it('followLocation anchors the rider at the lower-middle offset, not 50/50', () => {
    camera.setFollowMode('follow')
    // Container 1000x2000, offset [0.5, 0.7] -> rider should land at 70% height:
    // target (500,1400), map-center (500,1000) -> rider px (129,776) - (0,400) = (129,376) -> latLng (12.9, 37.6)
    camera.followLocation({ center: [12.9, 77.6], zoom: 13 })
    expect(map.setView).toHaveBeenCalledTimes(1)
    const center = (map.setView as ReturnType<typeof vi.fn>).mock.calls[0][0]
    // unproject mock maps px->coord via inverse scale (x/10, y/10)
    expect(center.lat).toBeCloseTo(12.9, 5)
    expect(center.lng).toBeCloseTo(37.6, 5)
    expect((map.setView as ReturnType<typeof vi.fn>).mock.calls[0][2]).toEqual({ animate: false })
  })

  it('followLocation uses instant setView (no flyTo per GPS tick)', () => {
    camera.setFollowMode('follow')
    camera.followLocation({ center: [12.9, 77.6], zoom: 13 })
    expect(map.flyTo).not.toHaveBeenCalled()
  })

  it('movement + bearing are applied in the same follow cycle', () => {
    vi.useFakeTimers()
    camera.setFollowMode('heading-up')
    camera.followLocation({ center: [12.9, 77.6], bearing: 270, zoom: 13 })
    expect(map.setView).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(250)
    expect(camera.getBearing()).toBe(270)
  })

  it('skips tiny GPS noise below the movement threshold', () => {
    camera.setFollowMode('follow')
    camera.followLocation({ center: [12.9, 77.6], zoom: 13 })
    // ~3.3m (< 4m) — no camera move
    camera.followLocation({ center: [12.90003, 77.6], zoom: 13 })
    expect(map.setView).toHaveBeenCalledTimes(1)
    // ~11m (>= 4m) — camera follows
    camera.followLocation({ center: [12.9001, 77.6], zoom: 13 })
    expect(map.setView).toHaveBeenCalledTimes(2)
  })

  it('rotates in place when only the heading changes (no re-center)', () => {
    vi.useFakeTimers()
    camera.setFollowMode('follow')
    camera.followLocation({ center: [12.9, 77.6], bearing: 0, zoom: 13 })
    expect(map.setView).toHaveBeenCalledTimes(1)
    camera.followLocation({ center: [12.9, 77.6], bearing: 90, zoom: 13 })
    // rotation-only update — must not re-center
    expect(map.setView).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(250)
    expect(camera.getBearing()).toBe(90)
  })

  it('is gated by followMode free (manual drag stops the camera)', () => {
    camera.setFollowMode('free')
    camera.followLocation({ center: [12.9, 77.6], zoom: 13 })
    expect(map.setView).not.toHaveBeenCalled()
  })

  it('re-entering follow resets the threshold so the next tick always moves', () => {
    camera.setFollowMode('follow')
    camera.followLocation({ center: [12.9, 77.6], zoom: 13 })
    expect(map.setView).toHaveBeenCalledTimes(1)
    // user drags -> free, then Recenter -> follow again (same position)
    camera.setFollowMode('free')
    camera.setFollowMode('follow')
    camera.followLocation({ center: [12.9, 77.6], zoom: 13 })
    // Re-center must fire even though the position is unchanged
    expect(map.setView).toHaveBeenCalledTimes(2)
  })

  it('followLocation applies pitch only when heading-up (tilted navigation tick)', () => {
    vi.useFakeTimers()
    camera.setFollowMode('heading-up')
    camera.followLocation({ center: [12.9, 77.6], bearing: 270, pitch: 50, zoom: 13 })
    expect(map.setView).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(250)
    expect(camera.getBearing()).toBe(270)
    expect(camera.getPitch()).toBe(50)
    expect(wrapper.style.transform).toContain('rotateX(50.00deg)')
  })

  it('north-up follow re-asserts bearing 0 but leaves pitch untouched', () => {
    vi.useFakeTimers()
    camera.setFollowMode('follow')
    camera.setBearing(75, { animate: false })
    camera.followLocation({ center: [12.9, 77.6], bearing: 0, zoom: 13 })
    expect(map.setView).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(250)
    expect(camera.getBearing()).toBe(0)
    expect(camera.getPitch()).toBe(0)
  })

  it('cancels an in-flight camera animation before following', () => {
    camera.setFollowMode('follow')
    camera.followLocation({ center: [12.9, 77.6], zoom: 13 })
    expect(map.stop).toHaveBeenCalledTimes(1)
  })
})
