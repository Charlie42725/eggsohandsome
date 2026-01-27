-- 這是用於移除「商品名稱唯一性限制」的 SQL 指令
-- 請在 Supabase 的 SQL Editor 或您的資料庫管理工具中執行此指令

-- 嘗試移除 Unique Constraint
ALTER TABLE products DROP CONSTRAINT IF EXISTS "products_name_unique_when_no_barcode";

-- 如果上面執行失敗（顯示不存在），可能是以 Index 形式存在，請嘗試執行下面這行：
DROP INDEX IF EXISTS "products_name_unique_when_no_barcode";

-- 說明：
-- 執行後，系統將允許不同商品擁有相同的名稱（當沒有條碼時）。
--這符合您 "我要允許" 重複名稱的需求。
