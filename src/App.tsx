import './App.css'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'

const MapView = lazy(() => import('./components/MapView'))
const Editor = lazy(() => import('./pages/Editor'))

export default function App() {
  return (
    <BrowserRouter>
      <nav style={{ position: 'fixed', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 8 }}>
        <Link to="/">Map</Link>
        <Link to="/edit">Edit zones</Link>
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
