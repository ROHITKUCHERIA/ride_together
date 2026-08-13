import { motion } from 'framer-motion'
import { Bike } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

interface AuthShellProps {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}

export default function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-night px-4 py-10 text-bone sm:px-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 50% at 50% 100%, rgba(255,107,44,0.12), transparent 70%), radial-gradient(60% 45% at 50% 0%, rgba(59,35,70,0.25), transparent 70%)',
        }}
        aria-hidden="true"
      />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative w-full max-w-md"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-3 grid size-12 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-ember/25 to-transparent">
            <Bike size={24} className="text-ember" strokeWidth={1.8} />
          </span>
          <Link to="/" className="font-display text-xl font-bold tracking-[0.2em] text-bone">
            RIDE<span className="text-ember">TOGETHER</span>
          </Link>
        </div>

        <div className="rounded-3xl border border-white/10 bg-charcoal/70 p-6 shadow-2xl backdrop-blur-2xl sm:p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-bone">{title}</h1>
          <p className="mt-1.5 text-sm text-mist/70">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>

        <p className="mt-6 text-center text-sm text-mist/70">{footer}</p>
      </motion.div>
    </div>
  )
}