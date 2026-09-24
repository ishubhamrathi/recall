import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from '@/store/AppContext'
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

function Protected({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}

export default function App(){
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/learn" element={<Protected><Learn /></Protected>} />
          <Route path="/bookmarks" element={<Protected><Bookmarks /></Protected>} />
          <Route path="/progress" element={<Protected><Progress /></Protected>} />
          <Route path="/topics" element={<Protected><Topics /></Protected>} />
          <Route path="/contribute" element={<Protected><Contribute /></Protected>} />
          <Route path="/search" element={<Protected><Search /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
