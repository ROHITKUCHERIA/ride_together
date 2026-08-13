import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ember' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-bone text-night hover:bg-white focus-visible:outline-ember disabled:hover:bg-bone',
  ember:
    'bg-ember text-night hover:brightness-110 focus-visible:outline-ember disabled:hover:bg-ember',
  outline:
    'border border-white/15 bg-white/5 text-bone hover:bg-white/10 focus-visible:outline-ember',
  ghost: 'text-mist hover:bg-white/5 hover:text-bone focus-visible:outline-ember',
  danger:
    'bg-road/15 text-road hover:bg-road/25 focus-visible:outline-road disabled:hover:bg-road/15',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-3 py-2 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-5 py-3 text-sm gap-2',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex min-h-10 items-center justify-center rounded-xl font-semibold transition active:scale-[0.98] focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}