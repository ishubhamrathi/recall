import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from '@/store/AppContext'
import { AddToHomeScreen } from '@/components/AddToHomeScreen'
import Landing from '@/pages/Landing'
import Dashboard from '@/pages/Dashboard'
import Learn from '@/pages/Learn'
import Bookmarks from '@/pages/Bookmarks'
import Progress from '@/pages/Progress'
import Topics from '@/pages/Topics'
import Contribute from '@/pages/Contribute'
import Search from '@/pages/Search'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import { AppShell } from '@/components/layout/AppShell'

// Every feature route is mandatory-sign-in. Waits for session rehydration first,
// otherwise a signed-in user hard-refreshing would be bounced to /login.
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useApp()
  const { pathname } = useLocation()
  if (!authReady) {
    return (
      <AppShell>
        <div className="min-h-[60vh] grid place-items-center text-sm text-slate-400">Checking your session…</div>
      </AppShell>
    )
  }
  if (!user) return <Navigate to={`/login?from=${encodeURIComponent(pathname)}`} replace />
  return <AppShell>{children}</AppShell>
}

export default function App(){
  return (
    <AppProvider>
      <AddToHomeScreen />
      <BrowserRouter>
        <Routes>
          {/* public: entry point + the auth pages themselves */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          {/* everything else requires a signed-in user */}
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/learn" element={<RequireAuth><Learn /></RequireAuth>} />
          <Route path="/bookmarks" element={<RequireAuth><Bookmarks /></RequireAuth>} />
          <Route path="/progress" element={<RequireAuth><Progress /></RequireAuth>} />
          <Route path="/topics" element={<RequireAuth><Topics /></RequireAuth>} />
          <Route path="/contribute" element={<RequireAuth><Contribute /></RequireAuth>} />
          <Route path="/search" element={<RequireAuth><Search /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
