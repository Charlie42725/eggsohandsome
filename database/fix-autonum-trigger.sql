-- ============================================
-- 修正自動編號 Trigger 的短路求值問題
-- 執行此檔案前請先備份資料！
-- ============================================

-- ============================================
-- 方案 A：使用巢狀 IF 避免短路求值問題
-- ============================================

-- Step 1: 刪除舊的 triggers（如果存在）
DROP TRIGGER IF EXISTS trg_sales_autonum ON sales;
DROP TRIGGER IF EXISTS trg_purchases_autonum ON purchases;
DROP TRIGGER IF EXISTS trg_sales_returns_autonum ON sales_returns;
DROP TRIGGER IF EXISTS trg_purchase_returns_autonum ON purchase_returns;

-- Step 2: 刪除舊的 function（如果存在）
DROP FUNCTION IF EXISTS fn_set_doc_no();

-- Step 3: 建立/更新自動編號序列函數
CREATE OR REPLACE FUNCTION fn_next_doc_no(prefix TEXT)
RETURNS TEXT AS $$
DECLARE
  v_today TEXT := to_char(CURRENT_DATE, 'YYYYMMDD');
  v_seq_name TEXT := format('%s_%s_seq', prefix, v_today);
  v_exists BOOLEAN;
  v_val BIGINT;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname = v_seq_name) INTO v_exists;
  IF NOT v_exists THEN
    EXECUTE format('CREATE SEQUENCE %I START 1', v_seq_name);
  END IF;

  EXECUTE format('SELECT nextval(%L)', v_seq_name) INTO v_val;
  RETURN v_today || '-' || lpad(v_val::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Step 4: 建立修正版的自動編號函數（使用巢狀 IF）
CREATE OR REPLACE FUNCTION fn_set_doc_no()
RETURNS TRIGGER AS $$
BEGIN
  -- 使用巢狀 IF 確保不會評估不存在的欄位
  IF TG_TABLE_NAME = 'sales' THEN
    IF NEW.sale_no IS NULL OR NEW.sale_no = '' THEN
      NEW.sale_no := fn_next_doc_no('SO');
    END IF;

  ELSIF TG_TABLE_NAME = 'purchases' THEN
    IF NEW.purchase_no IS NULL OR NEW.purchase_no = '' THEN
      NEW.purchase_no := fn_next_doc_no('PO');
    END IF;

  ELSIF TG_TABLE_NAME = 'sales_returns' THEN
    IF NEW.return_no IS NULL OR NEW.return_no = '' THEN
      NEW.return_no := fn_next_doc_no('SRT');
    END IF;

  ELSIF TG_TABLE_NAME = 'purchase_returns' THEN
    IF NEW.return_no IS NULL OR NEW.return_no = '' THEN
      NEW.return_no := fn_next_doc_no('PRT');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: 重新建立 triggers
CREATE TRIGGER trg_sales_autonum
BEFORE INSERT ON sales
FOR EACH ROW EXECUTE FUNCTION fn_set_doc_no();

CREATE TRIGGER trg_purchases_autonum
BEFORE INSERT ON purchases
FOR EACH ROW EXECUTE FUNCTION fn_set_doc_no();

-- 如果有 sales_returns 和 purchase_returns 表，也建立對應的 triggers
-- CREATE TRIGGER trg_sales_returns_autonum
-- BEFORE INSERT ON sales_returns
-- FOR EACH ROW EXECUTE FUNCTION fn_set_doc_no();

-- CREATE TRIGGER trg_purchase_returns_autonum
-- BEFORE INSERT ON purchase_returns
-- FOR EACH ROW EXECUTE FUNCTION fn_set_doc_no();

-- ============================================
-- 方案 B：完全移除自動編號 Trigger（推薦）
-- 因為專案已在應用層處理編號生成
-- ============================================

-- 如果你想使用方案 B，請註解掉上面的 Step 3-5，
-- 並執行以下指令：

-- DROP TRIGGER IF EXISTS trg_sales_autonum ON sales;
-- DROP TRIGGER IF EXISTS trg_purchases_autonum ON purchases;
-- DROP FUNCTION IF EXISTS fn_set_doc_no();
-- DROP FUNCTION IF EXISTS fn_next_doc_no(TEXT);

-- ============================================
-- 執行完畢後請測試
-- ============================================
