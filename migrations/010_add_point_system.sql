-- 點數計劃表（大娃、盲盒等）
CREATE TABLE IF NOT EXISTS point_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,                          -- 計劃名稱（大娃、盲盒）
    spend_per_point INTEGER NOT NULL,            -- 每多少元得1點（4000, 1000）
    cost_per_point DECIMAL(10,2) NOT NULL,       -- 每點預估成本（用最高方案計算）
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 點數兌換方案表
CREATE TABLE IF NOT EXISTS point_redemption_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES point_programs(id) ON DELETE CASCADE,
    points_required INTEGER NOT NULL,            -- 需要點數（12, 24）
    reward_value DECIMAL(10,2) NOT NULL,         -- 兌換價值（購物金金額）
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 客戶點數餘額表
CREATE TABLE IF NOT EXISTS customer_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES point_programs(id) ON DELETE CASCADE,
    points INTEGER NOT NULL DEFAULT 0,           -- 當前點數
    total_earned INTEGER NOT NULL DEFAULT 0,     -- 累計獲得
    total_redeemed INTEGER NOT NULL DEFAULT 0,   -- 累計兌換
    estimated_cost DECIMAL(12,2) NOT NULL DEFAULT 0, -- 累計預估成本
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(customer_id, program_id)
);

-- 點數變動日誌
CREATE TABLE IF NOT EXISTS point_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES point_programs(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    change_type TEXT NOT NULL CHECK (change_type IN ('earn', 'redeem', 'expire', 'adjust')),
    points_change INTEGER NOT NULL,              -- 點數變動（可正可負）
    cost_amount DECIMAL(12,2) NOT NULL DEFAULT 0, -- 成本金額
    sale_amount DECIMAL(12,2),                   -- 消費金額（earn時記錄）
    reward_value DECIMAL(12,2),                  -- 兌換價值（redeem時記錄）
    tier_id UUID REFERENCES point_redemption_tiers(id), -- 使用的兌換方案
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_customer_points_customer ON customer_points(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_points_program ON customer_points(program_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_customer ON point_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_sale ON point_logs(sale_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_created ON point_logs(created_at DESC);

-- 在 sales 表添加點數計劃欄位
ALTER TABLE sales ADD COLUMN IF NOT EXISTS point_program_id UUID REFERENCES point_programs(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS points_earned INTEGER DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS point_cost_estimated DECIMAL(12,2) DEFAULT 0;

-- 插入預設點數計劃
INSERT INTO point_programs (name, spend_per_point, cost_per_point) VALUES
    ('大娃', 4000, 166.67),  -- 使用24點方案的成本：4000/24 = 166.67
    ('盲盒', 1000, 50.00)    -- 使用24點方案的成本：1200/24 = 50
ON CONFLICT DO NOTHING;

-- 插入兌換方案
INSERT INTO point_redemption_tiers (program_id, points_required, reward_value)
SELECT id, 12, 1500 FROM point_programs WHERE name = '大娃'
ON CONFLICT DO NOTHING;

INSERT INTO point_redemption_tiers (program_id, points_required, reward_value)
SELECT id, 24, 4000 FROM point_programs WHERE name = '大娃'
ON CONFLICT DO NOTHING;

INSERT INTO point_redemption_tiers (program_id, points_required, reward_value)
SELECT id, 12, 300 FROM point_programs WHERE name = '盲盒'
ON CONFLICT DO NOTHING;

INSERT INTO point_redemption_tiers (program_id, points_required, reward_value)
SELECT id, 24, 1200 FROM point_programs WHERE name = '盲盒'
ON CONFLICT DO NOTHING;
