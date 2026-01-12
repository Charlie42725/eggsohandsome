-- 为 purchase_items 表添加收货字段（简化版）
ALTER TABLE purchase_items
ADD COLUMN IF NOT EXISTS received_quantity integer DEFAULT 0 NOT NULL;

ALTER TABLE purchase_items
ADD COLUMN IF NOT EXISTS is_received boolean DEFAULT false NOT NULL;

-- 添加注释
COMMENT ON COLUMN purchase_items.received_quantity IS '已收货数量';
COMMENT ON COLUMN purchase_items.is_received IS '是否已完全收货';

-- 查看结果
SELECT 'purchase_items 表已成功添加收货字段' as message;
