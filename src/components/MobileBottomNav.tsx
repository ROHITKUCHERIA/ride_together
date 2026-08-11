import { ListMusic, MapPin, Route, Users } from 'lucide-react'

interface MobileBottomNavProps {
  onOpenMap: () => void
  onOpenMusic: () => void
  onOpenRiders: () => void
  onOpenTripInfo: () => void
}

const ITEMS = [
  { id: 'map', label: 'Map', icon: MapPin, action: 'onOpenMap' },
  { id: 'music', label: 'Music', icon: ListMusic, action: 'onOpenMusic' },
  { id: 'riders', label: 'Riders', icon: Users, action: 'onOpenRiders' },
  { id: 'trip', label: 'Trip', icon: Route, action: 'onOpenTripInfo' },
] as const

export default function MobileBottomNav({ onOpenMap, onOpenMusic, onOpenRiders, onOpenTripInfo }: MobileBottomNavProps) {
  const handlers: Record<(typeof ITEMS)[number]['action'], () => void> = {
    onOpenMap,
    onOpenMusic,
    onOpenRiders,
    onOpenTripInfo,
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-night/80 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Bottom navigation"
    >
      <div className="grid grid-cols-4">
        {ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={handlers[item.action]}
              className="flex flex-col items-center gap-1 py-2.5 text-mist/70 transition active:scale-95 focus-visible:outline-2 focus-visible:outline-ember"
              aria-label={`Open ${item.label}`}
            >
              <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
              <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
