-- ========================================
-- 測試和診斷庫存系統
-- ========================================

-- 1. 查看現有的 triggers
SELECT
  trigger_name,
  event_manipulation,
  action_statement,
  action_timing,
  action_orientation
FROM information_schema.triggers
WHERE event_object_table = 'inventory_logs'
  AND event_object_schema = 'public'
ORDER BY trigger_name;

-- 2. 查看最近的庫存日誌
SELECT
  id,
  product_id,
  ref_type,
  qty_change,
  memo,
  created_at
FROM inventory_logs
ORDER BY created_at DESC
LIMIT 20;

-- 3. 測試：選擇一個商品來測試
-- 請替換 'YOUR_PRODUCT_ID' 為實際的商品 ID
DO $$
DECLARE
  test_product_id uuid;
  old_stock integer;
  new_stock integer;
BEGIN
  -- 選擇第一個商品進行測試
  SELECT id INTO test_product_id FROM products LIMIT 1;

  IF test_product_id IS NULL THEN
    RAISE NOTICE '沒有找到商品，無法測試';
    RETURN;
  END IF;

  -- 獲取當前庫存
  SELECT stock INTO old_stock FROM products WHERE id = test_product_id;
  RAISE NOTICE '測試商品 ID: %', test_product_id;
  RAISE NOTICE '測試前庫存: %', old_stock;

  -- 插入一條測試庫存日誌（+10）
  INSERT INTO inventory_logs (product_id, ref_type, ref_id, qty_change, memo)
  VALUES (test_product_id, 'test', test_product_id, 10, '測試增加庫存');

  -- 獲取更新後的庫存
  SELECT stock INTO new_stock FROM products WHERE id = test_product_id;
  RAISE NOTICE '測試後庫存: %', new_stock;
  RAISE NOTICE '預期變化: +10, 實際變化: %', new_stock - old_stock;

  -- 回滾測試（-10）
  INSERT INTO inventory_logs (product_id, ref_type, ref_id, qty_change, memo)
  VALUES (test_product_id, 'test', test_product_id, -10, '測試回滾庫存');

  -- 獲取回滾後的庫存
  SELECT stock INTO new_stock FROM products WHERE id = test_product_id;
  RAISE NOTICE '回滾後庫存: %', new_stock;

  IF new_stock = old_stock THEN
    RAISE NOTICE '✅ Trigger 工作正常！';
  ELSE
    RAISE NOTICE '❌ Trigger 異常！庫存應該是 % 但實際是 %', old_stock, new_stock;
  END IF;
END $$;

-- 4. 清理測試數據
DELETE FROM inventory_logs WHERE ref_type = 'test';

SELECT '測試完成' as message;
