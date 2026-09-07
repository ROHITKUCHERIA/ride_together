import { useMapEvents } from 'react-leaflet'

interface DestinationClickCatcherProps {
  enabled: boolean
  onPick: (lat: number, lng: number) => void
}

/** Bridges Leaflet map clicks to navigation destination selection. Renders
 *  nothing; mounted by the caller only when dest-picking is allowed. */
export default function DestinationClickCatcher({ enabled, onPick }: DestinationClickCatcherProps) {
  useMapEvents({
    click(e) {
      if (!enabled) return
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}