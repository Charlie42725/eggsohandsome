-- 為 purchases 表添加 is_paid 欄位
-- 在 Supabase SQL Editor 執行此檔案

-- 添加 is_paid 欄位（預設為 false，表示未付款）
ALTER TABLE purchases
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false NOT NULL;

-- 為現有記錄設定預設值
UPDATE purchases
SET is_paid = false
WHERE is_paid IS NULL;

COMMENT ON COLUMN purchases.is_paid IS '是否已付款：true=已付款（不產生應付帳款），false=未付款（產生應付帳款）';
