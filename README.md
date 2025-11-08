## Mapland

Map visualization app with zone editing capabilities. Built with React, TypeScript, Mapbox GL JS, and OpenLayers.

### Features
- **Map View**: Displays zones with masked exclusion areas
- **Zone Editor**: Draw and edit two types of zones:
  - **Danger Zone** (red) - restricted areas
  - **Suggested Zone** (green) - recommended areas
- Zones persist in browser localStorage
- Export zones as GeoJSON

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

### Usage
- Use the button links in the top right corner to navigate between views
- **Map**: View saved zones with masked exclusion areas
- **Edit zones**: Create and modify zones
  - Select a zone type from the dropdown and draw polygons on the map
  - Click "Save" to persist changes

### Notes
- Zones are stored locally in the browser
- The map uses Mapbox GL JS for rendering
- The editor uses OpenLayers for zone drawing and modification
