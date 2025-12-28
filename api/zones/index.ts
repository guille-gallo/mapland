import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/zones
 * 
 * Returns all zones as a GeoJSON FeatureCollection.
 * Used by mobile apps to fetch zones for geofencing.
 * 
 * Response:
 * {
 *   "type": "FeatureCollection",
 *   "features": [
 *     {
 *       "type": "Feature",
 *       "id": "uuid",
 *       "properties": {
 *         "name": "Zone Name",
 *         "zoneType": "danger" | "suggested",
 *         "message": "Message shown when entering zone"
 *       },
 *       "geometry": { "type": "Polygon", "coordinates": [...] }
 *     }
 *   ]
 * }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

interface ZoneRow {
  id: string
  name: string
  zone_type: string
  geometry: unknown
  message: string | null
  created_at: string
  updated_at: string
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

  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
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

    const { data, error } = await supabase
      .from('zones')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Failed to fetch zones' })
    }

    // Convert to GeoJSON FeatureCollection
    const featureCollection = {
      type: 'FeatureCollection',
      features: ((data || []) as ZoneRow[]).map((row) => ({
        type: 'Feature',
        id: row.id,
        properties: {
          name: row.name,
          zoneType: row.zone_type,
          message: row.message,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
        geometry: row.geometry,
      })),
    }

    return res.status(200).json(featureCollection)
  } catch (err) {
    console.error('Unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
