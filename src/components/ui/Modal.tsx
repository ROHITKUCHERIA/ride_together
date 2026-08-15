import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useIsMobile } from '../../hooks/useMediaQuery'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  children: ReactNode
}

export default function Modal({ open, onClose, title, eyebrow, children }: ModalProps) {
  const isMobile = useIsMobile()
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => closeRef.current?.focus(), 120)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div
            className="absolute inset-0 bg-night/70 backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className={`fixed flex flex-col overflow-hidden border-white/10 bg-charcoal/95 backdrop-blur-2xl ${
              isMobile
                ? 'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl border-t'
                : 'left-1/2 top-1/2 w-[min(92vw,520px)] max-h-[90dvh] -translate-x-1/2 -translate-y-1/2 rounded-2xl border'
            }`}
            initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.96 }}
            animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
            exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
              <div>
                {eyebrow ? (
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-mist/70">{eyebrow}</p>
                ) : null}
                <h2 className="font-display text-2xl font-bold tracking-tight text-bone">{title}</h2>
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                aria-label="Close"
                className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/5 text-mist transition hover:scale-105 hover:bg-white/10 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
              >
                <X size={16} />
              </button>
            </header>
            <div className="rt-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-8">{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}