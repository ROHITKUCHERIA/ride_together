import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import AuthShell from '../AuthShell'
import Button from '../../components/ui/Button'
import TextField from '../../components/ui/TextField'
import { useAuth } from '../../auth/AuthContext'
import { isApiError } from '../../lib/errors'

interface FieldErrors {
  email?: string
  password?: string
}

export default function Login() {
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/app'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'authenticated') return <Navigate to={from} replace />

  const validate = (): boolean => {
    const errors: FieldErrors = {}
    if (!email.trim()) errors.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.'
    if (!password) errors.password = 'Password is required.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!validate()) return
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setFormError(isApiError(err) ? err.message : 'Unable to sign in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Hop in and get back on the road."
      footer={
        <>
          New to RideTogether?{' '}
          <Link to="/register" className="font-semibold text-ember transition hover:text-sunset">
            Create account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formError ? (
          <p role="alert" className="rounded-xl border border-road/35 bg-road/10 px-3.5 py-2.5 text-sm text-road">
            {formError}
          </p>
        ) : null}

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />

        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />

        <Button type="submit" block size="lg" loading={submitting}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  )
}