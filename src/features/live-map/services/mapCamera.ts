import {
  Point as LeafletPoint,
  type LatLng,
  type Map as LeafletMap,
} from 'leaflet'
import {
  FOLLOW_BEARING_MIN_STEP_DEG,
  FOLLOW_CAMERA_OFFSET_X,
  FOLLOW_CAMERA_OFFSET_Y,
  FOLLOW_MIN_MOVE_METERS,
  NAV_CAMERA_PERSPECTIVE_PX,
} from '../config'
import { calculateDistanceInMeters } from '../utils/geo'

export type MapFollowMode = 'free' | 'follow' | 'heading-up'

export interface FollowOptions {
  /** Rider position as [lat, lng] (matches every other Leaflet call in the app). */
  center: [number, number]
  /** Map bearing to animate to in the same cycle. Omit to leave bearing untouched. */
  bearing?: number
  /** Navigation camera tilt in degrees (0 = top-down). Omit to leave pitch untouched. */
  pitch?: number
  /** Desired zoom when the center moves; defaults to the current zoom. */
  zoom?: number
  /** Screen fraction of the map container where the rider should sit (e.g. [0.5, 0.7]). */
  offset?: [number, number]
  /** Skip the camera move when the rider moved less than this (m). */
  minMoveMeters?: number
}

const DEFAULT_FOLLOW_OFFSET: [number, number] = [FOLLOW_CAMERA_OFFSET_X, FOLLOW_CAMERA_OFFSET_Y]
const MIN_PITCH_DEG = 0
const MAX_PITCH_DEG = 90
/** Counter-scale margin over the pure 1/cos tilt foreshortening — perspective
 *  compression plus bearing-rotation corners need extra coverage. */
const TILT_SCALE_MARGIN = 1.25
/** Hard cap so extreme pitches never blow the plane up absurdly. */
const MAX_TILT_SCALE = 2

function normalize(bearing: number): number {
  return ((bearing % 360) + 360) % 360
}

function shortestDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Leaflet adapter exposing a MapLibre-style camera API (center, zoom, bearing,
 * pitch). Leaflet has NO native bearing or pitch, so both are rendered on an
 * isolated wrapper element that surrounds the MapContainer (never touching
 * `.leaflet-map-pane` / Leaflet's own `translate3d`):
 *
 *   camera wrapper  (perspective + rotateX + rotate — decisive here)
 *     └── .leaflet-container (Leaflet still owns center/zoom positioning)
 *           └── .leaflet-map-pane
 *
 * Hierarchy: Leaflet camera   → center/zoom
 *            camera wrapper   → bearing + pitch (the visual navigation tilt)
 *
 * ONE transition controller (`runTransition`) animates bearing AND pitch on the
 * same RAF loop, so movement + rotation + tilt are always in sync — no separate
 * competing animation loops.
 *
 * Bearing convention: 0° = North up, clockwise. Heading (0=N) maps to bearing
 * via headingToBearing(): bearing = -heading (heading East 90° => bearing 270°).
 *
 * Leaflet limitation: true perspective camera (like MapLibre) is not possible —
 * pitch is rendered with a CSS `perspective(...) rotateX(...)` projection on the
 * isolated wrapper. In free / north-up mode pitch is 0, so Leaflet's pointer
 * math stays exact; tilt only engages under heading-up navigation, matching the
 * Google Maps navigation interaction model.
 */
export class MapCameraController {
  private map: LeafletMap | null = null
  private wrapper: HTMLElement | null = null
  private bearing = 0
  private pitch = 0
  private perspPx = NAV_CAMERA_PERSPECTIVE_PX
  private transRaf = 0
  private followMode: MapFollowMode = 'free'
  private animDuration = 320
  /** Last position the follow camera centered on (threshold + recenter reset). */
  private lastFollowCenter: [number, number] | null = null
  /** The rider anchor as a fraction of the container (lower-middle). */
  private anchor: [number, number] = DEFAULT_FOLLOW_OFFSET
  // re-apply bearing + pitch after Leaflet move events, so pans never desync the
  // visually transformed wrapper from Leaflet's own camera movement.
  private boundOnMove = () => this.applyView(false)

  attach(map: LeafletMap, wrapper?: HTMLElement | null, opts: { offset?: [number, number] } = {}): void {
    this.map = map
    if (opts.offset) this.anchor = opts.offset
    if (wrapper) this.wrapper = wrapper
    this.applyView(false)
    map.on('move', this.boundOnMove)
    map.on('moveend', this.boundOnMove)
  }

  detach(): void {
    if (this.transRaf) cancelAnimationFrame(this.transRaf)
    this.transRaf = 0
    if (this.map) {
      this.map.off('move', this.boundOnMove)
      this.map.off('moveend', this.boundOnMove)
    }
    this.map = null
    this.wrapper = null
  }

  getBearing(): number {
    return normalize(this.bearing)
  }

  getPitch(): number {
    return this.pitch
  }

  getFollowMode(): MapFollowMode {
    return this.followMode
  }

  setFollowMode(mode: MapFollowMode): void {
    this.followMode = mode
    // Re-entering follow forces the first followLocation tick to fully re-center
    // (Recenter button must resume camera movement on the very next GPS update).
    if (mode !== 'free') this.lastFollowCenter = null
  }

  /** Set map bearing. Bearing only rotates — never pitch. */
  setBearing(bearing: number, opts: { animate?: boolean; duration?: number } = {}): void {
    const to = normalize(bearing)
    const animate = opts.animate ?? true
    if (!animate) {
      this.cancelTransition()
      this.bearing = to
      this.applyView(true)
      return
    }
    this.runTransition(to, null, opts.duration ?? this.animDuration)
  }

  /** Set camera pitch (0 = top-down, up to 90 = flat horizon). */
  setPitch(pitch: number, opts: { animate?: boolean; duration?: number } = {}): void {
    const to = clamp(pitch, MIN_PITCH_DEG, MAX_PITCH_DEG)
    const animate = opts.animate ?? true
    if (!animate) {
      this.cancelTransition()
      this.pitch = to
      this.applyView(true)
      return
    }
    this.runTransition(null, to, opts.duration ?? this.animDuration)
  }

  resetNorth(opts: { animate?: boolean } = {}): void {
    if (opts.animate === false) {
      this.cancelTransition()
      this.bearing = 0
      this.applyView(true)
      return
    }
    this.runTransition(0, null, this.animDuration)
  }

  /** North button: bearing → 0 AND pitch → 0 (top-down North-up). Follow mode is
   *  a separate decision and is left untouched by the camera. */
  resetOrientation(opts: { animate?: boolean; duration?: number } = {}): void {
    if (opts.animate === false) {
      this.cancelTransition()
      this.bearing = 0
      this.pitch = 0
      this.applyView(true)
      return
    }
    this.runTransition(0, 0, opts.duration ?? 450)
  }

  /**
   * Smoothly enter navigation mode: fly the Leaflet camera to the rider anchor
   * at the navigation zoom while rotating bearing→heading and tilting pitch in
   * ONE coordinated transition. Everything after this (per-GPS FIX) goes through
   * followLocation.
   */
  enterNavigationMode(opts: { center: [number, number]; bearing: number; zoom: number; pitch: number; offset?: [number, number] }): void {
    if (!this.map) return
    const m = this.map
    const [lat, lng] = opts.center
    const offset = opts.offset ?? this.anchor
    const pitch = clamp(opts.pitch, MIN_PITCH_DEG, MAX_PITCH_DEG)
    const bearing = normalize(opts.bearing)
    m.stop?.()
    const anchor = this.anchorCenters(lat, lng, opts.zoom, offset)
    m.flyTo(anchor, opts.zoom, { duration: 0.7, easeLinearity: 0.2 })
    this.runTransition(bearing, pitch, 650)
  }

  /**
   * Center + optional bearing + zoom. Bearing and center are animated together
   * without fighting — we drive bearing/pitch via the wrapper and center via
   * Leaflet. Intended for one-shot user actions (Recenter), never per GPS tick.
   */
  easeTo(opts: { center: [number, number]; bearing?: number; pitch?: number; zoom?: number; duration?: number }): void {
    if (!this.map) return
    const m = this.map
    const duration = opts.duration ?? 0.5
    if (opts.bearing !== undefined || opts.pitch !== undefined) {
      this.runTransition(
        opts.bearing !== undefined ? opts.bearing : null,
        opts.pitch !== undefined ? opts.pitch : null,
        duration * 1000,
      )
    }
    if (opts.center) {
      const zoom = opts.zoom ?? m.getZoom()
      m.flyTo(opts.center as unknown as [number, number], zoom, { duration, easeLinearity: 0.2 })
    } else if (opts.zoom !== undefined) {
      m.setZoom(opts.zoom)
    }
  }

  recenter(center: [number, number], opts: { bearing?: number; pitch?: number; zoom?: number; offset?: [number, number] } = {}): void {
    if (!this.map) return
    const zoom = opts.zoom ?? this.map.getZoom()
    const anchor = this.anchorCenters(center[0], center[1], zoom, opts.offset ?? this.anchor)
    this.easeTo({
      center: [anchor.lat, anchor.lng] as [number, number],
      bearing: opts.bearing,
      pitch: opts.pitch,
      zoom,
    })
  }

  /**
   * Google Maps-style navigation camera tick (the single per-GPS-update path).
   *
   * In ONE cycle it (1) validates the map, (2) moves the Leaflet camera to the
   * rider using an instant `setView` (never `flyTo` — no per-tick animation
   * conflicts), (3) anchors the rider at the lower-middle offset, (4) animates
   * bearing + pitch together in the same cycle, and (5) cancels any in-flight
   * Leaflet animation first. A small movement threshold skips GPS noise; a
   * recenter resets the threshold so the next fix always moves the map.
   */
  followLocation(opts: FollowOptions): void {
    if (!this.map) return
    if (this.followMode === 'free') return
    const m = this.map
    const [lat, lng] = opts.center
    const zoom = opts.zoom ?? m.getZoom()
    const offset = opts.offset ?? this.anchor
    const minMoveMeters = opts.minMoveMeters ?? FOLLOW_MIN_MOVE_METERS

    const bearing = opts.bearing !== undefined ? normalize(opts.bearing) : null
    const pitch = opts.pitch !== undefined ? clamp(opts.pitch, MIN_PITCH_DEG, MAX_PITCH_DEG) : null

    let moved = true
    if (this.lastFollowCenter) {
      const prev = this.lastFollowCenter
      const d = calculateDistanceInMeters(prev[0], prev[1], lat, lng)
      moved = d >= minMoveMeters
    }
    const bearingChanged = bearing !== null && Math.abs(shortestDelta(this.bearing, bearing)) >= FOLLOW_BEARING_MIN_STEP_DEG
    const pitchChanged = pitch !== null && Math.abs(pitch - this.pitch) >= 0.5
    if (!moved && !bearingChanged && !pitchChanged) return

    // Cancel any in-flight Leaflet camera animation (e.g. a recenter flyTo) before
    // issuing the follow move — never let two animations fight.
    m.stop?.()

    if (moved) {
      const center = this.anchorCenters(lat, lng, zoom, offset)
      m.setView(center, zoom, { animate: false })
      this.lastFollowCenter = [lat, lng]
    }

    // Rotation + tilt are the same transition: heading 90°→95° and pitch move
    // together, never in separate loops.
    if (bearingChanged || pitchChanged) {
      this.runTransition(
        bearingChanged && bearing !== null ? bearing : null,
        pitchChanged && pitch !== null ? pitch : null,
        200,
      )
    }
  }

  /** LatLng that places `[lat, lng]` at the `offset` screen fraction. */
  private anchorCenters(lat: number, lng: number, zoom: number, offset: [number, number]): LatLng {
    const m = this.map
    if (!m) throw new Error('map not attached')
    const size = m.getSize()
    const containerCenter = new LeafletPoint(size.x / 2, size.y / 2)
    const target = new LeafletPoint(size.x * offset[0], size.y * offset[1])
    const riderPx = m.project([lat, lng], zoom)
    const centerPx = riderPx.subtract(target.subtract(containerCenter))
    return m.unproject(centerPx, zoom)
  }

  /* --- single camera transition controller (bearing + pitch on one RAF loop) --- */

  private cancelTransition(): void {
    if (this.transRaf) cancelAnimationFrame(this.transRaf)
    this.transRaf = 0
  }

  private runTransition(toBearing: number | null, toPitch: number | null, duration: number): void {
    if (this.transRaf) cancelAnimationFrame(this.transRaf)
    const fromBearing = this.bearing
    const fromPitch = this.pitch
    const targetBearing = toBearing !== null ? normalize(toBearing) : fromBearing
    const targetPitch = toPitch !== null ? clamp(toPitch, MIN_PITCH_DEG, MAX_PITCH_DEG) : fromPitch
    const dBearing = toBearing !== null ? shortestDelta(fromBearing, targetBearing) : 0
    const dPitch = targetPitch - fromPitch

    if (Math.abs(dBearing) < 0.4 && Math.abs(dPitch) < 0.01) {
      this.bearing = targetBearing
      this.pitch = targetPitch
      this.applyView(true)
      return
    }

    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / Math.max(1, duration))
      const eased = easeInOutCubic(t)
      if (toBearing !== null) this.bearing = normalize(fromBearing + dBearing * eased)
      if (toPitch !== null) this.pitch = fromPitch + dPitch * eased
      this.applyView(false)
      if (t < 1) {
        this.transRaf = requestAnimationFrame(step)
      } else {
        this.bearing = targetBearing
        this.pitch = targetPitch
        this.applyView(true)
        this.transRaf = 0
      }
    }
    this.transRaf = requestAnimationFrame(step)
  }

  /**
   * Applies the camera projection to the isolated wrapper. Bearing rotates the
   * map plane; pitch tilts it back around the rider anchor so the route recedes
   * into the screen (Google Maps-style perspective). Order: rotate in the map
   * plane first, tilt second, project last — the horizon stays horizontal and
   * the rider (the transform origin) stays fixed on screen.
   *
   * Tilt also counter-scales the plane (~1/cos plus margin, about the same
   * rider anchor): rotateX foreshortens the map and perspective pushes the far
   * edge further away, so without this the viewport edges — mostly the top —
   * would expose the backdrop behind the map. Top-down (pitch ~0) never
   * scales, keeping north-up at exact 1:1 zoom.
   */
  private applyView(fireEvent: boolean): void {
    const rot = normalize(this.bearing)
    const tilt = clamp(this.pitch, MIN_PITCH_DEG, MAX_PITCH_DEG)
    const hasView = rot >= 0.05 || tilt > 0.05
    const zoom =
      tilt > 0.05
        ? Math.min((1 / Math.cos((Math.min(tilt, 60) * Math.PI) / 180)) * TILT_SCALE_MARGIN, MAX_TILT_SCALE)
        : 1
    const scale = zoom > 1.001 ? ` scale(${zoom.toFixed(2)})` : ''
    const w = this.wrapper
    if (w) {
      w.style.transformOrigin = `${this.anchor[0] * 100}% ${this.anchor[1] * 100}%`
      w.style.willChange = 'transform'
      w.style.transform = hasView
        ? `perspective(${this.perspPx}px) rotateX(${tilt.toFixed(2)}deg) rotate(${rot.toFixed(2)}deg)${scale}`
        : ''
    } else if (this.map) {
      // Defensive fallback (no wrapper): compose with Leaflet's translate.
      const mapPane = this.map.getPane('mapPane') as unknown as HTMLElement | null
      if (mapPane) {
        const cur = mapPane.style.transform || ''
        const translate = cur.match(/translate3d\([^)]+\)/)?.[0] || cur.match(/translate\([^)]+\)/)?.[0] || ''
        const composed = `perspective(${this.perspPx}px) rotateX(${tilt.toFixed(2)}deg) rotate(${rot.toFixed(2)}deg)${scale}`
        mapPane.style.transform = translate && hasView ? `${translate} ${composed}` : translate || composed
        mapPane.style.transformOrigin = `${this.anchor[0] * 100}% ${this.anchor[1] * 100}%`
      }
    }
    if (fireEvent && this.map) {
      const anyMap = this.map as unknown as { fire?: (ev: string, data?: unknown) => void }
      anyMap.fire?.('rotate', { bearing: rot })
      anyMap.fire?.('pitch', { pitch: tilt })
    }
  }

  /** Heading 0=N clockwise -> map bearing clockwise (bearing = -heading). */
  headingToBearing(heading: number): number {
    return normalize(-heading)
  }

  bearingToHeading(bearing: number): number {
    return normalize(-bearing)
  }
}

export const mapCamera = new MapCameraController()