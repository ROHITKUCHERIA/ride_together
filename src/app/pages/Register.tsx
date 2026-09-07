import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import AuthShell from '../AuthShell'
import Button from '../../components/ui/Button'
import TextField from '../../components/ui/TextField'
import { useAuth } from '../../auth/AuthContext'
import { isApiError } from '../../lib/errors'

interface FieldErrors {
  name?: string
  email?: string
  password?: string
  confirmPassword?: string
}

const PASSWORD_RULES = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/

export default function Register() {
  const { status, register } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Ref guard: state lags the event loop, so rapid submits would fire parallel
  // /register calls without this.
  const submittingRef = useRef(false)

  if (status === 'authenticated') return <Navigate to="/app" replace />

  const validate = (): boolean => {
    const errors: FieldErrors = {}
    if (!name.trim()) errors.name = 'Name is required.'
    else if (name.trim().length < 2) errors.name = 'Name must be at least 2 characters.'
    if (!email.trim()) errors.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.'
    if (!password) errors.password = 'Password is required.'
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters.'
    else if (!PASSWORD_RULES.test(password)) errors.password = 'Use a mix of lowercase, uppercase and a number.'
    if (!confirmPassword) errors.confirmPassword = 'Confirm your password.'
    else if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!validate()) return
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      await register(name.trim(), email.trim(), password)
      navigate('/app', { replace: true })
    } catch (err) {
      setFormError(isApiError(err) || err instanceof Error ? err.message : 'Unable to create your account. Please try again.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join the crew and plan your next ride."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-ember transition hover:text-sunset">
            Sign in
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
          label="Name"
          autoComplete="name"
          placeholder="Biker name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />

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
          autoComplete="new-password"
          placeholder="Create a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          hint="Must include lowercase, uppercase and a number."
        />

        <TextField
          label="Confirm Password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={fieldErrors.confirmPassword}
        />

        <Button type="submit" block size="lg" loading={submitting}>
          Create account
        </Button>
      </form>
    </AuthShell>
  )
}