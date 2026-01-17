-- 更新 fixed_assets 的 category 約束，使用正式會計科目
-- 在 Supabase SQL Editor 中執行

-- 步驟 1：先移除舊的約束
ALTER TABLE public.fixed_assets DROP CONSTRAINT IF EXISTS chk_fixed_assets_category;

-- 步驟 2：先遷移舊資料（如果有的話）
UPDATE public.fixed_assets SET category = 'machinery' WHERE category = 'equipment';
UPDATE public.fixed_assets SET category = 'office' WHERE category = 'furniture';
UPDATE public.fixed_assets SET category = 'leasehold' WHERE category = 'renovation';
UPDATE public.fixed_assets SET category = 'other' WHERE category = 'startup';
UPDATE public.fixed_assets SET category = 'other' WHERE category = 'deposit';

-- 步驟 3：新增新的約束
ALTER TABLE public.fixed_assets 
ADD CONSTRAINT chk_fixed_assets_category 
CHECK (category IN ('machinery', 'transport', 'office', 'computer', 'leasehold', 'other'));

-- 步驟 4：更新預設值
ALTER TABLE public.fixed_assets ALTER COLUMN category SET DEFAULT 'machinery';
