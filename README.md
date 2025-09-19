## Mapland

Minimal React + TypeScript app (Vite) with Mapbox GL JS wired in correctly.

### Prerequisites
- Node.js 18+
- A Mapbox access token

### Setup
1) Create your env file:
```bash
cp .env.example .env
# edit .env and set VITE_MAPBOX_TOKEN=your_mapbox_access_token
```

2) Install deps:
```bash
npm install
```

### Run (development)
```bash
npm run dev
# open the printed URL (default http://localhost:5173)
```

### Build + Preview (production)
```bash
npm run build
npm run preview
# open the printed URL (default http://localhost:4173)
```

### Notes
- Mapbox CSS is imported in `src/components/MapView.tsx`.
- The map initializes once and cleans up via `map.remove()` on unmount.
- If `VITE_MAPBOX_TOKEN` is missing, the app logs an error and does not create the map.
