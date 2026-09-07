import { Compass, Eye, EyeOff, Focus, LocateFixed, Map as MapIcon, Minus, Navigation, Plus, Users } from 'lucide-react'
import type { MapViewMode } from '../types'
import type { MapProvider } from '../providers/mapProviders'
import { useIsMobile } from '../../../hooks/useMediaQuery'

export type MapBearingMode = 'north' | 'compass'

interface MapControlsProps {
  viewMode: MapViewMode
  following: boolean
  bearingMode: MapBearingMode
  /** Live map bearing (0 = north up) for compass visual */
  bearing?: number
  tileProviderId: string
  providers: MapProvider[]
  /** Current map zoom — drives the zoom button disabled states. */
  zoom: number
  minZoom: number
  maxZoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  /** Clean-map mode — hides overlay cards; the toggle itself always stays. */
  cardsHidden: boolean
  onToggleCards: () => void
  onGoToMe: () => void
  onToggleFollow: () => void
  onFitGroup: () => void
  onNorth: () => void
  onCompass: () => void
  onCycleProvider: () => void
}

export default function MapControls({
  viewMode,
  following,
  bearingMode,
  bearing = 0,
  tileProviderId,
  providers,
  zoom,
  minZoom,
  maxZoom,
  onZoomIn,
  onZoomOut,
  cardsHidden,
  onToggleCards,
  onGoToMe,
  onToggleFollow,
  onFitGroup,
  onNorth,
  onCompass,
  onCycleProvider,
}: MapControlsProps) {
  const isMobile = useIsMobile()
  const provider = providers.find((p) => p.id === tileProviderId) ?? providers[0]

  const Button = ({
    label,
    active,
    disabled,
    onClick,
    icon: Icon,
    delay = 0,
    iconRotate,
  }: {
    label: string
    active?: boolean
    disabled?: boolean
    onClick: () => void
    icon: typeof Focus
    delay?: number
    iconRotate?: number
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      style={{ animationDelay: `${delay}ms` }}
      className={`flex size-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-ember disabled:pointer-events-none disabled:opacity-35 ${
        active
          ? 'border-live/50 bg-live/15 text-live'
          : 'border-white/12 bg-night/80 text-bone/85 hover:bg-night/90'
      }`}
    >
      <span style={iconRotate !== undefined ? { transform: `rotate(${iconRotate}deg)`, transition: 'transform 0.3s ease-out' } : undefined}>
        <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
      </span>
    </button>
  )

  return (
    <div
      className={`pointer-events-auto absolute z-[5] flex flex-col gap-3 ${
        isMobile
          ? 'bottom-[max(env(safe-area-inset-bottom,0px),88px)] right-[max(env(safe-area-inset-right,0px),0.75rem)]'
          : 'right-[max(env(safe-area-inset-right,0px),1.25rem)] top-1/2 -translate-y-1/2'
      }`}
    >
      <Button label={cardsHidden ? 'Show cards' : 'Hide cards — clean map view'} active={cardsHidden} onClick={onToggleCards} icon={cardsHidden ? EyeOff : Eye} />
      <Button label="Zoom in — closer street view" onClick={onZoomIn} icon={Plus} delay={20} disabled={zoom >= maxZoom - 1e-6} />
      <Button label="Zoom out — wider area view" onClick={onZoomOut} icon={Minus} delay={40} disabled={zoom <= minZoom + 1e-6} />
      <Button label="Recenter on me" onClick={onGoToMe} icon={LocateFixed} delay={60} />
      <Button label={following ? 'Following — tap to free' : 'Follow / Recenter'} active={following} onClick={onToggleFollow} icon={Focus} delay={80} />
      <Button label="Centric — fit group" active={viewMode === 'group'} onClick={onFitGroup} icon={Users} delay={100} />
      <Button label="North up" active={bearingMode === 'north'} onClick={onNorth} icon={Navigation} delay={120} iconRotate={bearing} />
      <Button label="Compass — heading up" active={bearingMode === 'compass'} onClick={onCompass} icon={Compass} delay={140} iconRotate={bearing} />
      <Button label={`Map style: ${provider?.label ?? ''}`} onClick={onCycleProvider} icon={MapIcon} delay={160} />
    </div>
  )
}
