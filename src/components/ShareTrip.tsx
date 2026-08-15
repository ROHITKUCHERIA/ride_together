import { useState } from 'react'
import { Check, Copy, QrCode, Share2 } from 'lucide-react'
import type { TripInfo } from '../types'

interface ShareTripProps {
  trip: TripInfo
}

export default function ShareTrip({ trip }: ShareTripProps) {
  const [copied, setCopied] = useState(false)
  const [qrFailed, setQrFailed] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(trip.inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'RIDETOGETHER',
          text: `Join my ${trip.destination} Bike Trip 🏍️ ${trip.inviteUrl}`,
        })
      } catch {
        /* user cancelled */
      }
    } else {
      await copy()
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-mist/70">Invite your crew</p>
      <div className="rounded-xl border border-white/10 bg-night/50 p-3">
        <p className="text-sm font-medium text-bone">Join my {trip.destination} Bike Trip 🏍️</p>
        <p className="mt-0.5 truncate text-xs text-ember/90">{trip.inviteUrl}</p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/5 px-2 py-2.5 text-xs font-medium text-bone/85 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-ember"
          aria-label="Copy invite link"
        >
          {copied ? <Check size={14} className="text-live" /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy Link'}
        </button>
        <button
          type="button"
          onClick={share}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/5 px-2 py-2.5 text-xs font-medium text-bone/85 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-ember"
          aria-label="Share trip"
        >
          <Share2 size={14} />
          Share
        </button>
        <button
          type="button"
          onClick={() => setQrFailed(false)}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/5 px-2 py-2.5 text-xs font-medium text-bone/85 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-ember"
          aria-label="Show QR code"
        >
          <QrCode size={14} />
          QR Code
        </button>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
        {qrFailed ? (
          <div className="flex flex-col items-center justify-center gap-1 bg-night/40 py-8 text-center">
            <QrCode size={26} className="text-mist/50" />
            <p className="px-6 text-xs text-mist/70">QR unavailable offline. Use Copy Link instead.</p>
          </div>
        ) : (
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(trip.inviteUrl)}`}
            alt={`QR code for ${trip.inviteUrl}`}
            width={360}
            height={360}
            loading="lazy"
            onError={() => setQrFailed(true)}
            className="mx-auto block w-full max-w-[220px] bg-[#ffffff] p-2"
          />
        )}
      </div>
    </div>
  )
}
