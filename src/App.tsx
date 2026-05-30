import './App.css'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { AuthGate } from '@guille/auth-kit'
import { useAuth } from '@guille/auth-kit'

const MapView = lazy(() => import('./components/MapView'))
const Editor = lazy(() => import('./pages/Editor'))

function Nav({ onSignOut }: { onSignOut: () => void }) {
  const { displayName } = useAuth()
  return (
    <nav style={{ position: 'fixed', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
      <Link 
        to="/" 
        style={{
          padding: '6px 12px',
          background: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid #ccc',
          borderRadius: '4px',
          textDecoration: 'none',
          fontSize: '14px',
          fontWeight: 500,
          color: '#333',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        Map
      </Link>
      <Link 
        to="/edit"
        style={{
          padding: '6px 12px',
          background: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid #ccc',
          borderRadius: '4px',
          textDecoration: 'none',
          fontSize: '14px',
          fontWeight: 500,
          color: '#333',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        Edit zones
      </Link>
      <span style={{ fontSize: 13, color: '#555' }}>{displayName}</span>
      <button
        onClick={onSignOut}
        style={{
          padding: '4px 10px',
          background: '#e0e0e0',
          border: '1px solid #bbb',
          borderRadius: '4px',
          fontSize: '13px',
          cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </nav>
  )
}

export default function App() {
  const { signOut } = useAuth()

  return (
    <AuthGate>
      <BrowserRouter>
        <Nav onSignOut={signOut} />
        <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
          <Routes>
            <Route path="/" element={<MapView />} />
            <Route path="/edit" element={<Editor />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthGate>
  )
}