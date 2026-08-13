import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import FullPageLoader from '../components/ui/FullPageLoader'

export default function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageLoader />

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }

  return <Outlet />
}