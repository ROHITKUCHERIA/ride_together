import { motion } from 'framer-motion'

interface AlbumArtProps {
  from: string
  to: string
  size: number
  playing?: boolean
  rounded?: string
  title: string
  artist: string
}

export default function AlbumArt({ from, to, size, playing = false, rounded = 'rounded-2xl', title, artist }: AlbumArtProps) {
  return (
    <motion.div
      className={`relative shrink-0 overflow-hidden shadow-2xl ${rounded}`}
      style={{ width: size, height: size, background: `linear-gradient(160deg, ${from}, #1a1210 65%, ${to})` }}
      animate={playing ? { scale: [1, 1.035, 1] } : { scale: 1 }}
      transition={{ duration: 4.5, repeat: playing ? Infinity : 0, ease: 'easeInOut' }}
      role="img"
      aria-label={`Album art for ${title} by ${artist}`}
    >
      <div className="absolute inset-0" style={{ background: 'radial-gradient(80% 60% at 70% 15%, rgba(255,255,255,0.22), transparent 60%)' }} />
      <div
        className="absolute -right-1/4 -bottom-1/4 h-3/4 w-3/4 rounded-full border-[3px] opacity-40"
        style={{ borderColor: `${to}` }}
      />
      <div
        className="absolute -right-1/6 -bottom-1/6 h-1/2 w-1/2 rounded-full border-2 opacity-30"
        style={{ borderColor: `${from}` }}
      />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full opacity-15" aria-hidden="true">
        <path
          d="M20 78 C 28 60, 34 56, 42 64 C 50 72, 58 70, 64 58 C 70 46, 76 40, 82 30"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="82" cy="30" r="4" fill="white" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/45 to-transparent" />
    </motion.div>
  )
}
