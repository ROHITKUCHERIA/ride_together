import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, MapPin, Navigation, Radio } from 'lucide-react'
import type { Map as LeafletMap } from 'leaflet'
import Avatar from './Avatar'
import GpsStatus from './GpsStatus'
import { destinationCoord, originCoord, tripRoute } from '../data/mockData'
import type { ConnectionState, GpsState, Rider } from '../types'

interface LiveMapProps {
  open: boolean
  onClose: () => void
  riders: Rider[]
  connection: ConnectionState
  gps: GpsState
  onEnableGps: () => void
}

const BIKE_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-3 11.5V14l-3-3 4-3 2 3h2"/></svg>'

export default function LiveMap({ open, onClose, riders, connection, gps, onEnableGps }: LiveMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const ridersRef = useRef(riders)
  ridersRef.current = riders

  const [selectedId, setSelectedId] = useState<string>(() => riders.find((r) => r.isMe)?.id ?? riders[0]?.id ?? '')

  useEffect(() => {
    if (!open) return
    let disposed = false
    let map: LeafletMap | null = null
    const el = mapRef.current
    if (!el) return

    const init = async () => {
      const L = await import('leaflet')
      await import('leaflet/dist/leaflet.css')
      if (disposed) return
      if (!mapRef.current) return

      const m = L.map(mapRef.current, { zoomControl: false }).setView([16.6, 74.5], 8)
      map = m
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(m)
      L.control.zoom({ position: 'topright' }).addTo(m)

      L.polyline(tripRoute, {
        color: '#ff6b2c',
        weight: 3,
        opacity: 0.85,
        dashArray: '2 10',
        lineCap: 'round',
      }).addTo(map)

      const cityIcon = (label: string, color: string) =>
        L.divIcon({
          className: 'rt-pin-wrap',
          html: `<div style="display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:999px;background:rgba(10,10,12,.85);border:1px solid rgba(255,255,255,.25);backdrop-filter:blur(6px);font-size:10px;font-weight:700;letter-spacing:.16em;color:#f4efe7;"><span style="width:6px;height:6px;border-radius:50%;background:${color};"></span>${label}</div>`,
        })

      L.marker(originCoord, { icon: cityIcon('HYD', '#3ddc84') }).addTo(m)
      L.marker(destinationCoord, { icon: cityIcon('GOA', '#ff6b2c') }).addTo(m)

      ridersRef.current.forEach((r) => {
        const icon = L.divIcon({
          className: 'rt-pin-wrap',
          html: `<div style="position:relative;width:34px;height:34px;display:grid;place-items:center;">${
            r.isMe
              ? '<span style="position:absolute;inset:0;border-radius:50%;background:rgba(61,220,132,.28);box-shadow:0 0 0 0 rgba(61,220,132,.5);animation:rt-pulse 2.2s infinite;"></span>'
              : ''
          }<div style="width:30px;height:30px;border-radius:50%;display:grid;place-items:center;border:2px solid rgba(255,255,255,.92);background:${r.accent};box-shadow:0 6px 16px -4px rgba(0,0,0,.55);transition:transform .2s;">${BIKE_ICON}</div></div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        })
        const marker = L.marker([r.lat, r.lng], { icon }).addTo(m)
        marker.on('click', () => setSelectedId(r.id))
      })

      const bounds = L.latLngBounds([
        ...tripRoute,
        ...ridersRef.current.map((r) => [r.lat, r.lng] as [number, number]),
      ])
      m.fitBounds(bounds, { padding: [60, 60] })
    }

    void init()
    return () => {
      disposed = true
      if (map) {
        map.remove()
        map = null
      }
    }
  }, [open])

  const selected = riders.find((r) => r.id === selectedId) ?? riders[0]

  return (
    <motion.div
      className="fixed inset-0 z-[70] bg-night"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      role="dialog"
      aria-modal="true"
      aria-label="Live map"
    >
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] flex items-center justify-between p-4">
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-night/70 px-4 py-2 text-xs font-medium text-bone backdrop-blur-xl transition hover:scale-[1.03] hover:bg-night/85 focus-visible:outline-2 focus-visible:outline-ember"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to Trip
        </button>
        <div className="pointer-events-auto hidden items-center gap-2 rounded-full border border-white/12 bg-night/70 px-4 py-2 backdrop-blur-xl sm:flex">
          <Radio size={13} className={connection === 'reconnecting' ? 'animate-pulse text-sunset' : 'text-live'} aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone/85">
            {connection === 'reconnecting' ? 'Reconnecting…' : 'Live Map'}
          </span>
        </div>
        <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-night/70 px-3.5 py-2 text-[11px] font-medium text-bone/85 backdrop-blur-xl">
          <MapPin size={12} className="text-ember" aria-hidden="true" />
          {riders.filter((r) => r.status !== 'offline').length}/{riders.length} riding
        </span>
      </div>

      <GpsStatus state={gps} onEnable={onEnableGps} />

      {/* selected rider card */}
      <div className="pointer-events-none absolute inset-x-0 z-[5] flex justify-center px-3" style={{ bottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>
        <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/12 bg-[rgba(18,18,21,0.88)] p-4 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <Avatar name={selected.name} accent={selected.accent} size={46} status={selected.status} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-display text-base font-bold text-bone">
                {selected.name}
                {selected.isMe ? <span className="rounded-full bg-live/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-live">You</span> : null}
              </p>
              <p className="text-[11px] text-mist/70">
                {selected.status === 'offline'
                  ? 'Offline'
                  : selected.status === 'weak'
                    ? 'Weak connection'
                    : 'Online'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="flex items-center justify-end gap-1 font-display text-lg font-bold text-bone">
                {selected.speed ?? 0}
                <span className="text-[10px] font-medium text-mist/60">km/h</span>
              </p>
              <p className="flex items-center justify-end gap-1 text-[10px] text-mist/60">
                <Navigation size={10} aria-hidden="true" />
                {selected.distanceKm === 0 ? 'You' : `${selected.distanceKm?.toFixed(1)} km from you`}
              </p>
            </div>
          </div>
          <p className="mt-3 border-t border-white/8 pt-2.5 text-[10px] uppercase tracking-[0.18em] text-mist/50">
            Last updated · {selected.lastUpdate}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
