import { Polyline, Marker } from 'react-leaflet'
import { destinationCoord, originCoord, tripRoute } from '../../../data/mockData'
import { buildCityIcon } from './markers'

export default function RouteLayer() {
  return (
    <>
      <Polyline
        positions={tripRoute}
        pathOptions={{ color: '#ff6b2c', weight: 3, opacity: 0.85, dashArray: '2 10', lineCap: 'round' }}
      />
      <Marker position={originCoord} icon={buildCityIcon('HYD', '#3ddc84')} interactive={false} />
      <Marker position={destinationCoord} icon={buildCityIcon('GOA', '#ff6b2c')} interactive={false} />
    </>
  )
}
