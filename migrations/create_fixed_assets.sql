-- Migration: create_fixed_assets_table
-- 建立固定資產資料表，用於記錄設備、開店資本等固定成本及攤提
-- 執行方式：在 Supabase SQL Editor 中執行此腳本

-- ============================================================
-- 步驟 1：建立固定資產表
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_name VARCHAR(255) NOT NULL,           -- 資產名稱
  category VARCHAR(50) NOT NULL DEFAULT 'equipment', -- 分類
  purchase_date DATE NOT NULL,                -- 購入日期
  purchase_amount DECIMAL(12, 2) NOT NULL,    -- 購入金額
  residual_value DECIMAL(12, 2) DEFAULT 0,    -- 殘值（攤提完剩餘價值）
  useful_life_months INT NOT NULL,            -- 使用年限（月數）
  monthly_depreciation DECIMAL(12, 2),        -- 每月攤提金額（自動計算）
  depreciation_start_date DATE,               -- 開始攤提日期
  status VARCHAR(20) DEFAULT 'active',        -- active/disposed/fully_depreciated
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 步驟 2：建立索引
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_fixed_assets_category ON public.fixed_assets(category);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON public.fixed_assets(status);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_purchase_date ON public.fixed_assets(purchase_date);

-- ============================================================
-- 步驟 3：建立自動計算觸發器
-- ============================================================

-- 計算每月攤提金額的函數
CREATE OR REPLACE FUNCTION calc_monthly_depreciation()
RETURNS TRIGGER AS $$
BEGIN
  -- 計算月攤提 = (購入金額 - 殘值) / 攤提月數
  NEW.monthly_depreciation := ROUND(
    (NEW.purchase_amount - COALESCE(NEW.residual_value, 0)) / NULLIF(NEW.useful_life_months, 0), 
    2
  );
  -- 如果沒有設定開始日期，預設為購入日期
  NEW.depreciation_start_date := COALESCE(NEW.depreciation_start_date, NEW.purchase_date);
  -- 更新時間
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 移除舊觸發器（如果存在）
DROP TRIGGER IF EXISTS trg_calc_depreciation ON public.fixed_assets;

-- 建立觸發器
CREATE TRIGGER trg_calc_depreciation
BEFORE INSERT OR UPDATE ON public.fixed_assets
FOR EACH ROW EXECUTE FUNCTION calc_monthly_depreciation();

-- ============================================================
-- 步驟 4：新增 CHECK 約束
-- ============================================================

ALTER TABLE public.fixed_assets 
ADD CONSTRAINT chk_fixed_assets_category 
CHECK (category IN ('equipment', 'furniture', 'renovation', 'deposit', 'startup', 'other'));

ALTER TABLE public.fixed_assets 
ADD CONSTRAINT chk_fixed_assets_status 
CHECK (status IN ('active', 'disposed', 'fully_depreciated'));

ALTER TABLE public.fixed_assets 
ADD CONSTRAINT chk_fixed_assets_amounts 
CHECK (purchase_amount >= 0 AND residual_value >= 0 AND useful_life_months > 0);

-- ============================================================
-- 步驟 5：啟用 RLS（Row Level Security）
-- ============================================================

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;

-- 允許所有已驗證用戶讀取
CREATE POLICY "Allow authenticated read" ON public.fixed_assets
  FOR SELECT TO authenticated USING (true);

-- 允許所有已驗證用戶寫入
CREATE POLICY "Allow authenticated write" ON public.fixed_assets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 驗證
-- ============================================================

SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'fixed_assets'
ORDER BY ordinal_position;
