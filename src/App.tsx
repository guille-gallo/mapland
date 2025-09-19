import './App.css'
import { lazy, Suspense } from 'react'

const MapView = lazy(() => import('./components/MapView'))

export default function App() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading map…</div>}>
      <MapView />
    </Suspense>
  )
}
