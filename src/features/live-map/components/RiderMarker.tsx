import { useEffect, useRef } from 'react'
import { Marker } from 'react-leaflet'
import type { Marker as LeafletMarker } from 'leaflet'
import type { RiderLocation } from '../types'
import { buildRiderIcon } from './markers'
import { presenceFor } from '../hooks/useLiveMap'
interface RiderMarkerProps {
  rider: RiderLocation
  selected: boolean
  onSelect: (id: string) => void
}

/**
 * Marker that eases toward the target position every frame instead of
 * teleporting. The Leaflet marker instance is created once and only
 * repositioned — never recreated per update.
 */
export default function RiderMarker({ rider, selected, onSelect }: RiderMarkerProps) {
  const markerRef = useRef<LeafletMarker | null>(null)
  const target = useRef({ lat: rider.latitude, lng: rider.longitude })
  const current = useRef({ lat: rider.latitude, lng: rider.longitude })

  target.current = { lat: rider.latitude, lng: rider.longitude }

  useEffect(() => {
    const icon = buildRiderIcon(rider.accent, rider.isMe ?? false, selected, presenceFor(rider.timestamp))
    if (markerRef.current) markerRef.current.setIcon(icon)
  }, [rider.accent, rider.isMe, rider.timestamp, selected])

  useEffect(() => {
    let raf = 0
    let disposed = false
    const tick = () => {
      if (disposed) return
      const t = target.current
      const c = current.current
      const dLat = t.lat - c.lat
      const dLng = t.lng - c.lng
      if (Math.abs(dLat) > 1e-7 || Math.abs(dLng) > 1e-7) {
        current.current = { lat: c.lat + dLat * 0.2, lng: c.lng + dLng * 0.2 }
        markerRef.current?.setLatLng([current.current.lat, current.current.lng])
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <Marker
      ref={markerRef}
      position={[rider.latitude, rider.longitude]}
      icon={buildRiderIcon(rider.accent, rider.isMe ?? false, selected, presenceFor(rider.timestamp))}
      zIndexOffset={selected ? 1000 : rider.isMe ? 500 : 0}
      eventHandlers={{ click: () => onSelect(rider.userId) }}
    />
  )
}
