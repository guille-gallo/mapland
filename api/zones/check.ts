import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/zones/check
 * 
 * Check if a geographic point is inside any zone.
 * Used by mobile apps for real-time geofencing.
 * 
 * Request body:
 * {
 *   "latitude": number,
 *   "longitude": number
 * }
 * 
 * Response:
 * {
 *   "inside": boolean,
 *   "zones": [
 *     {
 *       "id": "uuid",
 *       "name": "Zone Name",
 *       "zoneType": "danger" | "suggested",
 *       "message": "Message to display to user"
 *     }
 *   ]
 * }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

interface CheckPointRow {
  zone_id: string
  zone_name: string
  zone_type: string
  message: string | null
}

interface RequestBody {
  latitude?: number
  longitude?: number
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  // Parse and validate request body
  const body = req.body as RequestBody

  if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
    return res.status(400).json({
      error: 'Invalid request body. Required: { latitude: number, longitude: number }',
    })
  }

  const { latitude, longitude } = body

  // Validate coordinate ranges
  if (latitude < -90 || latitude > 90) {
    return res.status(400).json({ error: 'Latitude must be between -90 and 90' })
  }

  if (longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Longitude must be between -180 and 180' })
  }

  // Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Call the PostGIS function to check if point is in any zone
    const { data, error } = await supabase.rpc('check_point_in_zones', {
      lng: longitude,
      lat: latitude,
    })

    if (error) {
      console.error('Supabase RPC error:', error)
      return res.status(500).json({ error: 'Failed to check point location' })
    }

    const zones = ((data || []) as CheckPointRow[]).map((row) => ({
      id: row.zone_id,
      name: row.zone_name,
      zoneType: row.zone_type,
      message: row.message,
    }))

    return res.status(200).json({
      inside: zones.length > 0,
      zones,
      // Include the queried point for reference
      point: {
        latitude,
        longitude,
      },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
