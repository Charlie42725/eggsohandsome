-- Migration: Add combo_prices column to ichiban_kuji table
-- Date: 2026-01-06
-- Description: Add support for combo pricing (e.g., 3 draws for 280, 5 draws for 450)

-- Add combo_prices column as JSONB array
ALTER TABLE ichiban_kuji
ADD COLUMN IF NOT EXISTS combo_prices JSONB DEFAULT '[]'::jsonb;

-- Add comment to document the column
COMMENT ON COLUMN ichiban_kuji.combo_prices IS 'Array of combo price objects with draws (number) and price (number) fields. Example: [{"draws": 3, "price": 280}, {"draws": 5, "price": 450}]';
