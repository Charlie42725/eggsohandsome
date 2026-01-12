-- 創建 trigger 函數：當插入 inventory_logs 時自動更新 products.stock
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

-- 創建 trigger：在插入 inventory_logs 後執行
DROP TRIGGER IF EXISTS trigger_update_product_stock ON inventory_logs;

CREATE TRIGGER trigger_update_product_stock
  AFTER INSERT ON inventory_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_product_stock_from_log();

-- 測試說明
COMMENT ON FUNCTION update_product_stock_from_log IS '當插入 inventory_logs 時自動更新 products.stock';

SELECT 'Trigger 創建成功！現在插入 inventory_logs 會自動更新商品庫存' as message;
