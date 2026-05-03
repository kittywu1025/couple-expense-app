# 情侣同居生活助手

这是一个基于 `Vue 3 + Vite + TypeScript` 的手机优先 PWA 应用，帮助情侣记录和可视化同居开销、家务积分、消费日历和纪念日倒数。

## 功能介绍

- 📱 移动端优先界面，首页顶部采用更接近原生 App 的轻量账本头部，适配 iPhone 安全区
- 🧭 底部 `TabBar` 精简为 `首页 / 记录 / 统计 / 设置` 四个主入口，新增消费由右下角悬浮按钮统一承担
- 🧾 账本页面：新增、编辑、删除开销，按月统计消费
- 🔍 搜索功能：支持按标题、备注、类别或支付方搜索账目
- 🧾 固定账单支持：可以单独设置每月固定扣费（如话费、水电、宽带）
- 🤝 共享结算：自动计算共同支出结算差额，显示“我欠对方 / 对方欠我”
- 📅 日历页面：按天展示当月消费，支持日均与高消费日对比
- 🏠 家务页面：记录家务任务、执行者、积分与完成状态
- ⏳ 倒数日页面：设置在一起日期与另一半生日，显示天数和倒数天数
- 💾 本地存储：数据保存在浏览器本地 `localStorage` 中

## 项目结构

- `src/App.vue` - 应用入口，页面切换、悬浮新增入口与底部导航
- `src/pages/HomePage.vue` - 首页，包含账本头部、月度摘要与最近记录
- `src/pages/AddExpensePage.vue` - 新增 / 编辑消费页面
- `src/pages/RecordsPage.vue` - 消费记录筛选与列表页面
- `src/pages/StatsPage.vue` - 统计页面
- `src/pages/SettingsPage.vue` - 账本与个人设置页面
- `src/pages/AuthPage.vue` - Supabase 邮箱登录页面
- `src/pages/BookSetupPage.vue` - 创建 / 加入账本页面
- `src/components/TabBar.vue` - 底部导航栏组件
- `src/components/ExpenseForm.vue` - 开销新增 / 编辑表单
- `src/components/ExpenseList.vue` - 开销列表
- `src/components/SummaryPanel.vue` - 统计概览面板
- `src/composables/useBooks.ts` - 账本读取、创建、加入与当前账本状态
- `src/composables/useExpenses.ts` - 开销数据存储与计算逻辑
- `src/composables/useSupabaseAuth.ts` - Supabase 登录状态管理
- `src/composables/useSupabaseExpenses.ts` - Supabase 开销同步逻辑
- `src/types.ts` - 共享类型定义

## 本次界面调整

- 首页移除了网页式 Banner，不再显示 `COUPLE LEDGER`、超大中文标题和说明性文案。
- 首页顶部改为轻量账本头部：显示当前账本名称、当前月份、月份切换按钮和设置入口。
- 首页首屏结构调整为：轻量顶部、月度摘要卡片、最近记录，整体更贴近原生记账 App。
- 底部导航移除了“添加”项，避免与右下角悬浮添加按钮重复。
- 右下角悬浮按钮保留，继续作为新增消费的唯一主入口，不影响原有新增 / 编辑逻辑。

## 运行方式

```bash
cd /Users/wu/Desktop/couple-expense-app
npm install
npm run dev
```

打开浏览器并访问：

```text
http://localhost:5173
```

移动端预览时，建议直接使用手机浏览器或设备模拟器查看，以确认顶部安全区、底部安全区和悬浮按钮位置表现正常。

## 构建生产版本

```bash
npm run build
```

## 开发说明

本项目已通过 `npm run build` 验证。你可以继续扩展：

- 增加消费分类可视化图表
- 添加预算提醒和分摊建议
- 支持更多纪念日类型和自定义图标
- 加入用户登录 / 云端同步功能

## Supabase 云同步说明

本项目默认使用 `localStorage` 本地存储。当前代码已支持邮箱登录和云端开销同步：

1. 在 `https://app.supabase.com/` 创建一个新项目。
2. 在 Supabase 控制台启用 Auth（邮箱登录）。
3. 在 Supabase 数据库中创建 `expenses` 表，字段示例：
   - `id` (uuid, primary key)
   - `user_id` (uuid)
   - `title` (text)
   - `amount` (numeric)
   - `date` (date)
   - `category` (text)
   - `payer` (text)
   - `shared` (boolean)
   - `recurrence` (text)
   - `note` (text)
   - `created_at` (timestamp)
4. 在项目根目录创建 `.env`：
   - `VITE_SUPABASE_URL=你的Supabase项目URL`
   - `VITE_SUPABASE_ANON_KEY=你的公开匿名KEY`
5. 安装 Supabase 客户端：`npm install @supabase/supabase-js`
6. 使用 `src/lib/supabase.ts` 中的 Supabase client 连接后端。

本项目已补充登录入口：
- 未登录用户会先进入邮箱登录页
- 登录后会自动读取该用户的 `expenses` 数据
- 新增 / 编辑 / 删除开销会自动同步到 Supabase

目前 `chores`、`倒数日` 和 `情侣名字` 仍保存在本地，后续可以继续扩展云端同步。
