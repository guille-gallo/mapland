# Mapland Implementation Plan: Backoffice + Mobile API

> Created: December 28, 2025

## Overview

Transform Mapland into a full backoffice application where users can create/edit zones that are:
1. Persisted to a database (Supabase)
2. Displayed in the web map view
3. Exposed via API for mobile app integration (geofencing)

---

## Current Codebase Analysis

### Architecture Overview

| Component | Technology | Description |
|-----------|------------|-------------|
| **Map View** (`/`) | Mapbox GL JS | Displays saved zones with exclusion mask overlay |
| **Editor** (`/edit`) | OpenLayers + ol-mapbox-style | Draw/edit polygons (danger/suggested zones) |
| **Storage** | localStorage | Persists zones (`mapland:zones`, `mapland:new-polygons`) |
| **Hosting** | Vercel | Auto-deploys on push to `main` |
| **Backend (planned)** | Supabase | Empty `migrations/` folder exists |

### Current Data Flow
1. Editor saves zones to `localStorage`
2. MapView reads from `localStorage` on load
3. Cross-tab sync via `storage` event + custom `zones-updated` event
4. Export copies GeoJSON to clipboard (for geojson.io)

### Zone Types
- `danger` - Red fill (restricted areas)
- `suggested` - Green fill (recommended areas)

### Key Files
- `src/types/zone.ts` - Zone type definitions
- `src/data/default-zones.ts` - Hardcoded Barcelona polygon
- `src/pages/Editor/index.tsx` - Zone editor (OpenLayers)
- `src/components/MapView.tsx` - Display map (Mapbox)
- `src/utils/geojson.ts` - Exclusion mask generation
- `src/utils/maskBuilder.ts` - Mask timing/hashing utilities

---

## Implementation Phases

### Phase 1: Backend Infrastructure (Supabase)
**Goal**: Replace localStorage with persistent database storage

| Task | Description | Status |
|------|-------------|--------|
| 1.1 | Create Supabase `zones` table with PostGIS geometry support | ✅ |
| 1.2 | Add Supabase client (`src/services/supabase.ts`) | ✅ |
| 1.3 | Create environment variables for Supabase URL/Key | ✅ |
| 1.4 | Create API service layer (`src/services/zonesApi.ts`) | ✅ |
| 1.5 | Extend Zone types with new fields (id, name, message) | ✅ |

**Database Schema:**
```sql
-- Enable PostGIS extension (run once in Supabase dashboard)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  zone_type VARCHAR(50) NOT NULL CHECK (zone_type IN ('danger', 'suggested')),
  geometry GEOMETRY(Polygon, 4326) NOT NULL,
  message TEXT, -- Message shown when user enters zone
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for spatial queries
CREATE INDEX zones_geometry_idx ON zones USING GIST (geometry);

-- Row Level Security (optional, for future auth)
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for mobile app)
CREATE POLICY "Public zones are viewable by everyone"
  ON zones FOR SELECT
  USING (true);
```

---

### Phase 2: API Endpoints for Mobile
**Goal**: Expose zones for mobile app consumption

| Task | Description | Status |
|------|-------------|--------|
| 2.1 | Create public API route: `GET /api/zones` (returns all zones as GeoJSON) | ✅ |
| 2.2 | Add point-in-polygon endpoint: `POST /api/zones/check` | ✅ |
| 2.3 | Implement response with zone details + message | ✅ |

**API Endpoints:**

#### `GET /api/zones`
Returns all zones as GeoJSON FeatureCollection.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "uuid-here",
      "properties": {
        "name": "Beach Restricted Area",
        "zoneType": "danger",
        "message": "Swimming prohibited in this area"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[lng, lat], ...]]
      }
    }
  ]
}
```

#### `POST /api/zones/check`
Check if a coordinate is inside any zone.

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
  "inside": true,
  "zones": [
    {
      "id": "uuid",
      "name": "Restricted Beach Area",
      "zoneType": "danger",
      "message": "You are inside a danger zone. Please leave the area."
    }
  ]
}
```

---

### Phase 3: Editor Enhancements
**Goal**: Full zone management in backoffice

| Task | Description | Status |
|------|-------------|--------|
| 3.1 | Add zone metadata panel (name, message, type) | ✅ |
| 3.2 | Implement zone list sidebar with edit/delete | ✅ |
| 3.3 | Add "Publish" button to sync to Supabase | ✅ |
| 3.4 | Keep localStorage as draft/offline fallback | ✅ |
| 3.5 | Add zone selection to edit properties | ✅ |
| 3.6 | Add individual zone delete functionality | ✅ |

**UI Mockup:**
```
┌─────────────────────────────────────────────────────────────┐
│ [Map]                           │ Zone Properties           │
│                                 │ ─────────────────────────│
│                                 │ Name: [Beach Zone      ] │
│                                 │ Type: [Danger ▾        ] │
│                                 │ Message:                 │
│                                 │ [Swimming prohibited   ] │
│                                 │ [in this area.         ] │
│                                 │                          │
│                                 │ [Save Zone] [Delete]     │
│                                 │ ─────────────────────────│
│                                 │ All Zones:               │
│                                 │ • Beach Zone (danger)    │
│                                 │ • Park Area (suggested)  │
├─────────────────────────────────┴──────────────────────────┤
│ [Draw Zone ▾] [💾 Save All] [📤 Export] [☁️ Publish] [🗑️]  │
└─────────────────────────────────────────────────────────────┘
```

---

### Phase 4: Map View Updates
**Goal**: Display zones from backend instead of localStorage

| Task | Description | Status |
|------|-------------|--------|
| 4.1 | Fetch zones from Supabase API on load | ✅ |
| 4.2 | Add zone click handler to show name/message | ✅ |
| 4.3 | Optional: Show user location (if granted) | ✅ |
| 4.4 | Add loading/error states | ✅ |

---

### Phase 5: Mobile Integration Preparation
**Goal**: Document and prepare for mobile app integration

| Task | Description | Status |
|------|-------------|--------|
| 5.1 | Create API documentation (OpenAPI/Swagger) | ✅ |
| 5.2 | Add CORS configuration for mobile app domain | ✅ |
| 5.3 | Create example mobile integration code | ✅ |
| 5.4 | Document geofencing implementation patterns | ✅ |

---

## New File Structure

```
src/
  services/
    supabase.ts          # Supabase client initialization
    zonesApi.ts          # Zone CRUD operations
  types/
    zone.ts              # Extended with id, name, message
    api.ts               # API request/response types
  hooks/
    useZones.ts          # React hook for zones data
  pages/
    Editor/
      components/
        ZoneList.tsx     # Sidebar zone list
        ZoneForm.tsx     # Edit zone metadata
      index.tsx          # Updated editor
supabase/
  migrations/
    001_create_zones.sql # PostGIS zones table
api/
  zones/
    index.ts             # GET /api/zones
    check.ts             # POST /api/zones/check
```

---

## Environment Variables

```bash
# Existing
VITE_MAPBOX_TOKEN=your_mapbox_token

# New (Phase 1)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

---

## Implementation Order & Estimates

| Priority | Phase | Estimated Effort | Breaking Changes |
|----------|-------|------------------|------------------|
| 🔴 High | 1 (Backend) | 2-3 hours | None |
| 🔴 High | 2 (API) | 1-2 hours | None |
| 🟡 Medium | 3 (Editor) | 3-4 hours | None (additive) |
| 🟢 Low | 4 (MapView) | 1-2 hours | None (additive) |
| 🟢 Low | 5 (Mobile prep) | 1 hour | None |

---

## Key Considerations

1. **No Breaking Changes**: All changes are additive - localStorage continues to work as fallback
2. **Backward Compatibility**: Existing zones in localStorage will continue to load
3. **Progressive Enhancement**: Editor can work offline, sync when online
4. **Mobile-First API**: Simple REST endpoints for easy mobile integration
5. **Deployment**: Git push to `main` auto-deploys to Vercel

---

## Mobile App Integration Notes

The mobile app will need to:

1. **Fetch zones on startup**:
   ```typescript
   const response = await fetch('https://mapland.vercel.app/api/zones')
   const geojson = await response.json()
   // Store locally for offline use
   ```

2. **Check user position periodically**:
   ```typescript
   const checkPosition = async (lat: number, lng: number) => {
     const response = await fetch('https://mapland.vercel.app/api/zones/check', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ latitude: lat, longitude: lng })
     })
     const result = await response.json()
     if (result.inside) {
       showNotification(result.zones[0].message)
     }
   }
   ```

3. **Alternative: Client-side geofencing**:
   - Download all zones as GeoJSON
   - Use turf.js `booleanPointInPolygon` for local checks
   - More battery efficient, works offline

---

## Progress Log

| Date | Phase | Tasks Completed | Notes |
|------|-------|-----------------|-------|
| 2025-12-28 | - | Initial plan created | - |
| 2025-12-28 | 1 | All Phase 1 tasks | Backend infrastructure ready |
| 2025-12-28 | 2 | All Phase 2 tasks | API endpoints for mobile ready |

