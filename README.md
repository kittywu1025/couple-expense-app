# 两个人的账本

面向在日本留学的情侣，Vue 3 + Vite + TypeScript + Supabase 的共同记账 PWA。默认货币日元（JPY），可在「我的」里切换。Google 登录，一个账本绑定两人，月底自动算出谁该转给谁。

## 功能

- **首页**：本月一起花了多少 + 最近 7 天每日开销折线图 + 最近账单（点击可删除）
- **统计**：按结算周期切换月份；共同支出 / AA 部分；请客次数；月末结算明细；各自实付；分类明细
- **记账**（右下角 ＋）：支出·收入、大类 / 二级分类、个人 / 共同、AA 比例滑条、付款人、计算器键盘
- **我的**：成员、邀请码、结算日、记账货币（JPY / CNY / USD / KRW / TWD / HKD，仅切换显示单位，不换算）、默认 AA 比例、退出账本、退出登录

## 结算规则

每笔共同记录存 `ratio` = **付款人承担的份额**（0–10）：

- 对方应付给付款人 = `amount × (10 − ratio) / 10`
- `ratio = 10`（付款人请客）或 `ratio = 0`（对方请客）不产生债务，只计请客次数
- 月末差额 = 我应付合计 − 对方应付给我合计；正数我转给对方，负数对方转给我

记账页的滑条始终是「我 : TA」，保存时按付款人换算成 `ratio`。

## 初始化 Supabase

1. 在 SQL Editor **按文件名顺序**执行 `supabase/migrations/` 下的新文件（都可重复执行；旧的 `expenses` 等表不受影响）：
   - `20261017_rebuild_books_records.sql`
   - `20261018_member_colors.sql`
   - `20261019_custom_categories.sql`
   - `20261020_registration_rules.sql`
2. Authentication → Providers → 开启 **Google**，填入 Google Cloud 的 OAuth Client ID / Secret
3. Authentication → URL Configuration → Redirect URLs 加入 `http://localhost:5173/**`、`http://<本机局域网IP>:5173/**`；Site URL 填线上地址
4. 复制 `.env.example` 为 `.env.local`，填写 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`

## 开发

更新内容见 [CHANGELOG.md](CHANGELOG.md)。

不登录预览界面（演示数据）：`VITE_DEMO_MODE=true npm run dev`


```bash
npm install
npm run dev
```

## 项目结构

- `src/App.vue` — 登录 / 建账本 / 主界面切换，`activeTab` 条件渲染
- `src/pages/` — `AuthPage` `BookSetupPage` `HomePage` `StatsPage` `MePage` `AddRecordPage`
- `src/components/` — `TabBar`（含 FAB）、`RecordList`、`WeekLineChart`（手写 SVG）、`ToastViewport`
- `src/composables/` — `useSupabaseAuth`（Google OAuth）、`useBooks`（账本与成员）、`useRecords`（账单）、`useToast`、`usePwaUpdate`、`useRuntimeStatus`
- `src/utils/` — `categories`（分类定义）、`settlement`（结算 / 周期计算）、`format`
