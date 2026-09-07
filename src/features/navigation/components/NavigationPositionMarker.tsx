import { useEffect, useRef } from 'react'
import { Marker } from 'react-leaflet'
import { divIcon, type Marker as LeafletMarker } from 'leaflet'
import { VisualPositionSmoother } from '../utils/smoothPosition'
import type { GeoPoint } from '../types'

function buildNavIcon(heading: number | null): L.DivIcon {
  const arrow = heading !== null
  const wedge = arrow
    ? `<div style="position:absolute;top:-1px;left:50%;transform:translateX(-50%) rotate(${heading}deg);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid #ffffff;"></div>`
    : ''
  const html = `
    <div style="position:relative;width:38px;height:38px;display:grid;place-items:center;">
      <span style="position:absolute;inset:-2px;border-radius:50%;background:rgba(74,158,255,0.30);animation:rt-pulse 2.2s infinite;"></span>
      <div style="position:absolute;inset:5px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(180deg,#5aa8ff,#3b82f6);border:2px solid rgba(255,255,255,0.95);box-shadow:0 6px 16px -3px rgba(59,130,246,0.75);z-index:1;">${wedge}</div>
    </div>`
  return divIcon({
    className: 'rt-pin-wrap',
    html,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  })
}

/**
 * The rider's navigation position marker — eases toward the throttled GPS fix
 * every frame (no teleporting), with a heading wedge when available. It layers
 * above the group "me" rider marker; it never removes or replaces it. The raw
 * GPS value used for backend/group tracking stays untouched — only this visual
 * position is interpolated.
 */
export default function NavigationPositionMarker({
  position,
  heading,
}: {
  position: GeoPoint | null
  heading: number | null
}) {
  const markerRef = useRef<LeafletMarker | null>(null)
  const smootherRef = useRef<VisualPositionSmoother | null>(null)
  if (!smootherRef.current) smootherRef.current = new VisualPositionSmoother({ factor: 0.3 })

  useEffect(() => {
    let raf = 0
    let disposed = false
    let lastHeading = heading
    const tick = () => {
      if (disposed) return
      raf = requestAnimationFrame(tick)
      const smoother = smootherRef.current
      const marker = markerRef.current
      if (!smoother || !marker || !position) return

      if (heading !== lastHeading) {
        lastHeading = heading
        marker.setIcon(buildNavIcon(heading))
      }

      const r = smoother.next({
        latitude: position.latitude,
        longitude: position.longitude,
        heading,
      })
      marker.setLatLng([r.latitude, r.longitude])
    }
    raf = requestAnimationFrame(tick)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
    }
  }, [position, heading])

  if (!position) return null

  return (
    <Marker
      ref={markerRef}
      position={[position.latitude, position.longitude]}
      icon={buildNavIcon(heading)}
      zIndexOffset={1000}
      interactive={false}
    />
  )
}