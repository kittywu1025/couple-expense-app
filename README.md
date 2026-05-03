# 情侣同居生活助手

这是一个基于 `Vue 3 + Vite + TypeScript` 的手机优先 PWA 应用，帮助情侣记录和可视化同居开销、家务积分、消费日历和纪念日倒数。

## 功能介绍

- 📱 移动端优先界面，首页简化为总支出与最近记录两块核心内容，适配 iPhone 安全区
- 🧭 底部 `TabBar` 精简为 `首页 / 记录 / 统计 / 设置` 四个主入口，新增消费由右下角悬浮按钮统一承担
- 🧾 账本页面：新增、编辑、删除开销，按月统计消费
- 💱 货币支持：设置默认货币；单笔消费可选择原始货币，并按填写汇率换算保存
- 🔍 搜索功能：支持按标题、备注、类别或支付方搜索账目
- 🧾 固定账单支持：可以单独设置每月固定扣费（如话费、水电、宽带）
- 🤝 共享结算：自动计算共同支出结算差额，显示“我欠对方 / 对方欠我”
- 📅 日历页面：按天展示当月消费，支持日均与高消费日对比
- 🏠 家务页面：记录家务任务、执行者、积分与完成状态
- ⏳ 倒数日页面：设置在一起日期与另一半生日，显示天数和倒数天数
- 💾 本地存储：数据保存在浏览器本地 `localStorage` 中

## 项目结构

- `src/App.vue` - 应用入口，页面切换、悬浮新增入口与底部导航
- `src/pages/HomePage.vue` - 首页，包含 App Header、总支出卡片、收支日历入口与按日期分组的最近记录
- `src/pages/CalendarPage.vue` - 收支日历页，按月显示每日消费热力图并支持查看当天流水
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
- `src/composables/usePwaUpdate.ts` - PWA 更新检测、等待激活与刷新状态
- `src/composables/useSupabaseAuth.ts` - Supabase 登录状态管理
- `src/composables/useSupabaseExpenses.ts` - Supabase 开销同步逻辑
- `src/types.ts` - 共享类型定义

## 本次界面调整

- 首页移除了网页式 Hero/Banner，不再显示 `COUPLE LEDGER`、大标题和说明性文案。
- 首页只保留两个核心区块：本月总支出和最近记录，不再堆叠本月记录数、共同支出、双方已付等统计卡片。
- 月份区域右侧增加了轻量“📅 收支日历”入口，可进入单独的月历视图；手机端也保持同一行显示。
- 收支日历页改为浅色热力图月历：每天一个格子，金额越高颜色越深，点击某一天可查看当天流水。
- 最近记录区保持按日期分组的手机账本式流水，空状态简化为居中的“暂无数据 / 点击右下角 + 添加第一笔消费”。
- 底部导航保持 `首页 / 记录 / 统计 / 设置` 四项，使用浅色半透明胶囊导航；右下角 `+` 继续作为唯一新增入口。
- 首页右上角主入口改为设置图标，不再使用 `...`。

## PWA 更新与刷新

- 已检查并收紧 Service Worker 更新逻辑：只有在确实存在 `waiting` worker 时才会提示“发现新版本”。
- 点击“立即刷新”会发送 `SKIP_WAITING` 并在 `controllerchange` 后只 reload 一次，避免循环提示。
- 首页/记录/统计/设置顶部支持轻量下拉刷新：
  - 下拉刷新
  - 松开刷新
  - 正在刷新
  - 已是最新
- 下拉刷新会同时执行两件事：
  - 重新拉取本地或 Supabase 最新数据
  - 检查是否有新的 Service Worker 等待激活
- 本项目已加入更新检测和手动刷新；如果桌面 PWA 长时间不更新，可以删除桌面图标后重新添加，或清理网站数据。

## 货币与汇率

- 设置页支持默认货币，当前提供：`JPY / CNY / USD / KRW / EUR`。
- 添加消费页已修复货币模块初始化顺序导致的运行时错误 `Cannot access uninitialized variable.`。
- 添加消费时，金额区域会先显示当前货币，再用下方轻量货币 pill 切换原始货币，不再把 `select` 挤在金额输入框右侧。
- 若原始货币和默认货币不同，表单会显示汇率与汇率日期输入框。
- 若原始货币和默认货币相同，提示文案改为更自然的“当前默认货币 / 本笔将按 xxx 记账”。
- 当前是 MVP 实现：
  - 优先保证可追溯保存原始金额、原始货币、基准货币、汇率和汇率日期
  - 汇率自动获取暂未接入银联接口，原因是前端直连公开汇率源通常会遇到 CORS 或稳定性问题
  - 现阶段使用手动填写汇率，保存时会计算并写入基准货币金额
- 记录列表里，跨币种记录会显示 `原始金额 + 货币代码 ≈ 基准金额 + 货币代码`，避免 `JPY` 和 `CNY` 都显示成 `¥` 时混淆。

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
   - `title` (text)
   - `amount` (numeric)
   - `original_amount` (numeric)
   - `original_currency` (text)
   - `base_currency` (text)
   - `exchange_rate_used` (numeric)
   - `exchange_rate_date` (date)
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

目前 `chores`、`倒数日` 和 `情侣名字 / 默认货币` 仍保存在本地，后续可以继续扩展云端同步。

## 部署与缓存说明

- 当前项目可直接执行 `npm run build` 生成生产包。
- 如果接入 Cloudflare Pages，GitHub `push` 后会自动触发部署，但不是 `push` 完立即生效，需要等待最新构建完成。
- 可以在 Cloudflare Pages 的 `Deployments` 页面查看最新 commit 和部署状态。
- 如果线上没更新，先确认最新 deployment 的 commit 是否和 GitHub 最新 commit 一致。
- 项目启用了 Service Worker 和 PWA 缓存，因此部署新版本后，手机端或桌面 PWA 可能会短时间继续显示旧页面。
- 本项目已加入更新检测和手动刷新；如果线上界面没有及时变化，优先使用 App 内更新提示或页面顶部下拉刷新。
- 如果桌面 PWA 长时间不更新，可以删除桌面图标后重新添加，或清理浏览器网站数据。
