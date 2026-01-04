-- ToyFlow ERP - 資料庫觸發器
-- 在 Supabase SQL Editor 執行此檔案

-- ============================================
-- 1. 銷售確認時的庫存扣減與日誌記錄
-- ============================================
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

    -- 如果未收款，建立應收帳款
    IF NOT NEW.is_paid AND NEW.customer_code IS NOT NULL THEN
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

DROP TRIGGER IF EXISTS trigger_sale_confirmed ON sales;
CREATE TRIGGER trigger_sale_confirmed
AFTER INSERT OR UPDATE ON sales
FOR EACH ROW
EXECUTE FUNCTION handle_sale_confirmed();

-- ============================================
-- 2. 進貨確認時的庫存增加與成本計算
-- ============================================
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

    -- 建立應付帳款
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_purchase_confirmed ON purchases;
CREATE TRIGGER trigger_purchase_confirmed
AFTER INSERT OR UPDATE ON purchases
FOR EACH ROW
EXECUTE FUNCTION handle_purchase_confirmed();

-- ============================================
-- 3. 收付款時更新應收應付帳款
-- ============================================
CREATE OR REPLACE FUNCTION handle_settlement()
RETURNS TRIGGER AS $$
BEGIN
  -- 更新相關的應收/應付帳款
  UPDATE partner_accounts pa
  SET
    received_paid = received_paid + sa.amount,
    balance = amount - (received_paid + sa.amount),
    status = CASE
      WHEN amount <= (received_paid + sa.amount) THEN 'paid'
      WHEN received_paid + sa.amount > 0 THEN 'partial'
      ELSE 'unpaid'
    END,
    updated_at = NOW()
  FROM settlement_allocations sa
  WHERE sa.settlement_id = NEW.id AND pa.id = sa.partner_account_id;

  -- 記錄總帳
  INSERT INTO ledger (ref_type, ref_id, account_type, description, amount)
  VALUES (
    'settlement',
    NEW.id,
    CASE NEW.direction
      WHEN 'receipt' THEN 'asset'
      WHEN 'payment' THEN 'liability'
    END,
    CASE NEW.direction
      WHEN 'receipt' THEN '收款: ' || NEW.partner_code
      WHEN 'payment' THEN '付款: ' || NEW.partner_code
    END,
    NEW.amount
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_settlement ON settlements;
CREATE TRIGGER trigger_settlement
AFTER INSERT ON settlements
FOR EACH ROW
EXECUTE FUNCTION handle_settlement();

-- ============================================
-- 4. 自動更新 updated_at 時間戳
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 對需要的表格添加觸發器
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vendors_updated_at ON vendors;
CREATE TRIGGER update_vendors_updated_at
BEFORE UPDATE ON vendors
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sales_updated_at ON sales;
CREATE TRIGGER update_sales_updated_at
BEFORE UPDATE ON sales
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchases_updated_at ON purchases;
CREATE TRIGGER update_purchases_updated_at
BEFORE UPDATE ON purchases
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 完成！觸發器已設置完成
