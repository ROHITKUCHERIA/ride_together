import { useEffect, useMemo, useState } from 'react'
import { Marker, Polyline } from 'react-leaflet'
import { divIcon } from 'leaflet'
import { tripRoute } from '../../../data/mockData'
import { arrowPoints, fetchRoadRoute, type RoadRoute } from '../services/routing'
import { buildCityIcon } from './markers'

interface RouteLayerProps {
  route?: [number, number][] | null
}

const ARROW_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13"/><path d="M13 6l6 6-6 6"/></svg>'

function arrowIcon(angle: number): L.DivIcon {
  return divIcon({
    className: 'rt-route-arrow',
    html: `<div style="transform:rotate(${angle}deg);width:18px;height:18px;display:grid;place-items:center;opacity:.9;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.65));">${ARROW_SVG}</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

export default function RouteLayer({ route }: RouteLayerProps) {
  const isDemo = route === undefined
  const hasCoords = !!route && route.length >= 2
  const [road, setRoad] = useState<RoadRoute | null>(null)

  useEffect(() => {
    if (!hasCoords || !route) return
    let cancelled = false
    void fetchRoadRoute(route[0], route[route.length - 1]).then((r) => {
      if (!cancelled) setRoad(r)
    })
    return () => {
      cancelled = true
    }
  }, [hasCoords, route])

  const points = useMemo<[number, number][]>(() => {
    if (road) return road.points
    if (hasCoords && route) return route
    return tripRoute
  }, [road, hasCoords, route])

  const arrows = useMemo(() => arrowPoints(points, 6), [points])

  // A real trip without coordinates has no route line to draw.
  if (!isDemo && !hasCoords) return null

  const start = hasCoords ? route![0] : tripRoute[0]
  const end = hasCoords ? route![route!.length - 1] : tripRoute[tripRoute.length - 1]

  return (
    <>
      <Polyline
        positions={points}
        interactive={false}
        pathOptions={{
          color: '#ff6b2c',
          weight: 4,
          opacity: 0.9,
          dashArray: '2 14',
          lineCap: 'round',
          className: 'rt-route-flow',
        }}
      />
      {arrows.map((a, i) => (
        <Marker key={i} position={[a.lat, a.lng]} icon={arrowIcon(a.angle)} interactive={false} />
      ))}
      <Marker position={start} icon={buildCityIcon(hasCoords ? 'START' : 'HYD', '#3ddc84')} interactive={false} />
      <Marker position={end} icon={buildCityIcon(hasCoords ? 'DEST' : 'GOA', '#ff6b2c')} interactive={false} />
    </>
  )
}