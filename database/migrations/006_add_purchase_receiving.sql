-- 添加进货收货管理功能
-- Migration: 006_add_purchase_receiving
-- Date: 2026-01-12
-- Purpose: 将进货管理改造成类似销售管理的付款和收货模式

-- ============================================================
-- 1. 为 purchases 表添加付款和收货相关字段
-- ============================================================

-- 添加 is_paid 字段（如果不存在）
ALTER TABLE purchases
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;

-- 添加收货状态字段
ALTER TABLE purchases
ADD COLUMN IF NOT EXISTS receiving_status TEXT DEFAULT 'none' CHECK (receiving_status IN ('none', 'partial', 'completed'));

-- 添加注释
COMMENT ON COLUMN purchases.is_paid IS '是否已付款';
COMMENT ON COLUMN purchases.receiving_status IS '收货状态：none=未收货, partial=部分收货, completed=全部收货';

-- ============================================================
-- 2. 为 purchase_items 表添加收货相关字段
-- ============================================================

-- 添加已收货数量字段
ALTER TABLE purchase_items
ADD COLUMN IF NOT EXISTS received_quantity INTEGER DEFAULT 0 NOT NULL;

-- 添加收货状态字段（方便查询）
ALTER TABLE purchase_items
ADD COLUMN IF NOT EXISTS is_received BOOLEAN DEFAULT false;

-- 添加注释
COMMENT ON COLUMN purchase_items.received_quantity IS '已收货数量';
COMMENT ON COLUMN purchase_items.is_received IS '是否已全部收货（received_quantity >= quantity）';

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_purchase_items_is_received ON purchase_items(is_received);

-- ============================================================
-- 3. 创建收货记录表（类似 deliveries）
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_receivings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_no TEXT UNIQUE NOT NULL,
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  receiving_date TIMESTAMP WITH TIME ZONE,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE purchase_receivings IS '进货收货记录表';
COMMENT ON COLUMN purchase_receivings.receiving_no IS '收货单号（如：R0001）';
COMMENT ON COLUMN purchase_receivings.receiving_date IS '收货日期';

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_purchase_receivings_purchase_id ON purchase_receivings(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receivings_receiving_date ON purchase_receivings(receiving_date DESC);

-- ============================================================
-- 4. 创建收货明细表（类似 delivery_items）
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_receiving_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_id UUID NOT NULL REFERENCES purchase_receivings(id) ON DELETE CASCADE,
  purchase_item_id UUID NOT NULL REFERENCES purchase_items(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE purchase_receiving_items IS '进货收货明细表';
COMMENT ON COLUMN purchase_receiving_items.quantity IS '本次收货数量';

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_purchase_receiving_items_receiving_id ON purchase_receiving_items(receiving_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receiving_items_purchase_item_id ON purchase_receiving_items(purchase_item_id);

-- ============================================================
-- 5. 创建触发器：收货时自动增加库存
-- ============================================================
CREATE OR REPLACE FUNCTION update_stock_on_receiving()
RETURNS TRIGGER AS $$
BEGIN
  -- 增加库存（收货）
  UPDATE products
  SET stock = stock + NEW.quantity
  WHERE id = NEW.product_id;

  -- 记录库存日志
  INSERT INTO inventory_logs (
    product_id,
    ref_type,
    ref_id,
    qty_change,
    memo
  ) VALUES (
    NEW.product_id,
    'purchase_receiving',
    NEW.receiving_id::text,
    NEW.quantity,
    '进货收货入库'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器
DROP TRIGGER IF EXISTS purchase_receiving_update_stock ON purchase_receiving_items;
CREATE TRIGGER purchase_receiving_update_stock
AFTER INSERT ON purchase_receiving_items
FOR EACH ROW
EXECUTE FUNCTION update_stock_on_receiving();

-- ============================================================
-- 6. 创建触发器：更新 purchase_items 的收货数量
-- ============================================================
CREATE OR REPLACE FUNCTION update_purchase_item_received_quantity()
RETURNS TRIGGER AS $$
BEGIN
  -- 更新 purchase_item 的已收货数量
  UPDATE purchase_items
  SET
    received_quantity = received_quantity + NEW.quantity,
    is_received = (received_quantity + NEW.quantity >= quantity)
  WHERE id = NEW.purchase_item_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器
DROP TRIGGER IF EXISTS update_received_quantity ON purchase_receiving_items;
CREATE TRIGGER update_received_quantity
AFTER INSERT ON purchase_receiving_items
FOR EACH ROW
EXECUTE FUNCTION update_purchase_item_received_quantity();

-- ============================================================
-- 7. 创建触发器：更新 purchases 的收货状态
-- ============================================================
CREATE OR REPLACE FUNCTION update_purchase_receiving_status()
RETURNS TRIGGER AS $$
DECLARE
  v_purchase_id UUID;
  v_total_items INTEGER;
  v_fully_received_items INTEGER;
  v_partially_received_items INTEGER;
BEGIN
  -- 获取该 purchase_item 所属的 purchase_id
  SELECT purchase_id INTO v_purchase_id
  FROM purchase_items
  WHERE id = NEW.purchase_item_id;

  -- 统计该进货单的所有品项
  SELECT
    COUNT(*) INTO v_total_items
  FROM purchase_items
  WHERE purchase_id = v_purchase_id;

  -- 统计已完全收货的品项
  SELECT
    COUNT(*) INTO v_fully_received_items
  FROM purchase_items
  WHERE purchase_id = v_purchase_id
    AND is_received = true;

  -- 统计部分收货的品项
  SELECT
    COUNT(*) INTO v_partially_received_items
  FROM purchase_items
  WHERE purchase_id = v_purchase_id
    AND received_quantity > 0
    AND is_received = false;

  -- 更新 purchase 的收货状态
  IF v_fully_received_items = v_total_items THEN
    -- 全部收货
    UPDATE purchases
    SET receiving_status = 'completed'
    WHERE id = v_purchase_id;
  ELSIF v_fully_received_items > 0 OR v_partially_received_items > 0 THEN
    -- 部分收货
    UPDATE purchases
    SET receiving_status = 'partial'
    WHERE id = v_purchase_id;
  ELSE
    -- 未收货
    UPDATE purchases
    SET receiving_status = 'none'
    WHERE id = v_purchase_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器
DROP TRIGGER IF EXISTS update_purchase_status ON purchase_receiving_items;
CREATE TRIGGER update_purchase_status
AFTER INSERT ON purchase_receiving_items
FOR EACH ROW
EXECUTE FUNCTION update_purchase_receiving_status();

-- ============================================================
-- 8. 迁移现有数据：将已确认的进货单标记为已收货
-- ============================================================
DO $$
BEGIN
  -- 将所有已确认的进货单标记为已付款和已收货
  UPDATE purchases
  SET
    is_paid = true,
    receiving_status = 'completed'
  WHERE status = 'confirmed';

  -- 将所有已确认进货单的明细标记为已收货
  UPDATE purchase_items
  SET
    received_quantity = quantity,
    is_received = true
  WHERE purchase_id IN (
    SELECT id FROM purchases WHERE status = 'confirmed'
  );

  RAISE NOTICE '现有进货数据迁移完成！';
END $$;
