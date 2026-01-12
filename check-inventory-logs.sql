-- 檢查最近的庫存日誌
SELECT
  created_at,
  product_id,
  ref_type,
  ref_id,
  qty_change,
  memo
FROM inventory_logs
ORDER BY created_at DESC
LIMIT 20;

-- 檢查是否有 purchase_delete 類型的日誌
SELECT
  created_at,
  product_id,
  ref_type,
  qty_change,
  memo
FROM inventory_logs
WHERE ref_type IN ('purchase_delete', 'purchase_item_delete')
ORDER BY created_at DESC
LIMIT 10;
