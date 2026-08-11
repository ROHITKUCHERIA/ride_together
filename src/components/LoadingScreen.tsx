import { motion } from 'framer-motion'
import { Bike } from 'lucide-react'

export default function LoadingScreen() {
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-night"
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
      aria-label="Loading trip room"
      role="status"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 50% at 50% 100%, rgba(255,107,44,0.14), transparent 70%), radial-gradient(60% 45% at 50% 0%, rgba(59,35,70,0.25), transparent 70%)',
        }}
        aria-hidden="true"
      />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative flex flex-col items-center"
      >
        <motion.div
          animate={{ y: [0, -6, 0], rotate: [-2, 2, -2] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="mb-6 grid size-16 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-ember/25 to-transparent"
        >
          <Bike size={30} className="text-ember" strokeWidth={1.8} />
        </motion.div>
        <p className="font-display text-2xl font-bold tracking-[0.18em] text-bone">
          RIDE<span className="text-ember">TOGETHER</span>
        </p>
        <p className="mt-3 text-xs font-medium uppercase tracking-[0.32em] text-mist/70">
          Preparing your ride...
        </p>
        <div className="mt-7 h-px w-44 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full bg-gradient-to-r from-ember to-sunset"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 1.25, ease: 'easeInOut' }}
          />
        </div>
      </motion.div>
    </motion.div>
  )
}
