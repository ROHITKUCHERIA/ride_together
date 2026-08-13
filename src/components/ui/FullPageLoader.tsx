import { motion } from 'framer-motion'
import { Bike } from 'lucide-react'

export default function FullPageLoader() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-night">
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
        Getting you ready...
      </p>
      <div className="mt-7 h-px w-44 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full bg-gradient-to-r from-ember to-sunset"
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: 1.25, ease: 'easeInOut' }}
        />
      </div>
    </div>
  )
}