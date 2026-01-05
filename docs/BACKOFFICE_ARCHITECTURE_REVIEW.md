# Mapland Backoffice (BO) Architecture Review

**Review Date:** January 5, 2026  
**Reviewer:** Senior Developer Analysis  
**Codebase Version:** 0.0.0

---

## 📋 Executive Summary

The Mapland Backoffice is a **React-based SPA** (Single Page Application) built with **Vite** that provides zone management and real-time user tracking capabilities. It serves as the administrative interface for:

1. **Zone Management** – Create, edit, and publish geographic zones (danger, suggested, boundary)
2. **Real-time User Tracking** – Monitor mobile app users' locations on a live map
3. **User Communication** – Send messages and commands to mobile users

The BO integrates with **Supabase** for persistence and real-time features, and exposes data to mobile apps through **Vercel Serverless Functions**.

---

## 🏗️ High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MAPLAND ECOSYSTEM                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                     BACKOFFICE (Web Application)                     │  │
│   │                                                                      │  │
│   │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │  │
│   │  │  MapView    │    │   Editor    │    │    Shared Services      │  │  │
│   │  │  (Mapbox)   │    │ (OpenLayers)│    │  ├─ supabase.ts         │  │  │
│   │  │             │    │             │    │  ├─ zonesApi.ts         │  │  │
│   │  │  - Zones    │    │  - Draw     │    │  └─ realtime hooks      │  │  │
│   │  │  - Users    │    │  - Edit     │    │                         │  │  │
│   │  │  - Chat     │    │  - Publish  │    └─────────────────────────┘  │  │
│   │  └──────┬──────┘    └──────┬──────┘                                  │  │
│   │         │                  │                                         │  │
│   └─────────┼──────────────────┼─────────────────────────────────────────┘  │
│             │                  │                                             │
│             ▼                  ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         SUPABASE                                     │   │
│   │                                                                      │   │
│   │   ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐   │   │
│   │   │   Database   │   │   Realtime   │   │     PostGIS          │   │   │
│   │   │              │   │   Channels   │   │     Functions        │   │   │
│   │   │  - zones     │   │              │   │                      │   │   │
│   │   │    table     │   │  - tracking  │   │  - check_point_in_   │   │   │
│   │   │              │   │  - messages  │   │    zones             │   │   │
│   │   └──────────────┘   └──────────────┘   └──────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│             ▲                                                                │
│             │                                                                │
│   ┌─────────┴────────────────────────────────────────────────────────────┐  │
│   │                    API Layer (Vercel Functions)                       │  │
│   │                                                                       │  │
│   │   ┌──────────────────────┐    ┌──────────────────────────────┐      │  │
│   │   │   GET /api/zones     │    │   POST /api/zones/check      │      │  │
│   │   │   (GeoJSON export)   │    │   (Point-in-zone query)      │      │  │
│   │   └──────────────────────┘    └──────────────────────────────┘      │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│             ▲                                                                │
│             │                                                                │
│   ┌─────────┴────────────────────────────────────────────────────────────┐  │
│   │                     MOBILE APP (React Native)                         │  │
│   │                                                                       │  │
│   │   - Fetch zones via API                                              │  │
│   │   - Broadcast location via Supabase Realtime                         │  │
│   │   - Receive messages from BO                                         │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Codebase Structure Analysis

### File Organization

```
src/
├── main.tsx                    # App entry point
├── App.tsx                     # Router + Navigation
├── App.css                     # Global styles
├── index.css                   # Base styles
│
├── components/                 # Shared UI components
│   ├── MapView.tsx            # Main map view (Mapbox GL JS) - 703 lines ⚠️
│   ├── UserPanel.tsx          # User detail & chat panel - 512 lines ⚠️
│   ├── ZoneInfoSheet.tsx      # Zone detail sheet
│   ├── ZoneInfoSheet.css
│   └── EditorToolbar/
│       ├── index.tsx          # Editor actions toolbar
│       └── EditorToolbar.css
│
├── pages/
│   └── Editor/
│       ├── index.tsx          # Zone editor (OpenLayers) - 646 lines ⚠️
│       └── components/
│           ├── ZonePropertiesPanel.tsx
│           ├── ZonePropertiesPanel.css
│           ├── ZoneListSidebar.tsx
│           └── ZoneListSidebar.css
│
├── hooks/
│   ├── useRealtimeTracking.ts # Real-time user tracking hook - 302 lines
│   └── useZones.ts            # Zone data management hook
│
├── services/
│   ├── supabase.ts            # Supabase client initialization
│   └── zonesApi.ts            # Zone CRUD operations - 346 lines
│
├── types/
│   ├── zone.ts                # Zone type definitions
│   ├── realtime.ts            # Realtime protocol types - 281 lines
│   └── database.ts            # Database schema types
│
├── utils/
│   ├── geojson.ts             # GeoJSON processing utilities
│   ├── maskBuilder.ts         # Exclusion mask generation
│   └── locationSimulator.ts   # Testing utility
│
└── data/
    └── default-zones.ts       # Default zone configuration
```

### Component Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              App.tsx                                     │
│                         (BrowserRouter)                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│    Route: "/"                          Route: "/edit"                    │
│    ┌─────────────────────────┐         ┌─────────────────────────────┐  │
│    │       MapView           │         │          Editor              │  │
│    │      (Mapbox GL)        │         │       (OpenLayers)           │  │
│    │                         │         │                              │  │
│    │  ┌─────────────────┐    │         │  ┌───────────────────────┐  │  │
│    │  │ ZoneInfoSheet   │    │         │  │   EditorToolbar       │  │  │
│    │  │ (zone details)  │    │         │  │ (draw/save/publish)   │  │  │
│    │  └─────────────────┘    │         │  └───────────────────────┘  │  │
│    │                         │         │                              │  │
│    │  ┌─────────────────┐    │         │  ┌───────────────────────┐  │  │
│    │  │   UserPanel     │    │         │  │  ZoneListSidebar      │  │  │
│    │  │ (selected user  │    │         │  │ (all zones list)      │  │  │
│    │  │  + chat)        │    │         │  └───────────────────────┘  │  │
│    │  └─────────────────┘    │         │                              │  │
│    │                         │         │  ┌───────────────────────┐  │  │
│    │  Hooks:                 │         │  │ ZonePropertiesPanel   │  │  │
│    │  - useRealtimeTracking  │         │  │ (edit zone props)     │  │  │
│    │                         │         │  └───────────────────────┘  │  │
│    └─────────────────────────┘         └─────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow Diagrams

### Zone Management Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        ZONE MANAGEMENT FLOW                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────┐                                                            │
│  │  Editor  │                                                            │
│  │  Page    │                                                            │
│  └────┬─────┘                                                            │
│       │                                                                   │
│       │ 1. User draws/edits polygon                                      │
│       ▼                                                                   │
│  ┌──────────────────┐                                                    │
│  │ OpenLayers       │                                                    │
│  │ VectorSource     │                                                    │
│  │ (in-memory)      │                                                    │
│  └────────┬─────────┘                                                    │
│           │                                                               │
│           │ 2. "Save" button                                             │
│           ▼                                                               │
│  ┌──────────────────┐     ┌────────────────────┐                        │
│  │   localStorage   │────▶│  CustomEvent       │                        │
│  │   (local cache)  │     │  'zones-updated'   │                        │
│  └──────────────────┘     └─────────┬──────────┘                        │
│                                     │                                    │
│           │ 3. "Publish" button     │ Sync to MapView                    │
│           ▼                         ▼                                    │
│  ┌──────────────────┐     ┌────────────────────┐                        │
│  │   zonesApi.ts    │     │     MapView        │                        │
│  │   publishAll()   │     │  (live preview)    │                        │
│  └────────┬─────────┘     └────────────────────┘                        │
│           │                                                               │
│           │ 4. HTTP to Supabase                                          │
│           ▼                                                               │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                         SUPABASE                                  │   │
│  │                                                                   │   │
│  │   zones table:                                                    │   │
│  │   ┌─────────────────────────────────────────────────────────┐   │   │
│  │   │ id | name | zone_type | geometry (PostGIS) | message    │   │   │
│  │   └─────────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### Real-time User Tracking Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     REAL-TIME TRACKING FLOW                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  MOBILE APP                       SUPABASE                   BACKOFFICE   │
│  ───────────                      ────────                   ───────────  │
│                                                                           │
│  ┌─────────────┐                                                         │
│  │ React Native│                                                         │
│  │ App         │                                                         │
│  └──────┬──────┘                                                         │
│         │                                                                 │
│         │ 1. GPS update                                                  │
│         ▼                                                                 │
│  ┌─────────────────────┐                                                 │
│  │ locationBroadcast.ts│                                                 │
│  │ (3s interval)       │                                                 │
│  └──────────┬──────────┘                                                 │
│             │                                                             │
│             │ 2. Supabase Realtime                                       │
│             │    channel: 'mapland:tracking'                             │
│             │    event: 'location'                                       │
│             ▼                                                             │
│         ┌──────────────────────────────────────────┐                    │
│         │          SUPABASE REALTIME               │                    │
│         │                                          │                    │
│         │  Channel: 'mapland:tracking'             │                    │
│         │  ┌────────────────────────────────────┐ │                    │
│         │  │ Payload:                           │ │                    │
│         │  │ {                                  │ │                    │
│         │  │   user: { userId, displayName },   │ │                    │
│         │  │   position: { lat, lng, accuracy },│ │                    │
│         │  │   status: 'active' | 'sos',        │ │                    │
│         │  │   currentZones: [...]              │ │                    │
│         │  │ }                                  │ │                    │
│         │  └────────────────────────────────────┘ │                    │
│         └─────────────────────┬────────────────────┘                    │
│                               │                                          │
│                               │ 3. Broadcast to subscribers              │
│                               ▼                                          │
│                        ┌─────────────────────────┐                      │
│                        │  useRealtimeTracking    │                      │
│                        │  (React Hook)           │                      │
│                        │                         │                      │
│                        │  State:                 │                      │
│                        │  - users: Map<id, user> │                      │
│                        │  - isConnected          │                      │
│                        │  - activeUserCount      │                      │
│                        └───────────┬─────────────┘                      │
│                                    │                                     │
│                                    │ 4. Update map markers               │
│                                    ▼                                     │
│                        ┌─────────────────────────┐                      │
│                        │       MapView           │                      │
│                        │                         │                      │
│                        │  Mapbox GeoJSON Source: │                      │
│                        │  'user-locations'       │                      │
│                        │                         │                      │
│                        │  Layers:                │                      │
│                        │  - pulse (accuracy)     │                      │
│                        │  - marker (position)    │                      │
│                        │  - label (name)         │                      │
│                        └─────────────────────────┘                      │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### Messaging Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        MESSAGING FLOW                                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  BACKOFFICE → MOBILE                    MOBILE → BACKOFFICE              │
│  ───────────────────                    ───────────────────              │
│                                                                           │
│  ┌────────────────┐                     ┌────────────────┐               │
│  │   UserPanel    │                     │   Mobile Chat  │               │
│  │   (BO)         │                     │   Screen       │               │
│  └───────┬────────┘                     └───────┬────────┘               │
│          │                                      │                         │
│          │ Send message                         │ Send reply              │
│          ▼                                      ▼                         │
│  Channel: mapland:messages:{userId}     Channel: mapland:backoffice      │
│          │                                      │                         │
│          ▼                                      ▼                         │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │                    SUPABASE REALTIME                            │     │
│  │                                                                 │     │
│  │  ChatMessage:                                                   │     │
│  │  {                                                              │     │
│  │    id: string,                                                  │     │
│  │    type: 'text' | 'command',                                    │     │
│  │    content?: string,                                            │     │
│  │    command?: { type: 'call_operator', data: {...} },           │     │
│  │    sender: { id, name, type: 'backoffice' | 'mobile' },        │     │
│  │    recipientId: string,                                         │     │
│  │    timestamp: string                                            │     │
│  │  }                                                              │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 State Management Analysis

### Current Approach

The application uses **local component state** with no centralized state management:

```
State Distribution:
─────────────────────────────────────────────────────────────────

MapView.tsx (703 lines)
├── selectedZone: ZoneFeatureProperties | null
├── selectedUser: TrackedUser | null  
├── loadingState: { isLoading, error, source }
├── status: string
└── refs: mapRef, zonesDataRef, usersRef

Editor/index.tsx (646 lines)
├── mode: 'default' | 'select' | 'draw-polygon'
├── activeZoneType: ZoneType | ''
├── isPublishing: boolean
├── selectedFeature: Feature<Geometry> | null
├── isSidebarOpen: boolean
└── refs: mapRef, vectorSrc, vectorDrawSrc, selectRef

useRealtimeTracking hook
├── users: Map<string, TrackedUser>
├── isConnected: boolean
├── stableIsConnected: boolean
├── error: Error | null
└── refs: channelRef, cleanupIntervalRef

useZones hook
├── zones: Zone[]
├── isLoading: boolean
└── error: string | null
```

### Data Synchronization Strategy

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    DATA SYNC MECHANISMS                                   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  1. EDITOR → MAPVIEW SYNC (CustomEvent)                                  │
│     ────────────────────────────────────                                 │
│     window.dispatchEvent(                                                │
│       new CustomEvent('zones-updated', { detail: featureCollection })    │
│     )                                                                    │
│                                                                           │
│  2. CROSS-TAB SYNC (StorageEvent)                                        │
│     ──────────────────────────────                                       │
│     window.addEventListener('storage', (e) => {                          │
│       if (e.key === 'mapland:zones') { /* reload */ }                    │
│     })                                                                   │
│                                                                           │
│  3. LOCAL STORAGE KEYS                                                   │
│     ──────────────────                                                   │
│     - 'mapland:zones'        → Saved zones                               │
│     - 'mapland:new-polygons' → Unpublished zones                         │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Type System Analysis

### Zone Type Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ZONE TYPES                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  src/types/zone.ts                     src/services/zonesApi.ts         │
│  ─────────────────                     ────────────────────────         │
│                                                                          │
│  ZoneType = 'danger' | 'suggested' | 'boundary'                         │
│                                                                          │
│  ZoneFeatureProperties                 ZoneData (API)                   │
│  ├── id?: string                       ├── id?: string                  │
│  ├── name?: string                     ├── name: string (required)      │
│  ├── zoneType?: ZoneType               ├── zoneType: ZoneType           │
│  ├── message?: string | null           ├── geometry: Polygon            │
│  ├── createdAt?: string                ├── message?: string | null      │
│  └── updatedAt?: string                ├── createdAt?: string           │
│                                        └── updatedAt?: string           │
│                                                                          │
│  ⚠️ INCONSISTENCY:                                                       │
│  - ZoneFeatureProperties has all optional fields                        │
│  - ZoneData requires 'name' and 'zoneType'                              │
│  - database.ts only defines 'danger' | 'suggested' (no 'boundary')     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Realtime Type System

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    REALTIME TYPES (src/types/realtime.ts)                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  User Identification                    Location Data                    │
│  ───────────────────                    ─────────────                    │
│  UserInfo                               GeoPosition                      │
│  ├── userId: UserId                     ├── latitude: number            │
│  ├── displayName: string                ├── longitude: number           │
│  ├── avatar?: string                    ├── accuracy?: number           │
│  └── deviceType?: DeviceType            ├── altitude?: number           │
│                                         ├── heading?: number            │
│                                         └── speed?: number              │
│                                                                          │
│  TrackedUser (MapView state)            ChatMessage                     │
│  ├── user: UserInfo                     ├── id: string                  │
│  ├── position: GeoPosition              ├── type: 'text' | 'command'    │
│  ├── status: UserStatus                 ├── content?: string            │
│  ├── lastSeen: Date                     ├── command?: {...}             │
│  ├── currentZones?: ZoneInfo[]          ├── sender: SenderInfo          │
│  └── isStale?: boolean                  ├── recipientId: string         │
│                                         └── timestamp: string           │
│                                                                          │
│  Constants:                                                              │
│  ─────────                                                               │
│  TRACKING_CHANNEL = 'mapland:tracking'                                  │
│  LOCATION_BROADCAST_INTERVAL = 3000ms                                   │
│  USER_STALE_TIMEOUT = 15000ms                                           │
│  USER_OFFLINE_TIMEOUT = 60000ms                                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## ⚠️ Issues & Improvement Opportunities

### 1. **Large Component Files (Code Smell)**

| File | Lines | Concern |
|------|-------|---------|
| MapView.tsx | 703 | Too many responsibilities |
| Editor/index.tsx | 646 | Mixed map logic with UI state |
| UserPanel.tsx | 512 | Inline styles + business logic |

**Recommendation:** Extract into smaller, focused components:
```
MapView.tsx → 
├── MapContainer.tsx (map initialization)
├── ZonesLayer.tsx (zone rendering logic)
├── UsersLayer.tsx (real-time user markers)
├── MapControls.tsx (navigation UI)
└── useMapSetup.ts (initialization hook)
```

### 2. **Inline Styles (Maintainability)**

`App.tsx` and `UserPanel.tsx` use extensive inline styles:
```tsx
// App.tsx - Lines 11-54
<Link 
  style={{
    padding: '6px 12px',
    background: 'rgba(255, 255, 255, 0.9)',
    // ... 10+ more properties
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.background = '#f0f0f0'
    // Manual hover state management
  }}
>
```

**Recommendation:** Move to CSS modules or styled-components.

### 3. **Type Inconsistencies**

```typescript
// src/types/database.ts - OUTDATED
export type ZoneType = 'danger' | 'suggested'  // Missing 'boundary'

// src/types/zone.ts - CURRENT
export type ZoneType = 'danger' | 'suggested' | 'boundary'  // Correct
```

**Recommendation:** Remove `database.ts` or auto-generate from Supabase schema.

### 4. **Duplicate Supabase Client Creation**

```typescript
// src/services/supabase.ts
export const supabase = createClient(...)

// api/_utils/supabase.ts  
export function getSupabaseClient() { return createClient(...) }

// api/zones/index.ts
const supabase = createClient(...)  // Created inline!

// api/zones/check.ts
const supabase = createClient(...)  // Created inline again!
```

**Recommendation:** Use `api/_utils/supabase.ts` consistently in all API routes.

### 5. **No Error Boundaries**

The app lacks React Error Boundaries. Map failures will crash the entire app.

**Recommendation:** Add error boundaries around map components.

### 6. **localStorage as Primary Data Source**

The Editor uses localStorage as an intermediate store:
```typescript
localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(zones))
localStorage.setItem(NEW_POLYGONS_STORAGE_KEY, JSON.stringify(newPolygons))
```

**Concerns:**
- Data loss risk if browser clears storage
- No conflict resolution for multi-tab editing
- Published vs. unpublished zones tracked separately

**Recommendation:** Consider:
- Draft/published state in Supabase
- Optimistic updates with conflict detection
- Auto-save with debounce directly to Supabase

### 7. **Missing Loading/Error States in Editor**

The Editor page doesn't handle:
- Initial Supabase connection failures gracefully
- Network errors during publish
- Timeout scenarios

### 8. **No Authentication**

The BO has no authentication. Anyone can:
- View all zones
- Publish changes to production
- Send messages to mobile users

**Recommendation:** Implement Supabase Auth with Row Level Security (RLS).

### 9. **Hardcoded Operator Phone Number**

```typescript
// src/types/realtime.ts
export const OPERATOR_PHONE_NUMBER = '+1234567890'
```

**Recommendation:** Move to environment variable or Supabase config.

### 10. **Two Different Map Libraries**

| Page | Library | Reason |
|------|---------|--------|
| MapView | Mapbox GL JS | Real-time rendering, styling |
| Editor | OpenLayers | Better drawing/editing tools |

This creates:
- Larger bundle size
- Different APIs to maintain
- Potential visual inconsistencies

**Trade-off Analysis:**
- ✅ Each library excels at its use case
- ❌ Increased complexity and bundle size
- **Verdict:** Acceptable if bundle size is monitored

---

## 🏆 Strengths

1. **Clear separation of concerns** in services layer (`supabase.ts`, `zonesApi.ts`)
2. **Well-typed realtime protocol** with comprehensive type definitions
3. **Fallback strategy** (Supabase → localStorage → defaults)
4. **Lazy loading** of route components via `React.lazy()`
5. **Good GeoJSON utilities** for complex polygon operations
6. **Debounced updates** to prevent excessive re-renders

---

## 📋 Refactoring Priority Matrix

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 🔴 High | Add authentication | Medium | Security |
| 🔴 High | Consistent Supabase client | Low | Reliability |
| 🟡 Medium | Split large components | High | Maintainability |
| 🟡 Medium | Error boundaries | Low | Stability |
| 🟡 Medium | Fix type inconsistencies | Low | Type Safety |
| 🟢 Low | Extract inline styles | Medium | Maintainability |
| 🟢 Low | Remove duplicate types | Low | Cleanliness |

---

## 🔜 Recommended Next Steps

1. **Immediate (This Sprint)**
   - Add Supabase Auth to protect publishing
   - Consolidate Supabase client creation in API routes
   - Add Error Boundary to map components

2. **Short-term (Next Sprint)**
   - Refactor MapView.tsx into smaller components
   - Create CSS modules for UserPanel and App navigation
   - Fix ZoneType inconsistency in database.ts

3. **Long-term (Backlog)**
   - Consider state management (Zustand/Jotai) for cross-component state
   - Implement draft zones feature in Supabase
   - Add comprehensive E2E tests with Playwright

---

## 📚 Appendix: Key File References

| File | Purpose | Lines |
|------|---------|-------|
| [src/App.tsx](src/App.tsx) | Router & Navigation | 65 |
| [src/components/MapView.tsx](src/components/MapView.tsx) | Main map view | 703 |
| [src/pages/Editor/index.tsx](src/pages/Editor/index.tsx) | Zone editor | 646 |
| [src/services/zonesApi.ts](src/services/zonesApi.ts) | Zone CRUD | 346 |
| [src/hooks/useRealtimeTracking.ts](src/hooks/useRealtimeTracking.ts) | Real-time hook | 302 |
| [src/types/realtime.ts](src/types/realtime.ts) | Protocol types | 281 |
| [src/types/zone.ts](src/types/zone.ts) | Zone types | 62 |
| [api/zones/index.ts](api/zones/index.ts) | GET zones API | 105 |
| [api/zones/check.ts](api/zones/check.ts) | Point check API | 128 |

---

*This review was generated by analyzing the Mapland BO codebase. For questions, refer to the source files linked above.*
