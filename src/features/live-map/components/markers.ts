import { divIcon } from 'leaflet'
import type { RiderPresence } from '../types'

const BIKE_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-3 11.5V14l-3-3 4-3 2 3h2"/></svg>'

const PRESENCE_RING: Record<RiderPresence, string> = {
  live: 'rgba(61,220,132,0.55)',
  delayed: 'rgba(255,177,77,0.55)',
  stale: 'rgba(255,107,44,0.55)',
  offline: 'rgba(148,148,158,0.45)',
}

export function buildRiderIcon(
  accent: string,
  isMe: boolean,
  selected: boolean,
  presence: RiderPresence,
  spread?: [number, number],
): L.DivIcon {
  /* Uniform size for every rider — presence and “me” differ via halo/border,
     never via physical footprint. */
  const size = 36
  const dot = size - 4
  const iconHeight = Math.round(dot * 0.5)
  const ringColor = selected ? '#ff6b2c' : PRESENCE_RING[presence]
  const borderColor = selected ? '#ff6b2c' : isMe ? 'rgba(61,220,132,0.95)' : 'rgba(255,255,255,0.9)'

  /* Visual-only fan for bundled riders (Leaflet position unchanged). */
  const translate = spread ? `transform:translate(${spread[0]}px,${spread[1]}px);` : ''

  const halo = isMe
    ? `<span style="position:absolute;inset:-4px;border-radius:50%;background:rgba(61,220,132,0.25);box-shadow:0 0 0 0 rgba(61,220,132,0.45);animation:rt-pulse 2.2s infinite;"></span>`
    : presence !== 'live'
      ? `<span style="position:absolute;inset:4px;border-radius:50%;background:${ringColor};opacity:0.3;"></span>`
      : ''

  const ring = selected
    ? `<span style="position:absolute;inset:-6px;border-radius:50%;border:2px solid #ff6b2c;box-shadow:0 0 0 3px rgba(255,107,44,0.22);"></span>`
    : ''

  const bike = BIKE_ICON.replace('width="15"', `width="${iconHeight}"`).replace('height="15"', `height="${iconHeight}"`)

  const html = `<div class="rt-rider-marker" style="position:relative;width:${size}px;height:${size}px;display:grid;place-items:center;${translate}">${halo}${ring}<div style="width:${dot}px;height:${dot}px;border-radius:50%;display:grid;place-items:center;border:2px solid ${borderColor};background:${accent};box-shadow:0 6px 14px -4px rgba(0,0,0,0.55);transition:transform .2s;">${bike}</div></div>`
  return divIcon({
    className: 'rt-pin-wrap',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

const FLAG_GLYPH =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0a0a0c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V3"/><path d="M5 3h12l-2.4 3.5L17 10H5"/></svg>'

const PLAY_GLYPH =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="#0a0a0c"><path d="M8 5.5v13a1 1 0 0 0 1.52.85l11-6.5a1 1 0 0 0 0-1.7l-11-6.5A1 1 0 0 0 8 5.5Z"/></svg>'

/**
 * Modern route point pin (start / destination): a glowing circular badge
 * with a dark glyph, a small tail pointing at the coordinate, and a label
 * chip. Colors follow the app palette (start = live green, end = ember).
 */
function buildPointPin(label: string, glyph: string, color: string, glow: string): L.DivIcon {
  const html = `
  <div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 10px 20px rgba(0,0,0,0.5));pointer-events:none;">
    <div style="padding:4px 10px;border-radius:999px;background:rgba(10,10,12,0.88);border:1px solid rgba(255,255,255,0.22);backdrop-filter:blur(8px);font-size:9px;font-weight:800;letter-spacing:.18em;color:#f4efe7;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${label}</div>
    <div style="position:relative;width:44px;height:44px;margin-top:5px;">
      <span style="position:absolute;inset:-6px;border-radius:50%;background:${glow};opacity:0.4;animation:rt-pulse 2.4s infinite;"></span>
      <div style="position:absolute;inset:0;display:grid;place-items:center;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.92);box-shadow:inset 0 2px 6px rgba(255,255,255,0.35),0 0 0 3px rgba(255,255,255,0.12);">${glyph}</div>
      <div style="position:absolute;left:50%;top:100%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid ${color};filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));"></div>
    </div>
  </div>`
  return divIcon({
    className: 'rt-poi-pin',
    html,
    iconSize: [60, 82],
    iconAnchor: [30, 80],
  })
}

/** Route origin pin (green). */
export function buildOriginPin(label: string): L.DivIcon {
  return buildPointPin(label, PLAY_GLYPH, '#3ddc84', 'rgba(61,220,132,0.55)')
}

/** Route destination pin (ember). */
export function buildDestinationPin(label: string): L.DivIcon {
  return buildPointPin(label, FLAG_GLYPH, '#ff6b2c', 'rgba(255,107,44,0.55)')
}

export function buildCityIcon(label: string, color: string): L.DivIcon {
  const html = `<div style="display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:999px;background:rgba(10,10,12,0.85);border:1px solid rgba(255,255,255,0.25);backdrop-filter:blur(6px);font-size:10px;font-weight:700;letter-spacing:.16em;color:#f4efe7;"><span style="width:6px;height:6px;border-radius:50%;background:${color};"></span>${label}</div>`
  return divIcon({
    className: 'rt-pin-wrap',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}
