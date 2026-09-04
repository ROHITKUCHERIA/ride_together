import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { divIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Check, LocateFixed, X } from 'lucide-react'
import Button from '../../components/ui/Button'

interface MapCoordPickerProps {
  title: string
  initial?: [number, number] | null
  onConfirm: (lat: number, lng: number) => void
  onClose: () => void
}

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629]
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors &copy; CARTO'

const PIN_ICON = divIcon({
  className: 'rt-coord-pin',
  html: `<div style="width:34px;height:34px;border-radius:50%;display:grid;place-items:center;border:2px solid #fff;background:#4a9eff;box-shadow:0 0 0 4px rgba(74,158,255,0.25),0 8px 18px -4px rgba(0,0,0,0.6);font-size:15px;color:#fff;">📍</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
})

function ClickCatcher({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function CenterControl({ centerKey, center }: { centerKey: number; center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    if (centerKey <= 0) return
    map.setView(center, Math.max(map.getZoom(), 13))
  }, [centerKey, center, map])
  return null
}

export default function MapCoordPicker({ title, initial, onConfirm, onClose }: MapCoordPickerProps) {
  const [pos, setPos] = useState<[number, number]>(initial ?? DEFAULT_CENTER)
  const [flyKey, setFlyKey] = useState(0)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)

  useEffect(() => {
    if (!initial) return
    setPos(initial)
    setFlyKey((k) => k + 1)
  }, [initial])

  const handlePick = useCallback((lat: number, lng: number) => {
    setPos([lat, lng])
    setLocError(null)
  }, [])

  const useMyLocation = () => {
    setLocError(null)
    if (!('geolocation' in navigator)) {
      setLocError('Geolocation is not supported on this device.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos([p.coords.latitude, p.coords.longitude])
        setFlyKey((k) => k + 1)
        setLocating(false)
      },
      (err) => {
        setLocError(err.code === 1 ? 'Location permission was denied.' : 'Could not get your location.')
        setLocating(false)
      },
      { timeout: 12000, maximumAge: 0, enableHighAccuracy: false },
    )
  }

  const content = (
    <div className="fixed inset-0 z-[95] flex flex-col bg-night text-bone">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-charcoal/85 px-4 py-3 backdrop-blur-xl">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-mist/60">Pick location</p>
          <h2 className="truncate font-display text-lg font-bold text-bone">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close map"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-mist transition hover:scale-105 hover:bg-white/10 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
        >
          <X size={16} />
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <MapContainer
          center={pos}
          zoom={initial ? 13 : 4}
          scrollWheelZoom
          zoomControl
          attributionControl
          className="absolute inset-0 z-0"
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
          <ClickCatcher onPick={handlePick} />
          <Marker
            position={pos}
            draggable
            icon={PIN_ICON}
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target as { getLatLng: () => { lat: number; lng: number } }
                const ll = marker.getLatLng()
                handlePick(ll.lat, ll.lng)
              },
            }}
          />
          <CenterControl centerKey={flyKey} center={pos} />
        </MapContainer>

        {locError ? (
          <p className="pointer-events-none absolute left-3 right-3 top-3 z-[5] rounded-xl border border-road/35 bg-night/85 px-3.5 py-2 text-xs text-road backdrop-blur-xl">
            {locError}
          </p>
        ) : null}
      </div>

      <footer className="border-t border-white/10 bg-charcoal/90 px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold text-bone">
              {pos[0].toFixed(6)}, {pos[1].toFixed(6)}
            </p>
            <p className="text-[10px] text-mist/60">Click the map or drag the pin</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" loading={locating} disabled={locating} onClick={useMyLocation}>
              <LocateFixed size={14} aria-hidden="true" />
              My location
            </Button>
            <Button size="sm" onClick={() => onConfirm(pos[0], pos[1])}>
              <Check size={14} aria-hidden="true" />
              Use this location
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )

  return createPortal(content, document.body)
}