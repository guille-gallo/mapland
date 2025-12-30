# Mapland

A zone management application for creating, editing, and displaying geographic zones with a backoffice editor and a public map view. Built for geofencing use cases where mobile apps need to check if users are within specific zones.

## Features

- 🗺️ **Interactive Map View** - Display zones on a Mapbox GL map with click-to-view details
- ✏️ **Zone Editor** - Draw and edit polygons using OpenLayers
- ☁️ **Cloud Sync** - Publish zones to Supabase with PostGIS for spatial queries
- 📱 **Mobile API** - REST endpoints for geofencing (point-in-polygon checks)
- 🎨 **Zone Types** - Support for danger zones, suggested zones, and boundary definitions

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React 19 + TypeScript | UI framework |
| Map View | Mapbox GL JS | Public map display |
| Editor | OpenLayers | Zone drawing/editing |
| Backend | Supabase + PostGIS | Database with spatial queries |
| Hosting | Vercel | Static hosting + serverless functions |
| Build | Vite | Development and bundling |

## Architecture

### Data Flow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        EDITOR (/edit)                            │
│                        OpenLayers Map                            │
│                                                                  │
│  User draws polygon → VectorSource (OL Features, EPSG:3857)     │
│           │                                                      │
│           │ GeoJSON Formatter (coordinate transform)            │
│           ▼                                                      │
│  GeoJSON FeatureCollection (EPSG:4326)                          │
│           │                                                      │
│           ├── [Save] ──→ localStorage                           │
│           └── [Publish] → Supabase (PostGIS)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MAP VIEW (/)                                │
│                      Mapbox GL JS                                │
│                                                                  │
│  Fetch zones: Supabase → localStorage → DEFAULT_ZONES           │
│           │                                                      │
│           ▼                                                      │
│  GeoJSON FeatureCollection → Mapbox Source → Map Layers         │
│                                                                  │
│  Click zone → ZoneInfoSheet (name, type, message, timestamps)   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API ENDPOINTS                               │
│                      Vercel Serverless                           │
│                                                                  │
│  GET  /api/zones       → All zones as GeoJSON                   │
│  POST /api/zones/check → Point-in-polygon check                 │
└─────────────────────────────────────────────────────────────────┘
```

### Coordinate Systems

| Context | Projection | Format | Example |
|---------|------------|--------|---------|
| OpenLayers (internal) | EPSG:3857 (Web Mercator) | Meters | `[243900.5, 5069850.3]` |
| GeoJSON (storage) | EPSG:4326 (WGS84) | Degrees | `[2.1734, 41.3851]` |
| Mapbox GL | EPSG:4326 (WGS84) | Degrees | `[2.1734, 41.3851]` |
| Supabase/PostGIS | EPSG:4326 (WGS84) | Degrees | `POINT(2.1734 41.3851)` |

### OpenLayers ↔ GeoJSON Conversion

The Editor uses OpenLayers for drawing, which stores features in its internal format (EPSG:3857). When saving or publishing, features are converted to GeoJSON (EPSG:4326):

```typescript
// OpenLayers → GeoJSON (for saving)
const geoJSONFormatter = new GeoJSON()
const featureCollection = geoJSONFormatter.writeFeaturesObject(
  vectorDrawSrc.getFeatures(),  // OL Feature objects
  {
    featureProjection: 'EPSG:3857',  // Source: Web Mercator
    dataProjection: 'EPSG:4326',     // Target: WGS84 (lat/lng)
  }
)

// GeoJSON → OpenLayers (for loading)
const features = geoJSONFormatter.readFeatures(featureCollection, {
  dataProjection: 'EPSG:4326',
  featureProjection: 'EPSG:3857',
})
vectorSrc.addFeatures(features)
```

### Zone Types

| Type | Icon | Color | Purpose |
|------|------|-------|---------|
| `danger` | 🔴 | Red | Areas to avoid |
| `suggested` | 🟢 | Green | Recommended areas |
| `boundary` | ⚪ | Gray (outline only) | Defines the safe perimeter |

## Project Structure

```
src/
├── components/
│   ├── MapView.tsx          # Main map display (Mapbox GL)
│   ├── ZoneInfoSheet.tsx    # Zone details bottom sheet
│   └── EditorToolbar/       # Editor controls
├── pages/
│   └── Editor/
│       ├── index.tsx        # Zone editor (OpenLayers)
│       └── components/
│           ├── ZonePropertiesPanel.tsx  # Edit zone metadata
│           └── ZoneListSidebar.tsx      # Zone list with selection
├── services/
│   ├── supabase.ts          # Supabase client
│   └── zonesApi.ts          # Zone CRUD operations
├── types/
│   └── zone.ts              # Zone types and configs
├── data/
│   └── default-zones.ts     # Fallback boundary definition
└── utils/
    ├── geojson.ts           # GeoJSON utilities
    └── maskBuilder.ts       # Exclusion mask generation

api/                         # Vercel serverless functions
├── zones/
│   ├── index.ts             # GET /api/zones
│   └── check.ts             # POST /api/zones/check

supabase/
└── migrations/
    ├── 001_create_zones.sql
    └── 002_add_boundary_zone_type.sql
```

## Getting Started

### Prerequisites

- Node.js 18+
- Mapbox account (for access token)
- Supabase project (optional, for cloud sync)

### Environment Variables

Create a `.env` file:

```env
VITE_MAPBOX_TOKEN=pk.your_mapbox_token
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### Installation

```bash
npm install
npm run dev
```

### Database Setup

Run the migrations in your Supabase SQL Editor:

```sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create zones table
CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  zone_type VARCHAR(50) NOT NULL CHECK (zone_type IN ('danger', 'suggested', 'boundary')),
  geometry GEOMETRY(Polygon, 4326) NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for fast queries
CREATE INDEX zones_geometry_idx ON zones USING GIST (geometry);

-- Enable Row Level Security
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Zones are viewable by everyone" ON zones FOR SELECT USING (true);
CREATE POLICY "Anyone can insert zones" ON zones FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update zones" ON zones FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete zones" ON zones FOR DELETE USING (true);
```

## API Reference

### GET /api/zones

Returns all zones as a GeoJSON FeatureCollection.

**Response:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "uuid",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[lng, lat], ...]]
      },
      "properties": {
        "name": "Zone Name",
        "zoneType": "danger",
        "message": "Warning message",
        "createdAt": "2025-12-30T...",
        "updatedAt": "2025-12-30T..."
      }
    }
  ]
}
```

### POST /api/zones/check

Check if a point is inside any zone.

**Request:**
```json
{
  "latitude": 41.3851,
  "longitude": 2.1734
}
```

**Response:**
```json
{
  "inZone": true,
  "zones": [
    {
      "id": "uuid",
      "name": "Zone Name",
      "zoneType": "danger",
      "message": "You are in a danger zone!"
    }
  ]
}
```

## Usage

### Editor Workflow

1. Navigate to `/edit`
2. Select zone type (Danger 🔴 or Suggested 🟢)
3. Draw polygon on map
4. Click zone to select → Edit properties in side panel
5. **Save** to persist locally
6. **Publish** to sync to Supabase cloud

### Map View

1. Navigate to `/` (home)
2. Click any zone to see details in bottom sheet
3. Expand sheet for full metadata (ID, timestamps)
4. Status indicator shows data source:
   - ☁️ = Loaded from Supabase
   - 💾 = Loaded from localStorage
   - 📍 = Using default zones

### Mobile Integration

Use the API endpoints for geofencing:

```typescript
// Check user location against zones
const response = await fetch('https://your-app.vercel.app/api/zones/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    latitude: userLocation.lat,
    longitude: userLocation.lng
  })
})

const { inZone, zones } = await response.json()

if (inZone) {
  const dangerZones = zones.filter(z => z.zoneType === 'danger')
  if (dangerZones.length > 0) {
    showAlert(dangerZones[0].message)
  }
}
```

## Data Persistence

### Priority Order (MapView)

1. **Supabase** (if configured and has data)
2. **localStorage** (browser cache)
3. **DEFAULT_ZONES** (hardcoded fallback)

### Storage Keys

- `mapland:zones` - Main zones (including boundary)
- `mapland:new-polygons` - Newly drawn polygons (merged on publish)

## Development

```bash
# Start dev server
npm run dev

# Type check
npm run typecheck

# Build for production
npm run build

# Preview production build
npm run preview
```

## License

MIT
- The map uses Mapbox GL JS for rendering
- The editor uses OpenLayers for zone drawing and modification
