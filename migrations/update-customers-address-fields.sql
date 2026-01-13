-- 更新客戶表結構：移除 email，改用 store_address 和 delivery_address
-- 執行日期: 2026-01-13

-- 1. 重命名 address 為 store_address
ALTER TABLE public.customers
RENAME COLUMN address TO store_address;

-- 2. 刪除 email 欄位
ALTER TABLE public.customers
DROP COLUMN IF EXISTS email;

-- 3. 新增 delivery_address 欄位
ALTER TABLE public.customers
ADD COLUMN delivery_address text NULL;

-- 4. 更新註解
COMMENT ON COLUMN public.customers.store_address IS '門市地址（客戶店面地址）';
COMMENT ON COLUMN public.customers.delivery_address IS '宅配地址（郵寄或配送地址）';

-- 完成後的表結構：
-- create table public.customers (
--   id uuid not null default gen_random_uuid (),
--   customer_code character varying(20) not null,
--   customer_name character varying(100) not null,
--   phone character varying(50) null,
--   line_id character varying(50) null,
--   store_address text null,           -- 門市地址
--   delivery_address text null,        -- 宅配地址
--   payment_method character varying(50) null,
--   note text null,
--   is_active boolean null default true,
--   created_at timestamp without time zone null default now(),
--   updated_at timestamp without time zone null default now(),
--   store_credit numeric(10, 2) not null default 0,
--   credit_limit numeric(10, 2) not null default 0,
--   constraint customers_pkey primary key (id),
--   constraint customers_customer_code_key unique (customer_code)
-- ) tablespace pg_default;
