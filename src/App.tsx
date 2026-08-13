import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './app/ProtectedRoute'
import Landing from './app/Landing'
import DemoTrip from './app/DemoTrip'
import Login from './app/pages/Login'
import Register from './app/pages/Register'
import Dashboard from './app/pages/Dashboard'
import TripRoomPage from './app/pages/TripRoomPage'
import Profile from './app/pages/Profile'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/app" element={<ProtectedRoute />}>
        <Route index element={<Dashboard />} />
        <Route path="trips" element={<Navigate to="/app" replace />} />
        <Route path="trips/:tripId" element={<TripRoomPage />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>

      {/* existing demo route — unchanged */}
      <Route path="/trip/:slug" element={<DemoTrip />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}