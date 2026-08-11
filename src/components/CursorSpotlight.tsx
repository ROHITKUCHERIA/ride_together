import { useEffect, useRef } from 'react'

export default function CursorSpotlight() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const fine = window.matchMedia('(pointer: fine)')
    if (!fine.matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 3 }
    const current = { ...target }

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX
      target.y = e.clientY
      if (!raf) {
        raf = requestAnimationFrame(tick)
      }
    }

    const tick = () => {
      current.x += (target.x - current.x) * 0.09
      current.y += (target.y - current.y) * 0.09
      if (ref.current) {
        ref.current.style.transform = `translate3d(${current.x - 300}px, ${current.y - 300}px, 0)`
      }
      raf = 0
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed left-0 top-0 z-[5] hidden md:block"
      style={{
        width: 600,
        height: 600,
        background: 'radial-gradient(circle, rgba(255,150,60,0.10) 0%, rgba(255,107,44,0.045) 38%, transparent 68%)',
      }}
      aria-hidden="true"
    />
  )
}
