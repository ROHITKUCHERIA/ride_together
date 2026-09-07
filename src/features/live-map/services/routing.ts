/**
 * Road routing via OSRM (Open Source Routing Machine) — free, open source, and
 * keyless. The public router is used by default; point VITE_OSRM_URL at any
 * OSRM server (self-hosted or commercial) to replace it.
 */

const OSRM_URL = (import.meta.env.VITE_OSRM_URL as string | undefined) ?? 'https://router.project-osrm.org'

interface OSRMResponse {
  code: string
  routes?: Array<{
    distance?: number
    duration?: number
    geometry?: { coordinates?: Array<[number, number]> }
    legs?: Array<{ steps?: OsmStep[] }>
  }>
}

interface OsmStep {
  distance?: number
  duration?: number
  name?: string
  ref?: string
  maneuver?: {
    type?: string
    modifier?: string
    location?: [number, number]
    instruction?: string
    exit?: number
  }
}

const cache = new Map<string, Promise<RoadRoute | null>>()

export interface RoadRoute {
  points: [number, number][]
  distanceMeters?: number
  durationSeconds?: number
  /** Normalized turn-by-turn steps (present when `steps=true`). */
  instructions?: RoadInstruction[]
}

export interface RoadInstruction {
  id: string
  type: string
  modifier?: string
  text: string
  distanceMeters: number
  durationSeconds: number
  latitude: number
  longitude: number
  roadName?: string
  exitNumber?: number
}

/**
 * Resolves the driving road between two coordinates as a [lat, lng] polyline.
 * Returns null when the router is unreachable so callers can fall back to a
 * straight line. Results are cached per origin/destination pair.
 */
export function fetchRoadRoute(
  origin: [number, number],
  destination: [number, number],
): Promise<RoadRoute | null> {
  const key = `v1|${origin[0].toFixed(5)},${origin[1].toFixed(5)}|${destination[0].toFixed(5)},${destination[1].toFixed(5)}`
  const existing = cache.get(key)
  if (existing) return existing

  const pending = (async () => {
    const coords = `${origin[1]},${origin[0]};${destination[1]},${destination[0]}`
    try {
      const res = await fetch(
        `${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`,
      )
      if (!res.ok) return null
      const json = (await res.json()) as OSRMResponse
      const route = json.routes?.[0]
      const geometry = route?.geometry?.coordinates
      if (json.code !== 'Ok' || !geometry || geometry.length < 2) return null
      return {
        points: geometry.map(([lng, lat]) => [lat, lng] as [number, number]),
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        instructions: (route?.legs?.flatMap((leg) => leg.steps ?? []) ?? []).map(parseStep),
      } satisfies RoadRoute
    } catch {
      return null
    }
  })()
  cache.set(key, pending)
  pending.catch(() => cache.delete(key))
  return pending
}

function parseStep(step: OsmStep | undefined, index: number): RoadInstruction {
  const maneuver = step?.maneuver ?? {}
  const location = maneuver.location
  const hasLocation =
    Array.isArray(location) && location.length >= 2 && Number.isFinite(location[0]) && Number.isFinite(location[1])
  const roadName = step?.name?.trim() || step?.ref?.trim() || undefined
  const exit =
    typeof maneuver.exit === 'number' && Number.isInteger(maneuver.exit) && maneuver.exit > 0
      ? maneuver.exit
      : undefined
  if (!hasLocation) {
    return {
      id: `step-${index}`,
      type: normalizeType(maneuver.type),
      modifier: normalizeModifier(maneuver.type, maneuver.modifier),
      text: maneuver.instruction?.trim() || 'Continue',
      distanceMeters: step?.distance ?? 0,
      durationSeconds: step?.duration ?? 0,
      latitude: 0,
      longitude: 0,
      roadName,
      ...(exit !== undefined ? { exitNumber: exit } : {}),
    }
  }
  return {
    id: `step-${index}`,
    type: normalizeType(maneuver.type),
    modifier: normalizeModifier(maneuver.type, maneuver.modifier),
    text: maneuver.instruction?.trim() || 'Continue',
    distanceMeters: step?.distance ?? 0,
    durationSeconds: step?.duration ?? 0,
    latitude: location[1],
    longitude: location[0],
    roadName,
    ...(exit !== undefined ? { exitNumber: exit } : {}),
  }
}

function normalizeType(type: string | undefined): string {
  const t = (type ?? '').toLowerCase()
  if (t === 'depart' || t === 'start') return 'depart'
  if (t === 'arrive' || t === 'end of route') return 'arrive'
  if (t === 'turn' || t === 'end of road') return 'turn'
  if (t === 'continue' || t === 'notification' || t === 'new name') return 'continue'
  if (t === 'merge') return 'merge'
  if (t === 'fork') return 'fork'
  if (['roundabout', 'rotary', 'roundabout turn', 'exit roundabout', 'exit rotary'].includes(t)) return 'roundabout'
  if (t === 'uturn') return 'uturn'
  return 'unknown'
}

function normalizeModifier(type: string | undefined, modifier: string | undefined): string | undefined {
  if (!modifier) return undefined
  const t = (type ?? '').toLowerCase()
  const turnLike = ['turn', 'fork', 'merge', 'continue', 'depart'].includes(t)
  if (!turnLike) return undefined
  const map: Record<string, string> = {
    left: 'left',
    right: 'right',
    'slight left': 'slight-left',
    'slight right': 'slight-right',
    'sharp left': 'sharp-left',
    'sharp right': 'sharp-right',
    straight: 'straight',
  }
  return map[modifier.toLowerCase()]
}

/** Bearing (degrees) between two consecutive polyline points. */
export function bearingBetween(a: [number, number], b: [number, number]): number {
  const dLng = ((b[1] - a[1]) * Math.PI) / 180
  const aLat = (a[0] * Math.PI) / 180
  const bLat = (b[0] * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos(bLat)
  const x = Math.cos(aLat) * Math.sin(bLat) - Math.sin(aLat) * Math.cos(bLat) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/** Picks evenly spaced intermediate points for placing direction arrows. */
export function arrowPoints(points: [number, number][], count = 6): Array<{ lat: number; lng: number; angle: number }> {
  if (points.length < 2) return []
  const arrows: Array<{ lat: number; lng: number; angle: number }> = []
  const step = Math.max(1, Math.floor((points.length - 1) / (count + 1)))
  for (let i = step; i < points.length - step / 2; i += step) {
    const a = points[i - 1]
    const b = points[i + 1] ?? points[points.length - 1]
    arrows.push({ lat: points[i][0], lng: points[i][1], angle: bearingBetween(a, b) })
  }
  return arrows
}