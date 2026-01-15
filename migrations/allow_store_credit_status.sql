-- 更新 sales 表以支援 store_credit 和 refunded 狀態
-- 
-- 步驟 1: 刪除舊的 CHECK 約束
-- 步驟 2: 新增包含 store_credit 和 refunded 的 CHECK 約束
-- 步驟 3: 更新 fn_guard_status_transition 函數

-- 1. 刪除舊的 CHECK 約束
ALTER TABLE sales DROP CONSTRAINT IF EXISTS chk_sale_status;

-- 2. 新增包含新狀態的 CHECK 約束
ALTER TABLE sales ADD CONSTRAINT chk_sale_status 
CHECK (status IN ('draft', 'confirmed', 'cancelled', 'store_credit', 'refunded'));

-- 3. 更新 fn_guard_status_transition 函數以支援新的狀態轉換
CREATE OR REPLACE FUNCTION public.fn_guard_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- 原本的規則
  IF OLD.status='draft' AND NEW.status='confirmed' THEN
    RETURN NEW;
  ELSIF OLD.status='confirmed' AND NEW.status='cancelled' THEN
    RETURN NEW;
  ELSIF OLD.status = NEW.status THEN
    RETURN NEW;
  -- 新增的規則
  ELSIF OLD.status='confirmed' AND NEW.status='store_credit' THEN
    RETURN NEW;
  ELSIF OLD.status='confirmed' AND NEW.status='refunded' THEN
    RETURN NEW;
  ELSIF OLD.status='store_credit' AND NEW.status='cancelled' THEN
    RETURN NEW;
  ELSIF OLD.status='refunded' AND NEW.status='cancelled' THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Invalid status transition: % -> %', OLD.status, NEW.status;
  END IF;
END;
$function$;

-- 4. 新增 trigger: total = 0 就是已收款
CREATE OR REPLACE FUNCTION public.fn_auto_paid_on_zero_total()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.total = 0 THEN
    NEW.is_paid := true;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_paid_on_zero_total ON sales;
CREATE TRIGGER trg_auto_paid_on_zero_total
    BEFORE INSERT OR UPDATE ON sales
    FOR EACH ROW
    EXECUTE FUNCTION fn_auto_paid_on_zero_total();
