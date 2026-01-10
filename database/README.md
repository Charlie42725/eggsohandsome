# 数据库迁移说明

## 客户购物金和信用额度功能

本迁移为客户管理系统添加了购物金（预存款/储值金）和信用额度功能。

### 新增功能

1. **购物金余额 (store_credit)**
   - 客户可以预先充值
   - 管理员可以手动调整（充值/扣减）
   - 销售时自动抵扣
   - 余额可以为负数（表示欠款）

2. **信用额度 (credit_limit)**
   - 设置客户的最大可欠款金额
   - 设为 0 表示不允许欠款
   - 当余额为负时，不能超过此额度

3. **交易记录 (customer_balance_logs)**
   - 完整记录所有购物金变动
   - 包括充值、扣减、销售消费等
   - 支持追溯和对账

### 部署步骤

#### 1. 在 Supabase 控制台执行 SQL 迁移

登录 Supabase 控制台 → SQL Editor → 新建查询，执行以下文件内容：

```
database/migrations/001_add_customer_balance_and_credit.sql
```

或直接复制粘贴 SQL 内容执行。

#### 2. 验证迁移结果

执行以下查询验证表结构：

```sql
-- 检查 customers 表新增字段
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'customers'
  AND column_name IN ('store_credit', 'credit_limit');

-- 检查 customer_balance_logs 表是否创建
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'customer_balance_logs';
```

#### 3. 更新 TypeScript 数据库类型（可选）

如果使用 Supabase CLI，可以重新生成类型定义：

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.ts
```

### 数据库变更详情

#### customers 表新增字段

| 字段名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `store_credit` | NUMERIC(10, 2) | 0 | 购物金余额，可为负数 |
| `credit_limit` | NUMERIC(10, 2) | 0 | 信用额度上限，0表示不允许欠款 |

#### 新增 customer_balance_logs 表

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `id` | UUID | 主键 |
| `customer_code` | TEXT | 客户编号（外键） |
| `amount` | NUMERIC(10, 2) | 交易金额（正数=增加，负数=减少） |
| `balance_before` | NUMERIC(10, 2) | 交易前余额 |
| `balance_after` | NUMERIC(10, 2) | 交易后余额 |
| `type` | TEXT | 交易类型（recharge, deduct, sale, refund, adjustment） |
| `ref_type` | TEXT | 关联类型（sale, manual等） |
| `ref_id` | UUID | 关联记录ID |
| `ref_no` | TEXT | 关联单号 |
| `note` | TEXT | 备注 |
| `created_by` | TEXT | 创建者 |
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 更新时间 |

### POS 系统集成

POS 收银系统已集成购物金功能：

1. **客户选择**
   - 下拉框显示每个客户的购物金余额
   - 选中客户后显示详细余额和信用额度

2. **自动抵扣预览**
   - 购物车总计自动显示购物金抵扣金额
   - 显示"实付金额"（抵扣后的金额）
   - 提示抵扣后的购物金余额

3. **结账流程**
   - 如果客户有购物金余额，自动抵扣订单金额
   - 销售单 total 字段保存的是抵扣后的金额（实付金额）
   - 自动记录购物金使用日志
   - 结账后自动刷新客户数据

**注意**：如果购物金完全抵扣了订单金额，销售单 total 将为 0，这是正确的行为。

### 使用说明

#### 管理员操作

1. **设置信用额度**
   - 在客户编辑页面设置 `credit_limit`
   - 设为 0：客户不能欠款
   - 设为正数：客户最多可欠该金额

2. **调整购物金**
   - 在客户列表点击"购物金"按钮
   - 选择类型：充值、扣减、调整
   - 输入金额和备注
   - 系统自动检查信用额度限制

#### 销售流程

销售时系统自动处理购物金：

1. 如果选择了客户且客户有购物金余额（> 0）
2. 自动抵扣购物金（不超过订单总额）
3. 更新客户余额
4. 记录交易日志（type='sale'）
5. 订单 total 字段保存抵扣后的实际应付金额

#### 查询示例

```sql
-- 查看客户购物金余额和额度
SELECT customer_code, customer_name, store_credit, credit_limit
FROM customers
WHERE is_active = true
ORDER BY store_credit DESC;

-- 查看某客户的交易记录
SELECT *
FROM customer_balance_logs
WHERE customer_code = 'C0001'
ORDER BY created_at DESC;

-- 查看所有欠款客户
SELECT customer_code, customer_name, store_credit, credit_limit
FROM customers
WHERE store_credit < 0
ORDER BY store_credit ASC;
```

### 回滚方案

如需回滚此迁移，执行以下 SQL：

```sql
-- 删除购物金交易记录表
DROP TABLE IF EXISTS customer_balance_logs;

-- 删除 customers 表的新字段
ALTER TABLE customers
DROP COLUMN IF EXISTS store_credit,
DROP COLUMN IF EXISTS credit_limit;
```

**注意**：回滚将永久删除所有购物金相关数据，请谨慎操作。

### 常见问题

**Q: 如何批量为现有客户初始化购物金？**

A: 现有客户的 `store_credit` 和 `credit_limit` 默认为 0，无需额外操作。如需批量设置，可执行：

```sql
-- 批量设置信用额度
UPDATE customers
SET credit_limit = 1000
WHERE customer_code IN ('C0001', 'C0002');
```

**Q: 购物金余额可以为负吗？**

A: 可以。负余额表示客户欠款。是否允许负余额取决于 `credit_limit` 设置：
- `credit_limit = 0`：不允许余额为负
- `credit_limit > 0`：允许欠款，但不超过额度

**Q: 如何查看购物金使用详情？**

A: 查询 `customer_balance_logs` 表，该表记录了所有购物金变动历史。

---

更新日期：2026-01-10
版本：1.0.0
