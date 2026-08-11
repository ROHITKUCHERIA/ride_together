import { ListMusic, MapPin, Route, Users } from 'lucide-react'

interface MobileBottomNavProps {
  active?: string
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

export default function MobileBottomNav({ active, onOpenMap, onOpenMusic, onOpenRiders, onOpenTripInfo }: MobileBottomNavProps) {
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
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={handlers[item.action]}
              className={`flex flex-col items-center gap-1 py-2.5 transition active:scale-95 focus-visible:outline-2 focus-visible:outline-ember ${
                isActive ? 'text-ember' : 'text-mist/70'
              }`}
              aria-label={`Open ${item.label}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={`relative ${isActive ? '' : ''}`}>
                <Icon size={19} strokeWidth={isActive ? 2.4 : 1.9} aria-hidden="true" />
                {isActive ? (
                  <span className="absolute -bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-ember" aria-hidden="true" />
                ) : null}
              </span>
              <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
