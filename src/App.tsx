import './App.css'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'

const MapView = lazy(() => import('./components/MapView'))
const Editor = lazy(() => import('./pages/Editor'))

export default function App() {
  return (
    <BrowserRouter>
      <nav style={{ position: 'fixed', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 8 }}>
        <Link 
          to="/" 
          style={{
            padding: '6px 12px',
            background: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid #ccc',
            borderRadius: '4px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
            color: '#333',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f0f0f0'
            e.currentTarget.style.borderColor = '#999'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)'
            e.currentTarget.style.borderColor = '#ccc'
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
            fontWeight: '500',
            color: '#333',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f0f0f0'
            e.currentTarget.style.borderColor = '#999'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)'
            e.currentTarget.style.borderColor = '#ccc'
          }}
        >
          Edit zones
        </Link>
      </nav>
      <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
        <Routes>
          <Route path="/" element={<MapView />} />
          <Route path="/edit" element={<Editor />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
