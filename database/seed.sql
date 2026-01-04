-- ToyFlow ERP - 種子資料
-- 在 Supabase SQL Editor 執行此檔案

-- 1. 建立測試廠商
INSERT INTO vendors (vendor_code, vendor_name, phone, email, is_active) VALUES
('V0001', '測試供應商A', '02-1234-5678', 'vendora@example.com', true),
('V0002', '測試供應商B', '02-8765-4321', 'vendorb@example.com', true),
('V0003', '測試供應商C', '03-1111-2222', 'vendorc@example.com', true);

-- 2. 建立測試客戶
INSERT INTO customers (customer_code, customer_name, phone, email, payment_method, is_active) VALUES
('C0001', '測試客戶A', '0912-345-678', 'customera@example.com', 'cash', true),
('C0002', '測試客戶B', '0987-654-321', 'customerb@example.com', 'card', true),
('C0003', '散客', '0900-000-000', null, 'cash', true);

-- 3. 建立測試商品
INSERT INTO products (item_code, barcode, name, unit, cost, price, stock, avg_cost, allow_negative, is_active, tags) VALUES
('P0001', '1234567890001', '測試商品A', '件', 100, 180, 0, 0, false, true, '["熱銷", "新品"]'),
('P0002', '1234567890002', '測試商品B', '組', 200, 350, 0, 0, false, true, '["促銷"]'),
('P0003', '1234567890003', '測試商品C', '盒', 50, 99, 0, 0, false, true, '[]'),
('P0004', '1234567890004', '測試商品D', '件', 150, 280, 0, 0, true, true, '["允許負庫存"]'),
('P0005', '1234567890005', '測試商品E', '包', 80, 150, 0, 0, false, true, '[]');

-- 4. 建立店鋪資訊（如果需要）
INSERT INTO store_info (name, owner_name, phone, email, default_tax_rate) VALUES
('測試商店', '店長名稱', '02-1234-5678', 'store@example.com', 0.05);

-- 完成！
-- 接下來可以：
-- 1. 使用進貨功能建立進貨單，增加商品庫存
-- 2. 使用 POS 功能進行銷售測試
