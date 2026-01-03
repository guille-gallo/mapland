# Mapland Mobile

React Native app for zone geofencing with real-time location tracking.

## Features

- 📍 **GPS Geofencing** - Alerts when entering/leaving zones
- 🗺️ **Zone Map** - View all zones from the Mapland backend
- 📡 **Real-time Tracking** - Share location with operators in real-time
- 🔔 **Push Notifications** - Background geofencing alerts

## Tech Stack

- React Native (Expo managed workflow)
- Supabase Realtime for location broadcasting
- Turf.js for client-side geofencing
- React Native Maps for map display

## Setup

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator

### Installation

```bash
cd apps/mobile
npm install
```

### Environment Variables

Create a `.env` file:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
EXPO_PUBLIC_API_URL=https://mapland.vercel.app/api
```

### Running

```bash
# Start Expo dev server
npx expo start

# iOS Simulator
npx expo run:ios

# Android Emulator
npx expo run:android
```

## Project Structure

```
apps/mobile/
├── app/                    # Expo Router screens
│   ├── _layout.tsx         # Root layout
│   ├── index.tsx           # Home/Map screen
│   └── settings.tsx        # User settings
├── components/             # Reusable components
│   ├── ZoneMap.tsx         # Map with zones
│   └── AlertBanner.tsx     # Zone alert display
├── services/               # API and business logic
│   ├── supabase.ts         # Supabase client
│   ├── zonesApi.ts         # Zones fetching
│   ├── geofencing.ts       # Geofencing logic
│   └── locationBroadcast.ts # Realtime broadcasting
├── hooks/                  # Custom React hooks
│   ├── useLocation.ts      # GPS tracking
│   ├── useGeofencing.ts    # Zone detection
│   └── useZones.ts         # Zones data
├── types/                  # TypeScript types (shared with web)
└── utils/                  # Utilities
```

## Shared Types

This app shares types with the web app via symlink or copy:
- `types/zone.ts` - Zone definitions
- `types/realtime.ts` - Realtime protocol

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Mobile App Flow                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  App Start                                                   │
│      │                                                       │
│      ├──→ Fetch zones from API → Cache locally              │
│      │                                                       │
│      ├──→ Connect to Supabase Realtime channel              │
│      │                                                       │
│      └──→ Start GPS watching                                 │
│               │                                              │
│               ▼                                              │
│      ┌───────────────────┐                                  │
│      │  Location Update  │ (every 3-10 seconds)             │
│      └─────────┬─────────┘                                  │
│                │                                             │
│        ┌───────┴───────┐                                    │
│        ▼               ▼                                    │
│   Geofence Check   Broadcast Location                       │
│   (Turf.js local)  (Supabase Realtime)                     │
│        │                   │                                │
│        ▼                   ▼                                │
│   Zone Alert?         Web MapView                           │
│   Show notification   shows marker                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```
