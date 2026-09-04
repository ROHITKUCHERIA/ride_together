import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { subscribeLoading } from '../lib/loadingState'

/**
 * Global liquid-glass loading overlay.
 *
 * Subscribes to the loading state tracker and shows a frosted-glass overlay
 * after a short delay (managed by loadingState.ts). Blocks all pointer events
 * while visible so users cannot double-click through in-flight requests.
 */
export default function GlobalLoader() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    return subscribeLoading(setVisible)
  }, [])

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="global-loader"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed inset-0 z-[var(--z-loading)]"
          role="status"
          aria-label="Loading"
        >
          {/* backdrop — liquid-glass layer */}
          <div className="absolute inset-0 rt-glass" />

          {/* animated liquid ripple */}
          <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <div className="relative flex flex-col items-center gap-5">
              {/* orbiter rings */}
              <div className="relative size-16">
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-accent/30"
                  animate={{ rotate: 360, scale: [1, 1.08, 1] }}
                  transition={{ rotate: { duration: 3, repeat: Infinity, ease: 'linear' }, scale: { duration: 2, repeat: Infinity, ease: 'easeInOut' } }}
                />
                <motion.div
                  className="absolute inset-1.5 rounded-full border-2 border-accent/50"
                  animate={{ rotate: -360, scale: [1, 0.92, 1] }}
                  transition={{ rotate: { duration: 2.4, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } }}
                />
                <motion.div
                  className="absolute inset-3 rounded-full border-2 border-accent/70"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                />
                {/* center dot */}
                <motion.div
                  className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
                  animate={{ scale: [1, 1.3, 1], opacity: [0.8, 1, 0.8] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>

              <p className="font-display text-sm font-semibold tracking-[0.18em] text-bone/80">
                Loading...
              </p>
            </div>
          </div>

          {/* liquid wave shimmer at the top */}
          <div className="absolute inset-x-0 top-0 h-1 overflow-hidden" aria-hidden="true">
            <motion.div
              className="h-full w-[200%] bg-gradient-to-r from-transparent via-accent/40 to-transparent"
              animate={{ x: ['0%', '-50%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
