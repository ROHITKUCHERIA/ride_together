import { Bike } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Avatar from '../components/Avatar'

interface AppHeaderProps {
  actions?: React.ReactNode
}

export default function AppHeader({ actions }: AppHeaderProps) {
  const { user } = useAuth()
  const initials = user?.name ?? '?'

  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-night/85 backdrop-blur-xl">
      <div className="mx-auto flex min-h-14 w-full max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link to="/app" className="flex items-center gap-2.5 rounded-full px-1.5 py-1 focus-visible:outline-2 focus-visible:outline-ember" aria-label="RideTogether home">
          <span className="grid size-8 place-items-center rounded-full border border-white/15 bg-night/50">
            <Bike size={16} className="text-ember" strokeWidth={2} />
          </span>
          <span className="font-display text-sm font-bold tracking-[0.22em] text-bone">
            RIDE<span className="text-ember">TOGETHER</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {actions}
          <Link
            to="/app/profile"
            aria-label="Your profile"
            className="rounded-full transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-ember"
          >
            <Avatar name={initials} accent="#ff6b2c" size={36} />
          </Link>
        </div>
      </div>
    </header>
  )
}