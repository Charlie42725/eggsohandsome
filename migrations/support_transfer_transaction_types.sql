-- Migration: support_transfer_transaction_types
-- 為 account_transactions 表的 transaction_type 欄位增加轉帳相關的類型
-- 執行方式：在 Supabase SQL Editor 中執行此腳本

-- 1. 移除舊的檢查約束 (如果存在)
-- 注意：約束名稱可能是 account_transactions_transaction_type_check，但也可能不同。
-- 這裡假設是標準命名。如果失敗，請查詢 information_schema.table_constraints 確認名稱。

ALTER TABLE public.account_transactions 
DROP CONSTRAINT IF EXISTS account_transactions_transaction_type_check;

-- 2. 加入新的檢查約束，包含 transfer_out 和 transfer_in
ALTER TABLE public.account_transactions 
ADD CONSTRAINT account_transactions_transaction_type_check 
CHECK (transaction_type IN (
  'sale', 
  'expense', 
  'purchase_payment', 
  'customer_payment', 
  'adjustment', 
  'settlement', 
  'transfer_out', 
  'transfer_in'
));

-- 驗證
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'account_transactions_transaction_type_check';
