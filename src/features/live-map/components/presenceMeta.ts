import type { RiderPresence } from '../types'

export const PRESENCE_META: Record<RiderPresence, { label: string; dot: string; text: string }> = {
  live: { label: 'Live', dot: 'bg-live', text: 'text-live' },
  delayed: { label: 'Delayed', dot: 'bg-sunset', text: 'text-sunset' },
  stale: { label: 'Stale', dot: 'bg-ember', text: 'text-ember' },
  offline: { label: 'Offline', dot: 'bg-mist/50', text: 'text-mist/50' },
}
