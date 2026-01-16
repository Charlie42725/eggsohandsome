-- 清理現有 amount = 0 的 AR 記錄
-- 這些記錄沒有實際應收金額，不應該存在

-- 先查看有多少筆需要清理
-- SELECT COUNT(*) FROM partner_accounts WHERE direction = 'AR' AND amount = 0;

-- 刪除 amount = 0 的 AR 記錄
DELETE FROM partner_accounts 
WHERE direction = 'AR' AND amount = 0;
