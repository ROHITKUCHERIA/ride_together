import { AlertCircle } from 'lucide-react'
import type { InputHTMLAttributes, ReactNode } from 'react'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string | null
  hint?: ReactNode
}

export default function TextField({ label, error, hint, id, className = '', ...rest }: TextFieldProps) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-[11px] font-semibold uppercase tracking-[0.18em] text-mist/70">
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={`min-h-11 w-full rounded-xl border bg-night/60 px-3.5 text-sm text-bone outline-none transition placeholder:text-mist/40 focus:border-ember ${
          error ? 'border-road/60 focus:border-road' : 'border-white/12 focus:border-ember'
        } ${className}`}
        {...rest}
      />
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-road">
          <AlertCircle size={12} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] leading-relaxed text-mist/50">{hint}</p>
      ) : null}
    </div>
  )
}