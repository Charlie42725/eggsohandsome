# ToyFlow ERP - 設置指南

## M1 階段已完成功能

### ✅ 已實現的功能
1. **商品管理**
   - 新增商品（品號、名稱、條碼、售價、成本）
   - 商品列表（搜尋、篩選）
   - 上架/下架切換

2. **POS 收銀**
   - 條碼掃描/關鍵字搜尋
   - 購物車管理
   - 快速建檔（找不到商品時）
   - 多種付款方式（現金、刷卡、轉帳、貨到付款）
   - 庫存檢查（防止超賣）

3. **進貨管理**
   - 新增進貨單
   - 選擇廠商
   - 商品搜尋加入
   - 自動更新庫存

4. **銷售記錄**
   - 查看所有銷售單
   - 付款狀態顯示

### API Endpoints

#### Products
- `GET /api/products` - 商品列表（支援搜尋和篩選）
- `POST /api/products` - 新增商品
- `GET /api/products/:id` - 取得商品詳情
- `PATCH /api/products/:id` - 更新商品
- `GET /api/products/search` - 快速搜尋（支援條碼和關鍵字）

#### Sales
- `GET /api/sales` - 銷售單列表
- `POST /api/sales` - 建立銷售單（含庫存檢查）
- `GET /api/sales/:id` - 取得銷售單詳情（含明細）
- `DELETE /api/sales/:id` - 刪除/取消銷售單

#### Purchases
- `GET /api/purchases` - 進貨單列表
- `POST /api/purchases` - 建立進貨單
- `GET /api/purchases/:id` - 取得進貨單詳情（含明細）

#### Vendors
- `GET /api/vendors` - 廠商列表

## 資料庫設置

### 1. 在 Supabase 執行以下 SQL 建立種子資料

```sql
-- 建立測試廠商
INSERT INTO vendors (vendor_code, vendor_name, phone, is_active) VALUES
('V0001', '測試供應商A', '02-1234-5678', true),
('V0002', '測試供應商B', '02-8765-4321', true);

-- 建立測試客戶
INSERT INTO customers (customer_code, customer_name, phone, is_active) VALUES
('C0001', '測試客戶A', '0912-345-678', true),
('C0002', '測試客戶B', '0987-654-321', true);

-- 建立測試商品
INSERT INTO products (item_code, barcode, name, unit, cost, price, stock, avg_cost, is_active) VALUES
('P0001', '1234567890001', '測試商品A', '件', 100, 180, 0, 0, true),
('P0002', '1234567890002', '測試商品B', '組', 200, 350, 0, 0, true),
('P0003', '1234567890003', '測試商品C', '盒', 50, 99, 0, 0, true);
```

### 2. 重要：設置資料庫觸發器

為了讓庫存自動更新，你需要在 Supabase 建立以下觸發器：

```sql
-- 銷售確認時的庫存扣減觸發器
CREATE OR REPLACE FUNCTION handle_sale_confirmed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status = 'draft' THEN
    -- 扣減庫存
    UPDATE products p
    SET stock = stock - si.quantity,
        avg_cost = CASE
          WHEN stock > 0 THEN avg_cost
          ELSE cost
        END
    FROM sale_items si
    WHERE si.sale_id = NEW.id AND p.id = si.product_id;

    -- 記錄庫存日誌
    INSERT INTO inventory_logs (product_id, ref_type, ref_id, qty_change, memo)
    SELECT si.product_id, 'sale', NEW.id, -si.quantity, '銷售扣庫'
    FROM sale_items si
    WHERE si.sale_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sale_confirmed
AFTER UPDATE ON sales
FOR EACH ROW
EXECUTE FUNCTION handle_sale_confirmed();

-- 進貨確認時的庫存增加觸發器
CREATE OR REPLACE FUNCTION handle_purchase_confirmed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status = 'draft' THEN
    -- 增加庫存並更新平均成本
    UPDATE products p
    SET
      stock = stock + pi.quantity,
      avg_cost = CASE
        WHEN stock = 0 THEN pi.cost
        ELSE ((avg_cost * stock) + (pi.cost * pi.quantity)) / (stock + pi.quantity)
      END
    FROM purchase_items pi
    WHERE pi.purchase_id = NEW.id AND p.id = pi.product_id;

    -- 記錄庫存日誌
    INSERT INTO inventory_logs (product_id, ref_type, ref_id, qty_change, unit_cost, memo)
    SELECT pi.product_id, 'purchase', NEW.id, pi.quantity, pi.cost, '進貨入庫'
    FROM purchase_items pi
    WHERE pi.purchase_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_purchase_confirmed
AFTER UPDATE ON purchases
FOR EACH ROW
EXECUTE FUNCTION handle_purchase_confirmed();
```

## 測試流程

### 測試場景 1：完整的進銷流程

1. **新增商品**
   - 前往 http://localhost:3000/products
   - 點擊「新增商品」
   - 填入資料後送出

2. **進貨**
   - 前往 http://localhost:3000/purchases/new
   - 選擇廠商（V0001）
   - 搜尋並加入商品
   - 輸入進貨數量和成本
   - 確認進貨
   - ✅ 檢查：商品庫存應該增加

3. **POS 銷售**
   - 前往 http://localhost:3000/pos
   - 輸入商品條碼或名稱搜尋
   - 加入購物車
   - 選擇付款方式
   - 確認結帳
   - ✅ 檢查：商品庫存應該減少

4. **查看銷售記錄**
   - 前往 http://localhost:3000/sales
   - 確認剛才的銷售單出現在列表中

### 測試場景 2：庫存不足檢查

1. 在 POS 頁面嘗試銷售超過庫存數量的商品
2. ✅ 應該顯示錯誤訊息：「庫存不足」

### 測試場景 3：快速建檔

1. 在 POS 頁面輸入一個不存在的條碼
2. ✅ 應該彈出「快速建檔」對話框
3. 填入商品名稱和售價
4. 點擊「儲存並加入購物車」
5. ✅ 商品應該自動加入購物車

## 開發伺服器

```bash
npm run dev
```

伺服器將運行在 http://localhost:3000

## 下一步（M2 階段）

- [ ] 應收帳款管理（/ar）
- [ ] 應付帳款管理（/ap）
- [ ] 收付款功能（/settlements）
- [ ] 儀表板與 KPI（/dashboard）
- [ ] 報表功能
