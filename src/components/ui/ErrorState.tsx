import { RefreshCw, TriangleAlert } from 'lucide-react'
import Button from './Button'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
}

export default function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-road/25 bg-road/10 text-road">
        <TriangleAlert size={22} aria-hidden="true" />
      </div>
      <h3 className="font-display text-lg font-bold text-bone">{title ?? 'Something went wrong'}</h3>
      <p className="mt-2 max-w-xs text-sm text-mist/70">{message}</p>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry} className="mt-6">
          <RefreshCw size={14} aria-hidden="true" />
          Try again
        </Button>
      ) : null}
    </div>
  )
}