-- 修復銷售應收帳款觸發器
-- 問題：散客（customer_code 為空）未收款時會嘗試建立應收帳款，導致 partner_code null 錯誤
-- 解決：只有當 customer_code 不為 NULL 且不為空字串時才建立應收帳款
-- 在 Supabase SQL Editor 執行此檔案

CREATE OR REPLACE FUNCTION handle_sale_confirmed()
RETURNS TRIGGER AS $$
BEGIN
  -- 只在狀態從 draft 變為 confirmed 時執行
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status = 'draft') THEN

    -- 扣減庫存並記錄成本
    UPDATE products p
    SET stock = stock - si.quantity
    FROM sale_items si
    WHERE si.sale_id = NEW.id AND p.id = si.product_id;

    -- 記錄庫存日誌（使用當時的平均成本）
    INSERT INTO inventory_logs (product_id, ref_type, ref_id, ref_item_id, qty_change, unit_cost, memo)
    SELECT
      si.product_id,
      'sale',
      NEW.id,
      si.id,
      -si.quantity,
      p.avg_cost,
      '銷售扣庫: ' || NEW.sale_no
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    WHERE si.sale_id = NEW.id;

    -- 如果未收款且有客戶代碼，建立應收帳款（散客不建立應收帳款）
    IF NOT NEW.is_paid AND NEW.customer_code IS NOT NULL AND NEW.customer_code != '' THEN
      INSERT INTO partner_accounts (
        partner_type,
        partner_code,
        ref_type,
        ref_id,
        direction,
        amount,
        due_date,
        status
      ) VALUES (
        'customer',
        NEW.customer_code,
        'sale',
        NEW.id,
        'AR',
        NEW.total,
        NEW.sale_date + INTERVAL '30 days',
        'unpaid'
      );
    END IF;

  END IF;

  -- 銷售取消時回滾庫存
  IF NEW.status = 'cancelled' AND OLD.status = 'confirmed' THEN

    -- 回補庫存
    UPDATE products p
    SET stock = stock + si.quantity
    FROM sale_items si
    WHERE si.sale_id = NEW.id AND p.id = si.product_id;

    -- 記錄庫存日誌
    INSERT INTO inventory_logs (product_id, ref_type, ref_id, ref_item_id, qty_change, memo)
    SELECT
      si.product_id,
      'sale',
      NEW.id,
      si.id,
      si.quantity,
      '銷售取消回補: ' || NEW.sale_no
    FROM sale_items si
    WHERE si.sale_id = NEW.id;

    -- 刪除應收帳款
    DELETE FROM partner_accounts
    WHERE ref_type = 'sale' AND ref_id = NEW.id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
