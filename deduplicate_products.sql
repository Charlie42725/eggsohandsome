-- 這是用於合併重複商品並保留一筆資料的 SQL 指令
-- 將會執行以下動作：
-- 1. 找出所有「名稱」與「條碼」皆相同的重複群組
-- 2. 在每一組中，保留「最早建立」的那一筆 (Created At 最早)
-- 3. 將其他重複商品 (將被刪除者) 的關聯資料 (銷售紀錄、進貨紀錄) 指向保留的那一筆
-- 4. 刪除多餘的商品資料

DO $$
DECLARE
    -- 定義要處理的重複群組游標
    duplicate_groups CURSOR FOR 
        SELECT name, barcode, array_agg(id ORDER BY created_at ASC) as ids
        FROM products
        WHERE barcode IS NOT NULL AND barcode != ''
        GROUP BY name, barcode
        HAVING count(*) > 1;
        
    group_record RECORD;
    keep_id UUID;
    remove_id UUID;
    i INT;
BEGIN
    -- 走訪每一組重複資料
    FOR group_record IN duplicate_groups LOOP
        -- 取出陣列中第一個 ID 作為保留對象 (因為已按 created_at ASC 排序，所以是老資料)
        keep_id := group_record.ids[1];
        
        RAISE NOTICE '正在處理商品: % (條碼: %), 保留 ID: %', group_record.name, group_record.barcode, keep_id;
        
        -- 走訪剩餘的 ID (要被刪除的)
        FOR i IN 2 .. array_length(group_record.ids, 1) LOOP
            remove_id := group_record.ids[i];
            
            -- 1. 更新 Sale Items (銷售明細)
            -- 將原本指向 remove_id 的紀錄，改指到 keep_id
            UPDATE sale_items 
            SET product_id = keep_id 
            WHERE product_id = remove_id;
            
            -- 2. 更新 Purchase Items (進貨明細)
            UPDATE purchase_items 
            SET product_id = keep_id 
            WHERE product_id = remove_id;
            
            -- 3. 更新 Inventory Logs (庫存異動紀錄)
            UPDATE inventory_logs 
            SET product_id = keep_id 
            WHERE product_id = remove_id;

            -- 4. 刪除該重複商品
            DELETE FROM products WHERE id = remove_id;
            
            RAISE NOTICE '  - 已移除重複 ID: %, 並轉移關聯資料。', remove_id;
        END LOOP;
    END LOOP;
END $$;
