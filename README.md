# 失控ERP

簡單好用的 ERP 系統，專為小型商家設計。

## ✨ 功能特色

### M1 階段 ✅ 已完成
- **商品管理** - 建立商品資料、管理庫存、設定價格
- **POS 收銀** - 快速掃碼銷售、支援多種付款方式、庫存檢查
- **進貨管理** - 記錄進貨單據、自動更新庫存與成本
- **銷售記錄** - 查看所有銷售單據、追蹤業績表現

### M2 階段 ✅ 已完成
- **應收帳款** - 管理客戶欠款、快速收款、帳齡分析
- **應付帳款** - 管理廠商欠款、快速付款、帳齡分析
- **儀表板** - 營收分析、庫存報表、即時 KPI
- **收付款管理** - 支援分配多筆帳款、自動更新狀態

## 🚀 快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 設置環境變數

建立 `.env.local` 檔案，填入您的 Supabase 資訊：

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. 設置資料庫

在 Supabase SQL Editor 依序執行：

1. 您的資料庫 schema（建立所有表格）
2. `database/triggers.sql` - 設置觸發器（重要！）
3. `database/seed.sql` - 導入測試資料

### 4. 啟動開發伺服器

```bash
npm run dev
```

開啟瀏覽器訪問 [http://localhost:3000](http://localhost:3000)

## 📖 使用指南

### 基本流程

1. **新增商品** → 前往「商品管理」新增商品資料
2. **進貨** → 使用「進貨管理」建立進貨單，庫存會自動增加
3. **銷售** → 在「POS 收銀」掃碼銷售，庫存會自動減少
4. **收付款** → 使用「應收/應付帳款」頁面進行收付款

### POS 收銀功能

- **條碼掃描**：輸入條碼後按 Enter 自動加入購物車
- **關鍵字搜尋**：輸入商品名稱或品號搜尋
- **快速建檔**：找不到商品時，可快速建立新商品
- **庫存檢查**：自動檢查庫存，防止超賣

### 應收/應付帳款

- **選擇多筆**：可同時選擇多筆帳款進行收/付款
- **自動分配**：系統會自動按比例分配金額
- **帳齡顯示**：清楚顯示逾期帳款
- **狀態追蹤**：未收/部分收款/已收清

## 🗂️ 專案結構

```
toyflow-erp/
├── app/                      # Next.js App Router 頁面
│   ├── api/                 # API Routes
│   │   ├── products/        # 商品 API
│   │   ├── sales/          # 銷售 API
│   │   ├── purchases/      # 進貨 API
│   │   ├── ar/             # 應收帳款 API
│   │   ├── ap/             # 應付帳款 API
│   │   ├── receipts/       # 收款 API
│   │   └── payments/       # 付款 API
│   ├── pos/                # POS 收銀頁面
│   ├── products/           # 商品管理頁面
│   ├── purchases/          # 進貨管理頁面
│   ├── sales/              # 銷售記錄頁面
│   ├── ar/                 # 應收帳款頁面
│   ├── ap/                 # 應付帳款頁面
│   └── dashboard/          # 儀表板頁面
├── components/              # React 組件
├── lib/                     # 工具函數與設定
│   ├── supabase/           # Supabase 客戶端
│   ├── schemas.ts          # Zod 驗證規則
│   └── utils.ts            # 工具函數
├── types/                   # TypeScript 類型定義
├── database/                # 資料庫腳本
│   ├── triggers.sql        # 觸發器（重要）
│   └── seed.sql            # 測試資料
└── SETUP.md                # 詳細設置說明
```

## 🔧 技術棧

- **前端框架**：Next.js 16 (App Router)
- **UI 樣式**：Tailwind CSS
- **資料庫**：Supabase (PostgreSQL)
- **驗證**：Zod
- **語言**：TypeScript

## 📝 API 文檔

### Products API
- `GET /api/products` - 商品列表（支援搜尋）
- `POST /api/products` - 新增商品
- `GET /api/products/:id` - 取得商品詳情
- `PATCH /api/products/:id` - 更新商品
- `GET /api/products/search` - 快速搜尋（條碼/關鍵字）

### Sales API
- `GET /api/sales` - 銷售單列表
- `POST /api/sales` - 建立銷售單
- `GET /api/sales/:id` - 取得銷售單詳情
- `DELETE /api/sales/:id` - 刪除/取消銷售單

### Purchases API
- `GET /api/purchases` - 進貨單列表
- `POST /api/purchases` - 建立進貨單
- `GET /api/purchases/:id` - 取得進貨單詳情

### AR/AP API
- `GET /api/ar` - 應收帳款列表
- `GET /api/ap` - 應付帳款列表
- `POST /api/receipts` - 建立收款記錄
- `POST /api/payments` - 建立付款記錄

## 🎯 設計理念

1. **新手友善** - 所有流程皆以「三步內完成」為目標
2. **快速建檔** - 找不到資料時，立即彈出快速建檔對話框
3. **自動化** - 庫存、成本、應收應付自動計算與更新
4. **容錯設計** - 庫存不足檢查、金額驗證、錯誤提示

## 📋 待辦功能（M3 階段）

- [ ] 銷售退貨功能
- [ ] 進貨退貨功能
- [ ] 商品自訂欄位管理
- [ ] 商品批次匯入（CSV）
- [ ] 盤點與調整功能
- [ ] 更多報表與統計

## 🤝 貢獻

歡迎提交 Issue 或 Pull Request！

## 📄 授權

MIT License

## 🎉 完成進度

- ✅ M1 階段：基礎功能（商品、POS、進貨、銷售）
- ✅ M2 階段：財務管理（應收應付、收付款、儀表板）
- 🔜 M3 階段：增強功能（退貨、自訂欄位、批次匯入）
