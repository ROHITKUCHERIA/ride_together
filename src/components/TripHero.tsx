import { motion } from 'framer-motion'
import TripStats from './TripStats'
import type { TripInfo } from '../types'

interface TripHeroProps {
  trip: TripInfo
}

const PARTICLES = [
  { left: '12%', top: '24%', size: 3, dur: 11, delay: 0 },
  { left: '22%', top: '68%', size: 2, dur: 13, delay: 1.2 },
  { left: '38%', top: '18%', size: 2, dur: 15, delay: 0.6 },
  { left: '56%', top: '74%', size: 3, dur: 12, delay: 2 },
  { left: '70%', top: '26%', size: 2, dur: 14, delay: 1.8 },
  { left: '82%', top: '58%', size: 3, dur: 10, delay: 0.4 },
  { left: '90%', top: '34%', size: 2, dur: 16, delay: 2.4 },
]

export default function TripHero({ trip }: TripHeroProps) {
  return (
    <section className="rt-dark-surface absolute inset-0 overflow-hidden" aria-label={`${trip.name}`}>
      {/* background */}
      <picture>
        <source media="(min-width: 640px)" srcSet="/images/hero-1920.jpg" />
        <source media="(max-width: 639px)" srcSet="/images/hero-1080.jpg" />
        <img
          src="/images/hero-1920.jpg"
          alt="A winding mountain highway at golden hour"
          className="rt-kenburns absolute inset-0 h-full w-full object-cover object-center"
          fetchPriority="high"
        />
      </picture>

      {/* cinematic overlays — dark but not heavy */}
      <div
        className="absolute inset-0 bg-night/35"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,10,12,0.62) 0%, rgba(10,10,12,0.10) 34%, rgba(10,10,12,0.14) 60%, rgba(10,10,12,0.78) 100%)',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 90% at 50% 40%, transparent 45%, rgba(10,10,12,0.55) 100%)' }}
        aria-hidden="true"
      />

      {/* drifting dust */}
      <div className="absolute inset-0" aria-hidden="true">
        {PARTICLES.map((p, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full bg-bone/40"
            style={{ left: p.left, top: p.top, width: p.size, height: p.size, filter: 'blur(0.5px)' }}
            animate={{ y: [-10, 22, -10], opacity: [0.1, 0.55, 0.1] }}
            transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* side ghost labels */}
      <p className="absolute right-6 top-1/2 hidden -translate-y-1/2 text-[10px] font-medium uppercase tracking-[0.5em] text-bone/35 [writing-mode:vertical-rl] lg:block">
        15.499°N · 73.828°E · Night run
      </p>
      <p className="absolute bottom-40 left-7 hidden text-[10px] font-medium uppercase tracking-[0.5em] text-bone/35 lg:block">
        Est. 18 Oct 2026
      </p>

      {/* poster typography */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 pt-6 pb-24 sm:pb-36">
        <motion.p
          initial={{ opacity: 0, letterSpacing: '0.6em' }}
          animate={{ opacity: 1, letterSpacing: '0.34em' }}
          transition={{ duration: 0.9, delay: 0.6, ease: 'easeOut' }}
          className="mb-3 text-[10px] font-semibold uppercase text-sunset/90 sm:mb-4 sm:text-xs"
        >
          {trip.origin} → {trip.destination}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.75, ease: [0.16, 1, 0.3, 1] }}
          className="rt-gradient-text text-center font-display font-bold uppercase leading-[0.92] tracking-[-0.02em] select-none"
          style={{ fontSize: 'clamp(4.25rem, 12vw, 13rem)' }}
        >
          {trip.destination}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.9, delay: 0.95, ease: [0.16, 1, 0.3, 1] }}
          className="rt-stroke -mt-1 font-display font-bold leading-none tracking-[0.28em] select-none sm:ml-28 sm:-mt-2"
          style={{ fontSize: 'clamp(1.6rem, 4.2vw, 4.4rem)' }}
        >
          ROAD TRIP
        </motion.p>

        <div className="mt-6 sm:mt-8">
          <TripStats trip={trip} />
        </div>
      </div>
    </section>
  )
}
