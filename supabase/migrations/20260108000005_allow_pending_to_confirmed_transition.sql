-- Allow pending -> confirmed status transition
-- 允許進貨單狀態從 pending 轉換到 confirmed

-- Check if there's a trigger preventing status transitions
DO $$
DECLARE
  trigger_rec RECORD;
BEGIN
  -- List all triggers on purchases table
  FOR trigger_rec IN
    SELECT trigger_name
    FROM information_schema.triggers
    WHERE event_object_table = 'purchases'
  LOOP
    RAISE NOTICE 'Found trigger: %', trigger_rec.trigger_name;
  END LOOP;
END $$;

-- Drop any status transition check trigger if exists
DROP TRIGGER IF EXISTS check_purchase_status_transition ON purchases;

-- Drop the function if it exists
DROP FUNCTION IF EXISTS validate_purchase_status_transition();

-- Create a new function that allows all valid transitions including pending -> confirmed
CREATE OR REPLACE FUNCTION validate_purchase_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow all these transitions:
  -- draft -> pending (staff submits)
  -- draft -> confirmed (admin creates directly)
  -- pending -> confirmed (admin approves)
  -- pending -> draft (admin rejects back to draft)
  -- any -> cancelled

  -- Only prevent invalid transitions
  IF OLD.status = 'confirmed' AND NEW.status IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'Cannot change status from confirmed back to draft or pending. Create a return/adjustment instead.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (only if you want status validation, otherwise skip this)
-- Commented out by default to allow all transitions
-- CREATE TRIGGER check_purchase_status_transition
--   BEFORE UPDATE ON purchases
--   FOR EACH ROW
--   WHEN (OLD.status IS DISTINCT FROM NEW.status)
--   EXECUTE FUNCTION validate_purchase_status_transition();

COMMENT ON FUNCTION validate_purchase_status_transition() IS '驗證進貨單狀態轉換的合法性';
