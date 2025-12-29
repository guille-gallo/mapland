-- Migration: 002_add_boundary_zone_type
-- Description: Add 'boundary' to the allowed zone types
-- Created: 2025-12-29

-- Drop the existing check constraint
ALTER TABLE zones DROP CONSTRAINT IF EXISTS zones_zone_type_check;

-- Add updated check constraint with 'boundary' type
ALTER TABLE zones ADD CONSTRAINT zones_zone_type_check 
  CHECK (zone_type IN ('danger', 'suggested', 'boundary'));

-- Update name constraint to allow empty string for boundary zones
ALTER TABLE zones ALTER COLUMN name DROP NOT NULL;
ALTER TABLE zones ADD CONSTRAINT zones_name_check 
  CHECK (
    (zone_type = 'boundary') OR 
    (zone_type != 'boundary' AND name IS NOT NULL AND name != '')
  );
