-- 修复因重复增加库存导致的错误数据
-- 这个脚本会根据 inventory_logs 重新计算正确的库存

-- 方案1: 如果你知道哪些商品受影响，手动调整
-- 例如：某个商品进货数量是 100，现在库存显示 200，应该改为 100
-- UPDATE products SET stock = stock - 100 WHERE id = '商品ID';

-- 方案2: 根据 inventory_logs 重新计算所有商品的库存（慎用！）
-- 这会根据库存日志重新计算每个商品的库存
/*
WITH stock_calculation AS (
  SELECT
    product_id,
    SUM(qty_change) as calculated_stock
  FROM inventory_logs
  GROUP BY product_id
)
UPDATE products
SET stock = COALESCE(sc.calculated_stock, 0)
FROM stock_calculation sc
WHERE products.id = sc.product_id;
*/

-- 方案3: 如果只是测试数据，直接删除进货单重新开始
-- DELETE FROM purchases WHERE purchase_no = 'P0001';  -- 替换为你的进货单号

SELECT '请根据实际情况选择合适的方案执行' as message;
