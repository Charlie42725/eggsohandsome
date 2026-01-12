-- 1. 檢查現有的 triggers
SELECT
  trigger_name,
  event_manipulation,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'inventory_logs'
  AND event_object_schema = 'public'
ORDER BY trigger_name;

-- 2. 刪除所有 inventory_logs 相關的舊 triggers（如果有多個）
DO $$
DECLARE
  trig RECORD;
BEGIN
  FOR trig IN
    SELECT trigger_name
    FROM information_schema.triggers
    WHERE event_object_table = 'inventory_logs'
      AND event_object_schema = 'public'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON inventory_logs', trig.trigger_name);
    RAISE NOTICE 'Dropped trigger: %', trig.trigger_name;
  END LOOP;
END $$;

-- 3. 重新創建唯一的 trigger
CREATE OR REPLACE FUNCTION update_product_stock_from_log()
RETURNS TRIGGER AS $$
BEGIN
  -- 更新商品庫存
  UPDATE products
  SET stock = stock + NEW.qty_change
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. 創建新的 trigger
CREATE TRIGGER trigger_update_product_stock
  AFTER INSERT ON inventory_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_product_stock_from_log();

-- 5. 驗證結果
SELECT
  trigger_name,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'inventory_logs'
  AND event_object_schema = 'public';

SELECT 'Trigger 已重新創建！現在只有一個 trigger 會更新庫存' as message;
