-- 修复进货触发器：添加 vendor_code 的 null 检查
-- 在 Supabase SQL Editor 执行此文件

CREATE OR REPLACE FUNCTION handle_purchase_confirmed()
RETURNS TRIGGER AS $$
BEGIN
  -- 只在狀態從 draft 變為 confirmed 時執行
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status = 'draft') THEN

    -- 增加庫存並更新移動平均成本
    UPDATE products p
    SET
      stock = stock + pi.quantity,
      avg_cost = CASE
        -- 如果原本庫存為 0，直接使用新成本
        WHEN stock = 0 THEN pi.cost
        -- 否則計算加權平均成本
        ELSE ((avg_cost * stock) + (pi.cost * pi.quantity)) / (stock + pi.quantity)
      END
    FROM purchase_items pi
    WHERE pi.purchase_id = NEW.id AND p.id = pi.product_id;

    -- 記錄庫存日誌
    INSERT INTO inventory_logs (product_id, ref_type, ref_id, ref_item_id, qty_change, unit_cost, memo)
    SELECT
      pi.product_id,
      'purchase',
      NEW.id,
      pi.id,
      pi.quantity,
      pi.cost,
      '進貨入庫: ' || NEW.purchase_no
    FROM purchase_items pi
    WHERE pi.purchase_id = NEW.id;

    -- 建立應付帳款（只有当 vendor_code 不为空时）
    IF NEW.vendor_code IS NOT NULL THEN
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
        'vendor',
        NEW.vendor_code,
        'purchase',
        NEW.id,
        'AP',
        NEW.total,
        NEW.purchase_date + INTERVAL '30 days',
        'unpaid'
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
