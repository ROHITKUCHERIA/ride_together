import TripError from './components/TripError'
import TripRoom from './components/TripRoom'
import { trip } from './data/mockData'

function currentSlug(): string | null {
  const match = window.location.pathname.match(/^\/trip\/([^/]+)\/?$/)
  return match ? match[1] : null
}

export default function App() {
  const slug = currentSlug()

  if (slug && slug !== trip.slug) {
    return <TripError onRetry={() => window.location.assign(`/trip/${trip.slug}`)} />
  }

  return <TripRoom />
}
