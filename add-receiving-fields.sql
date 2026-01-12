-- 为 purchase_items 表添加收货相关字段（如果不存在）

-- 添加 received_quantity 字段
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_items' AND column_name = 'received_quantity'
  ) THEN
    ALTER TABLE purchase_items
    ADD COLUMN received_quantity integer DEFAULT 0 NOT NULL;

    COMMENT ON COLUMN purchase_items.received_quantity IS '已收货数量';
  END IF;
END $$;

-- 添加 is_received 字段
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_items' AND column_name = 'is_received'
  ) THEN
    ALTER TABLE purchase_items
    ADD COLUMN is_received boolean DEFAULT false NOT NULL;

    COMMENT ON COLUMN purchase_items.is_received IS '是否已完全收货';
  END IF;
END $$;

-- 为已有的旧数据设置默认值
-- 如果你想把现有的进货单都标记为已收货，取消下面的注释
-- UPDATE purchase_items SET received_quantity = quantity, is_received = true WHERE received_quantity = 0;

SELECT 'purchase_items 表已成功添加收货字段' as message;
