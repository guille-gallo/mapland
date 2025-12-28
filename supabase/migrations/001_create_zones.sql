-- Migration: 001_create_zones
-- Description: Create zones table with PostGIS geometry support
-- Created: 2025-12-28

-- Enable PostGIS extension (must be done in Supabase dashboard first if not enabled)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create zones table
CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  zone_type VARCHAR(50) NOT NULL CHECK (zone_type IN ('danger', 'suggested')),
  geometry GEOMETRY(Polygon, 4326) NOT NULL,
  message TEXT, -- Message shown when user enters zone
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create spatial index for efficient geometry queries
CREATE INDEX IF NOT EXISTS zones_geometry_idx ON zones USING GIST (geometry);

-- Create index on zone_type for filtering
CREATE INDEX IF NOT EXISTS zones_zone_type_idx ON zones (zone_type);

-- Enable Row Level Security
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access (for mobile app and map view)
CREATE POLICY "Zones are viewable by everyone"
  ON zones FOR SELECT
  USING (true);

-- Policy: Allow insert for authenticated users (for future auth)
-- For now, allow all inserts (backoffice without auth)
CREATE POLICY "Anyone can insert zones"
  ON zones FOR INSERT
  WITH CHECK (true);

-- Policy: Allow update for authenticated users (for future auth)
-- For now, allow all updates (backoffice without auth)
CREATE POLICY "Anyone can update zones"
  ON zones FOR UPDATE
  USING (true);

-- Policy: Allow delete for authenticated users (for future auth)
-- For now, allow all deletes (backoffice without auth)
CREATE POLICY "Anyone can delete zones"
  ON zones FOR DELETE
  USING (true);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update updated_at on row update
CREATE TRIGGER update_zones_updated_at
  BEFORE UPDATE ON zones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Helper function: Check if a point is inside any zone
-- Usage: SELECT * FROM check_point_in_zones(2.1734, 41.3851);
CREATE OR REPLACE FUNCTION check_point_in_zones(lng DOUBLE PRECISION, lat DOUBLE PRECISION)
RETURNS TABLE (
  zone_id UUID,
  zone_name VARCHAR(255),
  zone_type VARCHAR(50),
  message TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    z.id,
    z.name,
    z.zone_type,
    z.message
  FROM zones z
  WHERE ST_Contains(z.geometry, ST_SetSRID(ST_MakePoint(lng, lat), 4326));
END;
$$ LANGUAGE plpgsql;

-- Helper function: Get all zones as GeoJSON FeatureCollection
-- Usage: SELECT zones_as_geojson();
CREATE OR REPLACE FUNCTION zones_as_geojson()
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(json_agg(
        json_build_object(
          'type', 'Feature',
          'id', z.id,
          'properties', json_build_object(
            'name', z.name,
            'zoneType', z.zone_type,
            'message', z.message,
            'createdAt', z.created_at,
            'updatedAt', z.updated_at
          ),
          'geometry', ST_AsGeoJSON(z.geometry)::json
        )
      ), '[]'::json)
    )
    FROM zones z
  );
END;
$$ LANGUAGE plpgsql;
