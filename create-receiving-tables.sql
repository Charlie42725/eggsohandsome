-- 创建收货单表
CREATE TABLE IF NOT EXISTS purchase_receivings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_no text NOT NULL UNIQUE,
  purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  receiving_date timestamp with time zone NOT NULL DEFAULT now(),
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 创建收货明细表
CREATE TABLE IF NOT EXISTS purchase_receiving_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_id uuid NOT NULL REFERENCES purchase_receivings(id) ON DELETE CASCADE,
  purchase_item_id uuid NOT NULL REFERENCES purchase_items(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 为 purchase_items 表添加收货字段
ALTER TABLE purchase_items
ADD COLUMN IF NOT EXISTS received_quantity integer DEFAULT 0 NOT NULL;

ALTER TABLE purchase_items
ADD COLUMN IF NOT EXISTS is_received boolean DEFAULT false NOT NULL;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_purchase_receivings_purchase_id ON purchase_receivings(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receivings_date ON purchase_receivings(receiving_date);
CREATE INDEX IF NOT EXISTS idx_purchase_receiving_items_receiving_id ON purchase_receiving_items(receiving_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receiving_items_purchase_item_id ON purchase_receiving_items(purchase_item_id);

-- 添加注释
COMMENT ON TABLE purchase_receivings IS '进货收货单';
COMMENT ON TABLE purchase_receiving_items IS '进货收货明细';
COMMENT ON COLUMN purchase_items.received_quantity IS '已收货数量';
COMMENT ON COLUMN purchase_items.is_received IS '是否已完全收货';
