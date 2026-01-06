-- Migration: Add cost column to sale_items table
-- Date: 2026-01-06
-- Description: Add cost field to track the cost of each item at the time of sale

-- Add cost column to sale_items
ALTER TABLE sale_items
ADD COLUMN IF NOT EXISTS cost NUMERIC(10, 2) DEFAULT 0;

-- Update existing sale_items with cost from products table
UPDATE sale_items
SET cost = products.cost
FROM products
WHERE sale_items.product_id = products.id
  AND sale_items.cost = 0;

-- Add comment to document the column
COMMENT ON COLUMN sale_items.cost IS 'Cost of the product at the time of sale (snapshot)';
