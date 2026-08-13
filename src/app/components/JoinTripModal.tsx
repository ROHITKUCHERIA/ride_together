import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import TextField from '../../components/ui/TextField'
import Button from '../../components/ui/Button'
import { isApiError } from '../../lib/errors'

interface JoinTripModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (inviteCode: string) => Promise<void>
  initialCode?: string
}

export default function JoinTripModal({ open, onClose, onSubmit, initialCode = '' }: JoinTripModalProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setCode(initialCode)
      setError(null)
      setSubmitting(false)
    }
  }, [open, initialCode])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) {
      setError('Enter an invite code.')
      return
    }
    if (trimmed.length < 6 || trimmed.length > 16) {
      setError('The invite code is invalid.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit(trimmed)
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Unable to join. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Join a trip" eyebrow="Invite code">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Invite code"
          placeholder="e.g. PLNCOAST"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={error}
          autoFocus
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" block size="lg" loading={submitting}>
          Join trip
        </Button>
      </form>
    </Modal>
  )
}