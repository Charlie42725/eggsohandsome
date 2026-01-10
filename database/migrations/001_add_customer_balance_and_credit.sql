-- 为客户表添加购物金和信用额度字段
-- Migration: 001_add_customer_balance_and_credit
-- Date: 2026-01-10

-- 1. 添加 store_credit (购物金余额) 字段
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS store_credit NUMERIC(10, 2) DEFAULT 0 NOT NULL;

-- 2. 添加 credit_limit (信用额度) 字段
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(10, 2) DEFAULT 0 NOT NULL;

-- 3. 添加注释
COMMENT ON COLUMN customers.store_credit IS '购物金余额，可为负数（表示欠款）';
COMMENT ON COLUMN customers.credit_limit IS '信用额度上限（最大可欠款金额），0表示不允许欠款';

-- 4. 创建购物金交易记录表
CREATE TABLE IF NOT EXISTS customer_balance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code TEXT NOT NULL REFERENCES customers(customer_code) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  balance_before NUMERIC(10, 2) NOT NULL,
  balance_after NUMERIC(10, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('recharge', 'deduct', 'sale', 'refund', 'adjustment')),
  ref_type TEXT,  -- 关联类型：'sale', 'manual', etc.
  ref_id UUID,    -- 关联记录ID（如销售单ID）
  ref_no TEXT,    -- 关联单号（如销售单号）
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. 创建索引
CREATE INDEX IF NOT EXISTS idx_customer_balance_logs_customer_code ON customer_balance_logs(customer_code);
CREATE INDEX IF NOT EXISTS idx_customer_balance_logs_created_at ON customer_balance_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_balance_logs_type ON customer_balance_logs(type);
CREATE INDEX IF NOT EXISTS idx_customer_balance_logs_ref ON customer_balance_logs(ref_type, ref_id);

-- 6. 添加注释
COMMENT ON TABLE customer_balance_logs IS '客户购物金交易记录表';
COMMENT ON COLUMN customer_balance_logs.amount IS '交易金额，正数表示增加，负数表示减少';
COMMENT ON COLUMN customer_balance_logs.type IS '交易类型：recharge=充值, deduct=扣减, sale=销售消费, refund=退款, adjustment=人工调整';
COMMENT ON COLUMN customer_balance_logs.balance_before IS '交易前余额';
COMMENT ON COLUMN customer_balance_logs.balance_after IS '交易后余额';

-- 7. 创建触发器自动更新 updated_at
CREATE OR REPLACE FUNCTION update_customer_balance_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_balance_logs_updated_at
BEFORE UPDATE ON customer_balance_logs
FOR EACH ROW
EXECUTE FUNCTION update_customer_balance_logs_updated_at();
