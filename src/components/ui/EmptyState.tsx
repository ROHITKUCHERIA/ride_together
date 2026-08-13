import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-white/10 bg-white/5 text-ember">
        {icon}
      </div>
      <h3 className="font-display text-lg font-bold text-bone">{title}</h3>
      {description ? <p className="mt-2 max-w-xs text-sm text-mist/70">{description}</p> : null}
      {action ? <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{action}</div> : null}
    </div>
  )
}