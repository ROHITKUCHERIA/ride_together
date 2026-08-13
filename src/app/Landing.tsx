import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import FullPageLoader from '../components/ui/FullPageLoader'

/** Root landing: route signed-in users to the app and everyone else to login. */
export default function Landing() {
  const { status } = useAuth()

  if (status === 'loading') return <FullPageLoader />

  return <Navigate to={status === 'authenticated' ? '/app' : '/login'} replace />
}