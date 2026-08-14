import { useCallback, useEffect, useState } from 'react'
import { Check, LogOut, Save } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../AppHeader'
import Button from '../../components/ui/Button'
import TextField from '../../components/ui/TextField'
import Spinner from '../../components/ui/Spinner'
import ErrorState from '../../components/ui/ErrorState'
import Avatar from '../../components/Avatar'
import { getMe, updateMe } from '../../api/users'
import { useAuth } from '../../auth/AuthContext'
import { isApiError } from '../../lib/errors'

export default function Profile() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const me = await getMe()
      setName(me?.name ?? '')
      setAvatarUrl(me?.avatarUrl ?? '')
      setEmail(me?.email ?? '')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load your profile.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)

    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length < 2) {
      setError('Name must be at least 2 characters.')
      return
    }

    const trimmedAvatar = avatarUrl.trim()
    if (trimmedAvatar) {
      try {
        new URL(trimmedAvatar)
      } catch {
        setError('Avatar URL must be a valid link (e.g. https://...).')
        return
      }
    }

    setSaving(true)
    try {
      await updateMe({ name: trimmedName, ...(trimmedAvatar ? { avatarUrl: trimmedAvatar } : {}) })
      setName(trimmedName)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Unable to save your profile.')
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-night text-bone">
      <AppHeader />
      <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-8 sm:px-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-mist/60">Profile</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-bone sm:text-3xl">Your account</h1>

        {loading ? (
          <Spinner label="Loading your profile..." />
        ) : loadError ? (
          <div className="mt-6">
            <ErrorState message={loadError} onRetry={load} />
          </div>
        ) : (
          <form onSubmit={handleSave} className="mt-8 flex flex-col gap-5" noValidate>
            <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <Avatar name={name || '?'} accent="#ff6b2c" size={56} />
              <div className="min-w-0">
                <p className="font-display text-base font-semibold text-bone">{name || 'Your name'}</p>
                <p className="truncate text-xs text-mist/70">{email}</p>
              </div>
            </div>

            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />

            <TextField
              label="Avatar URL"
              inputMode="url"
              placeholder="https://example.com/avatar.jpg"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              hint="Leave blank to keep the default avatar."
            />

            {error ? (
              <p role="alert" className="rounded-xl border border-road/35 bg-road/10 px-3.5 py-2.5 text-sm text-road">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-3">
              <Button type="submit" block size="lg" loading={saving}>
                {saved ? (
                  <>
                    <Check size={15} aria-hidden="true" /> Saved
                  </>
                ) : (
                  <>
                    <Save size={15} aria-hidden="true" /> Save changes
                  </>
                )}
              </Button>
              <Button type="button" variant="ghost" block onClick={handleLogout}>
                <LogOut size={15} aria-hidden="true" /> Log out
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}