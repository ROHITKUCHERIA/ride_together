import { Loader2 } from 'lucide-react'

export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-14 text-mist/70" role="status">
      <Loader2 size={18} className="animate-spin text-ember" aria-hidden="true" />
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  )
}