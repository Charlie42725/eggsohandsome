-- Remove all status transition checks completely
-- 完全移除所有狀態轉換檢查

-- Drop all triggers on purchases table that might check status
DO $$
DECLARE
  trigger_rec RECORD;
BEGIN
  FOR trigger_rec IN
    SELECT trigger_name
    FROM information_schema.triggers
    WHERE event_object_table = 'purchases'
    AND trigger_name LIKE '%status%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON purchases', trigger_rec.trigger_name);
    RAISE NOTICE 'Dropped trigger: %', trigger_rec.trigger_name;
  END LOOP;
END $$;

-- Drop specific known triggers
DROP TRIGGER IF EXISTS check_purchase_status_transition ON purchases;
DROP TRIGGER IF EXISTS validate_purchase_status ON purchases;
DROP TRIGGER IF EXISTS check_status_change ON purchases;

-- Drop related functions
DROP FUNCTION IF EXISTS validate_purchase_status_transition() CASCADE;
DROP FUNCTION IF EXISTS check_purchase_status() CASCADE;
DROP FUNCTION IF EXISTS validate_status_change() CASCADE;

-- Verify: List all remaining triggers on purchases
DO $$
DECLARE
  trigger_rec RECORD;
  trigger_count INTEGER := 0;
BEGIN
  FOR trigger_rec IN
    SELECT trigger_name
    FROM information_schema.triggers
    WHERE event_object_table = 'purchases'
  LOOP
    RAISE NOTICE 'Remaining trigger: %', trigger_rec.trigger_name;
    trigger_count := trigger_count + 1;
  END LOOP;

  IF trigger_count = 0 THEN
    RAISE NOTICE 'All status-related triggers have been removed successfully';
  END IF;
END $$;
