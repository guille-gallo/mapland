/**
 * Test script to simulate mobile app broadcasting location
 * 
 * Run this in your browser console or as a separate script to test
 * the real-time tracking feature in MapView.
 * 
 * Usage:
 *   1. Open the MapView in your browser (http://localhost:5173/)
 *   2. Open browser DevTools → Console
 *   3. Copy and paste this script, or import the test page
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing Supabase environment variables')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const CHANNEL = 'mapland:tracking'

// Simulate a user moving around Barcelona
const simulatedUsers = [
  {
    userId: 'test-user-1',
    displayName: 'Alice 📱',
    deviceType: 'simulator' as const,
    // Starting position near Barcelona beach
    startLat: 41.3807,
    startLng: 2.1896,
  },
  {
    userId: 'test-user-2', 
    displayName: 'Bob 🚶',
    deviceType: 'simulator' as const,
    // Starting position near Sagrada Familia
    startLat: 41.4036,
    startLng: 2.1744,
  },
]

interface SimulatedUser {
  userId: string
  displayName: string
  deviceType: 'ios' | 'android' | 'web' | 'simulator'
  startLat: number
  startLng: number
  currentLat?: number
  currentLng?: number
  heading?: number
}

class LocationSimulator {
  private channel: ReturnType<typeof supabase.channel> | null = null
  private intervalId: NodeJS.Timeout | null = null
  private users: SimulatedUser[] = []

  async start(users: SimulatedUser[], intervalMs = 3000) {
    this.users = users.map(u => ({
      ...u,
      currentLat: u.startLat,
      currentLng: u.startLng,
      heading: Math.random() * 360,
    }))

    // Subscribe to channel
    this.channel = supabase.channel(CHANNEL)
    await this.channel.subscribe((status) => {
      console.log(`[Simulator] Channel status: ${status}`)
    })

    console.log(`[Simulator] Started broadcasting ${users.length} user(s)`)

    // Broadcast immediately
    this.broadcastAll()

    // Then continue at interval
    this.intervalId = setInterval(() => {
      this.moveUsers()
      this.broadcastAll()
    }, intervalMs)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    // Send leave events
    this.users.forEach(user => {
      this.channel?.send({
        type: 'broadcast',
        event: 'leave',
        payload: { userId: user.userId, timestamp: new Date().toISOString() },
      })
    })

    if (this.channel) {
      supabase.removeChannel(this.channel)
      this.channel = null
    }

    console.log('[Simulator] Stopped')
  }

  private moveUsers() {
    this.users.forEach(user => {
      // Random walk - small movements
      const latDelta = (Math.random() - 0.5) * 0.001 // ~100m
      const lngDelta = (Math.random() - 0.5) * 0.001
      
      user.currentLat = (user.currentLat ?? user.startLat) + latDelta
      user.currentLng = (user.currentLng ?? user.startLng) + lngDelta
      user.heading = (user.heading ?? 0) + (Math.random() - 0.5) * 30

      // Keep heading in 0-360 range
      if (user.heading! < 0) user.heading! += 360
      if (user.heading! >= 360) user.heading! -= 360
    })
  }

  private broadcastAll() {
    this.users.forEach(user => {
      const payload = {
        user: {
          userId: user.userId,
          displayName: user.displayName,
          deviceType: user.deviceType,
        },
        position: {
          latitude: user.currentLat!,
          longitude: user.currentLng!,
          accuracy: 10 + Math.random() * 20, // 10-30m accuracy
          heading: user.heading,
          speed: 1 + Math.random() * 2, // 1-3 m/s (walking)
        },
        status: 'active' as const,
        timestamp: new Date().toISOString(),
      }

      this.channel?.send({
        type: 'broadcast',
        event: 'location',
        payload,
      })

      console.log(`[Simulator] Broadcast: ${user.displayName} at ${user.currentLat?.toFixed(5)}, ${user.currentLng?.toFixed(5)}`)
    })
  }

  // Trigger SOS for testing
  triggerSOS(userId: string) {
    this.channel?.send({
      type: 'broadcast',
      event: 'status',
      payload: {
        user: { userId },
        status: 'sos',
        timestamp: new Date().toISOString(),
      },
    })
    console.log(`[Simulator] SOS triggered for ${userId}`)
  }
}

// Export for use in console or other scripts
export const simulator = new LocationSimulator()

// Auto-start when this module is loaded
simulator.start(simulatedUsers)

// Stop after 2 minutes by default (to not drain resources)
setTimeout(() => {
  console.log('[Simulator] Auto-stopping after 2 minutes')
  simulator.stop()
}, 2 * 60 * 1000)

// Instructions for console usage
console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🎮 Location Simulator Running                               ║
╠══════════════════════════════════════════════════════════════╣
║  Commands:                                                    ║
║    simulator.stop()           - Stop broadcasting            ║
║    simulator.triggerSOS('test-user-1') - Trigger SOS status  ║
║                                                               ║
║  Check MapView for user markers!                              ║
║  Auto-stops after 2 minutes.                                  ║
╚══════════════════════════════════════════════════════════════╝
`)
