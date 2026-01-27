-- Create a function to calculate total inventory value directly in DB
CREATE OR REPLACE FUNCTION calculate_inventory_value()
RETURNS TABLE (total_value numeric, total_quantity bigint)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(stock * COALESCE(avg_cost, 0)), 0) as total_value,
    COALESCE(SUM(stock), 0) as total_quantity
  FROM products
  WHERE is_active = true;
END;
$$;
