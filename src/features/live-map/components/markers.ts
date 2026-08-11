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
): L.DivIcon {
  const size = isMe ? 38 : 32
  const dot = size * 0.88
  const ringColor = selected ? '#ff6b2c' : PRESENCE_RING[presence]
  const html = `<div class="rt-rider-marker" style="position:relative;width:${size}px;height:${size}px;display:grid;place-items:center;">${
    isMe
      ? `<span style="position:absolute;inset:-3px;border-radius:50%;background:rgba(61,220,132,0.28);box-shadow:0 0 0 0 rgba(61,220,132,0.5);animation:rt-pulse 2.2s infinite;"></span>`
      : presence !== 'live'
        ? `<span style="position:absolute;inset:0;border-radius:50%;background:${ringColor};opacity:0.25;"></span>`
        : ''
  }<div style="width:${dot}px;height:${dot}px;border-radius:50%;display:grid;place-items:center;border:2px solid ${selected ? '#ff6b2c' : 'rgba(255,255,255,0.92)'};background:${accent};box-shadow:0 6px 16px -4px rgba(0,0,0,0.55);transition:transform .2s;">${BIKE_ICON}</div></div>`
  return divIcon({
    className: 'rt-pin-wrap',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
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
