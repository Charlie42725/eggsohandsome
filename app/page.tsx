import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="text-center">
          <h1 className="mb-4 text-5xl font-bold text-gray-900">
            歡迎使用 失控ERP
          </h1>
          <p className="mb-12 text-xl text-gray-900">
            簡單好用的 ERP 系統，專為小型商家設計
          </p>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/pos"
              className="block rounded-lg bg-white p-8 shadow-lg transition-shadow hover:shadow-xl"
            >
              <div className="mb-4 text-4xl">🛒</div>
              <h2 className="mb-2 text-2xl font-semibold text-gray-900">
                POS 收銀
              </h2>
              <p className="text-gray-900">
                快速掃碼銷售，支援現金、刷卡等多種付款方式
              </p>
            </Link>

            <Link
              href="/products"
              className="block rounded-lg bg-white p-8 shadow-lg transition-shadow hover:shadow-xl"
            >
              <div className="mb-4 text-4xl">📦</div>
              <h2 className="mb-2 text-2xl font-semibold text-gray-900">
                商品管理
              </h2>
              <p className="text-gray-900">
                建立商品資料、管理庫存、設定價格
              </p>
            </Link>

            <Link
              href="/vendors"
              className="block rounded-lg bg-white p-8 shadow-lg transition-shadow hover:shadow-xl"
            >
              <div className="mb-4 text-4xl">🏭</div>
              <h2 className="mb-2 text-2xl font-semibold text-gray-900">
                廠商管理
              </h2>
              <p className="text-gray-900">
                管理供應商資料、聯絡方式、付款條件
              </p>
            </Link>

            <Link
              href="/customers"
              className="block rounded-lg bg-white p-8 shadow-lg transition-shadow hover:shadow-xl"
            >
              <div className="mb-4 text-4xl">👥</div>
              <h2 className="mb-2 text-2xl font-semibold text-gray-900">
                客戶管理
              </h2>
              <p className="text-gray-900">
                管理客戶資料、聯絡方式、付款偏好
              </p>
            </Link>

            <Link
              href="/purchases"
              className="block rounded-lg bg-white p-8 shadow-lg transition-shadow hover:shadow-xl"
            >
              <div className="mb-4 text-4xl">📥</div>
              <h2 className="mb-2 text-2xl font-semibold text-gray-900">
                進貨管理
              </h2>
              <p className="text-gray-900">
                記錄進貨單據，自動更新庫存與成本
              </p>
            </Link>

            <Link
              href="/sales"
              className="block rounded-lg bg-white p-8 shadow-lg transition-shadow hover:shadow-xl"
            >
              <div className="mb-4 text-4xl">📊</div>
              <h2 className="mb-2 text-2xl font-semibold text-gray-900">
                銷售記錄
              </h2>
              <p className="text-gray-900">
                查看所有銷售單據，追蹤業績表現
              </p>
            </Link>

            <Link
              href="/ar"
              className="block rounded-lg bg-white p-8 shadow-lg transition-shadow hover:shadow-xl"
            >
              <div className="mb-4 text-4xl">💰</div>
              <h2 className="mb-2 text-2xl font-semibold text-gray-900">
                應收帳款
              </h2>
              <p className="text-gray-900">
                管理客戶欠款，追蹤收款進度
              </p>
            </Link>

            <Link
              href="/dashboard"
              className="block rounded-lg bg-white p-8 shadow-lg transition-shadow hover:shadow-xl"
            >
              <div className="mb-4 text-4xl">📈</div>
              <h2 className="mb-2 text-2xl font-semibold text-gray-900">
                儀表板
              </h2>
              <p className="text-gray-900">
                營收分析、庫存報表、毛利統計
              </p>
            </Link>
          </div>
        </div>

        <div className="mt-16 rounded-lg bg-blue-50 p-8">
          <h3 className="mb-4 text-2xl font-semibold text-blue-900">
            快速開始
          </h3>
          <ol className="space-y-3 text-blue-800">
            <li className="flex gap-3">
              <span className="font-semibold">1.</span>
              <span>前往「商品管理」新增商品資料</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold">2.</span>
              <span>使用「進貨管理」記錄進貨，系統會自動更新庫存</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold">3.</span>
              <span>在「POS 收銀」掃碼銷售商品，快速完成結帳</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
