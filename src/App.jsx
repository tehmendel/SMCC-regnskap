import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Categories from './pages/Categories'
import AuditLog from './pages/AuditLog'
import Users from './pages/Users'
import Arrangements from './pages/arrangements/Arrangements'
import ArrangementDetail from './pages/arrangements/ArrangementDetail'
import AnnualAccounts from './pages/annual/AnnualAccounts'
import PeriodAccounts from './pages/period/PeriodAccounts'
import Vendors from './pages/Vendors'
import BankImport from './pages/BankImport'
import Members from './pages/Members'
import MemberRegistry from './pages/MemberRegistry'
import Reisekasse from './pages/Reisekasse'
import CashCounts from './pages/CashCounts'

function ProtectedRoute({ children, requireAdmin }) {
  const { user, profile, loading, isAdmin } = useAuth()
  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Laster…</div>
  if (!user || !profile) return <Navigate to="/login" replace />
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />
  return children
}

function NavItem({ to, icon, label, end }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
      <span style={{ fontSize: 14 }}>{icon}</span> {label}
    </NavLink>
  )
}

function Sidebar() {
  const { profile, signOut, isAdmin } = useAuth()

  return (
    <aside className="sidebar">
      <div className="sidebar-section">Oversikt</div>
      <NavItem to="/" icon="▣" label="Dashboard" end />
      <NavItem to="/perioderegnskap" icon="≡" label="Perioderegnskap" />
      <NavItem to="/aarsregnskap" icon="◫" label="Årsregnskap" />
      <NavItem to="/medlemsregister" icon="◉" label="Medlemsregister" />

      <div className="sidebar-section">Arrangementer</div>
      <NavItem to="/arrangementer" icon="⬡" label="Alle arrangementer" />

      <div className="sidebar-section">Regnskap</div>
      <NavItem to="/transaksjoner" icon="↕" label="Transaksjoner" />
      <NavItem to="/kategorier" icon="◈" label="Kategorier" />
      <NavItem to="/leverandorer" icon="◎" label="Leverandører" />
      <NavItem to="/medlemsavgift" icon="◈" label="Medlemsavgift" />
      <NavItem to="/reisekassen" icon="✈" label="Reisekassen" />
      <NavItem to="/kontantbeholdning" icon="◈" label="Kontantbeholdning" />

      {isAdmin && (
        <>
          <div className="sidebar-section">Admin</div>
          <NavItem to="/brukere" icon="◉" label="Brukere" />
          <NavItem to="/logg" icon="◌" label="Endringslogg" />
        </>
      )}

      <div style={{ flex: 1 }} />
      <div style={{ padding: '8px 20px', fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
        {profile?.full_name}
      </div>
      <button className="sidebar-item" onClick={signOut}>
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
        <span className="topbar-role">{profile?.role}</span>
      </header>
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/perioderegnskap" element={<PeriodAccounts />} />
          <Route path="/aarsregnskap" element={<AnnualAccounts />} />
          <Route path="/arrangementer" element={<Arrangements />} />
          <Route path="/arrangementer/:id" element={<ArrangementDetail />} />
          <Route path="/transaksjoner" element={<Transactions />} />
          <Route path="/kategorier" element={<Categories />} />
          <Route path="/leverandorer" element={<Vendors />} />
          <Route path="/bankimport" element={<BankImport />} />
          <Route path="/medlemsregister" element={<MemberRegistry />} />
          <Route path="/medlemsavgift" element={<Members />} />
          <Route path="/reisekassen" element={<Reisekasse />} />
          <Route path="/kontantbeholdning" element={<CashCounts />} />
          {/* Backward compat redirect */}
          <Route path="/medlemmer" element={<Navigate to="/medlemsavgift" replace />} />
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
      <Route path="/*" element={<ProtectedRoute><AppShell /></ProtectedRoute>} />
    </Routes>
  )
}
