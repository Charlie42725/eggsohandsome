-- 為 partner_accounts 表建立外鍵約束
-- 這樣 Supabase 才能正確查詢關聯的 customers 和 vendors 資料
-- 在 Supabase SQL Editor 執行此檔案

-- 注意：partner_accounts.partner_code 可以關聯到 customers.customer_code 或 vendors.vendor_code
-- 但 PostgreSQL 不支援條件式外鍵，所以我們需要分別處理

-- 方案：使用觸發器來驗證 partner_code 的有效性，而不是使用外鍵約束
-- 這樣 Supabase 的查詢就需要手動指定關聯欄位

-- 如果之前有建立過錯誤的外鍵，先刪除
ALTER TABLE partner_accounts
DROP CONSTRAINT IF EXISTS partner_accounts_partner_code_fkey;

-- 為了讓 Supabase 能夠查詢關聯，我們使用以下方法：
-- 1. 確保 customers.customer_code 和 vendors.vendor_code 是唯一的
ALTER TABLE customers ADD CONSTRAINT customers_customer_code_unique UNIQUE (customer_code);
ALTER TABLE vendors ADD CONSTRAINT vendors_vendor_code_unique UNIQUE (vendor_code);

-- 2. 為 partner_accounts 建立索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_partner_accounts_partner_code
ON partner_accounts(partner_code);

CREATE INDEX IF NOT EXISTS idx_partner_accounts_customer
ON partner_accounts(partner_code)
WHERE partner_type = 'customer';

CREATE INDEX IF NOT EXISTS idx_partner_accounts_vendor
ON partner_accounts(partner_code)
WHERE partner_type = 'vendor';

-- 3. 建立視圖來簡化查詢（可選）
CREATE OR REPLACE VIEW partner_accounts_with_details AS
SELECT
  pa.*,
  c.customer_name,
  c.phone as customer_phone,
  c.email as customer_email,
  v.vendor_name,
  v.contact_person as vendor_contact,
  v.phone as vendor_phone
FROM partner_accounts pa
LEFT JOIN customers c ON pa.partner_code = c.customer_code AND pa.partner_type = 'customer'
LEFT JOIN vendors v ON pa.partner_code = v.vendor_code AND pa.partner_type = 'vendor';

COMMENT ON VIEW partner_accounts_with_details IS '應收應付帳款明細視圖，包含客戶/廠商資訊';
