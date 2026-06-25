import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Categories from './pages/Categories'
import AuditLog from './pages/AuditLog'
import Users from './pages/Users'

function ProtectedRoute({ children, requireAdmin }) {
  const { user, profile, loading, isAdmin } = useAuth()
  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Laster…</div>
  if (!user || !profile) return <Navigate to="/login" replace />
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />
  return children
}

function Sidebar() {
  const { profile, signOut, isKasserer, isAdmin } = useAuth()

  return (
    <aside className="sidebar">
      <div className="sidebar-section">Navigasjon</div>

      <NavLink to="/" end className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
        <span>⬛</span> Oversikt
      </NavLink>

      <NavLink to="/transaksjoner" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
        <span>↕</span> Transaksjoner
      </NavLink>

      <NavLink to="/kategorier" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
        <span>◈</span> Kategorier
      </NavLink>

      {isAdmin && (
        <>
          <div className="sidebar-section">Admin</div>
          <NavLink to="/brukere" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
            <span>◎</span> Brukere
          </NavLink>
          <NavLink to="/logg" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
            <span>◉</span> Endringslogg
          </NavLink>
        </>
      )}

      <div style={{ flex: 1 }} />
      <button className="sidebar-item" onClick={signOut} style={{ marginTop: 'auto' }}>
        <span>⊗</span> Logg ut
      </button>
    </aside>
  )
}

function AppShell() {
  const { profile } = useAuth()

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="topbar-logo">Sandnes MC — Regnskap</span>
        <div className="topbar-sep" />
        <span className="topbar-user">{profile?.full_name}</span>
        <span className={`topbar-role`}>{profile?.role}</span>
      </header>
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transaksjoner" element={<Transactions />} />
          <Route path="/kategorier" element={<Categories />} />
          <Route path="/brukere" element={<ProtectedRoute requireAdmin><Users /></ProtectedRoute>} />
          <Route path="/logg" element={<ProtectedRoute requireAdmin><AuditLog /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const { user, profile, loading } = useAuth()

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
      Laster…
    </div>
  )

  return (
    <Routes>
      <Route path="/login" element={user && profile ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      } />
    </Routes>
  )
}
