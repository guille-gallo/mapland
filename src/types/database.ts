/**
 * Database types for Supabase
 * Generated based on our schema, can be auto-generated with Supabase CLI
 */

export type ZoneType = 'danger' | 'suggested'

export interface Database {
  public: {
    Tables: {
      zones: {
        Row: {
          id: string
          name: string
          zone_type: ZoneType
          geometry: unknown // PostGIS geometry stored as GeoJSON or WKT
          message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          zone_type: ZoneType
          geometry: unknown
          message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          zone_type?: ZoneType
          geometry?: unknown
          message?: string | null
          updated_at?: string
        }
      }
    }
    Functions: {
      check_point_in_zones: {
        Args: { lng: number; lat: number }
        Returns: {
          zone_id: string
          zone_name: string
          zone_type: ZoneType
          message: string | null
        }[]
      }
      zones_as_geojson: {
        Args: Record<string, never>
        Returns: unknown // GeoJSON FeatureCollection
      }
    }
  }
}
