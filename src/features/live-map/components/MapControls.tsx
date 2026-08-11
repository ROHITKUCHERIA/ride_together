import { Focus, LocateFixed, Map as MapIcon, Users } from 'lucide-react'
import type { MapViewMode } from '../types'
import type { MapProvider } from '../providers/mapProviders'
import { useIsMobile } from '../../../hooks/useMediaQuery'

interface MapControlsProps {
  viewMode: MapViewMode
  following: boolean
  tileProviderId: string
  providers: MapProvider[]
  onGoToMe: () => void
  onToggleFollow: () => void
  onFitGroup: () => void
  onCycleProvider: () => void
}

export default function MapControls({
  viewMode,
  following,
  tileProviderId,
  providers,
  onGoToMe,
  onToggleFollow,
  onFitGroup,
  onCycleProvider,
}: MapControlsProps) {
  const isMobile = useIsMobile()
  const provider = providers.find((p) => p.id === tileProviderId) ?? providers[0]

  const Button = ({ label, active, onClick, icon: Icon, delay = 0 }: { label: string; active?: boolean; onClick: () => void; icon: typeof Focus; delay?: number }) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      style={{ animationDelay: `${delay}ms` }}
      className={`flex size-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-ember ${
        active
          ? 'border-live/50 bg-live/15 text-live'
          : 'border-white/12 bg-night/80 text-bone/85 hover:bg-night/90'
      }`}
    >
      <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
    </button>
  )

  return (
    <div
      className={`pointer-events-auto absolute z-[5] flex flex-col gap-2.5 ${
        isMobile
          ? 'bottom-[max(env(safe-area-inset-bottom,0px),88px)] right-3'
          : 'right-5 top-1/2 -translate-y-1/2'
      }`}
    >
      <Button label="My Location" onClick={onGoToMe} icon={LocateFixed} />
      <Button label={following ? 'Following your location' : 'Follow me'} active={following} onClick={onToggleFollow} icon={Focus} delay={40} />
      <Button label="Fit group" active={viewMode === 'group'} onClick={onFitGroup} icon={Users} delay={80} />
      <Button label={`Map style: ${provider?.label ?? ''}`} onClick={onCycleProvider} icon={MapIcon} delay={120} />
    </div>
  )
}
