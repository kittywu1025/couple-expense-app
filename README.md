# 情侣同居生活助手

这是一个基于 `Vue 3 + Vite + TypeScript` 的手机优先 PWA 应用，帮助情侣记录和可视化同居开销、家务积分、消费日历和纪念日倒数。

## 功能介绍

- 📱 移动端优先界面，首页简化为总支出与最近记录两块核心内容，适配 iPhone 安全区
- 🧭 底部 `TabBar` 精简为 `首页 / 记录 / 统计 / 设置` 四个主入口，新增消费由右下角悬浮按钮统一承担
- 🧾 账本页面：新增、编辑、删除开销，按月统计消费
- 💱 货币支持：当前仅支持 `JPY` 与 `CNY`；单笔消费可选择原始货币，并按手动填写汇率换算保存
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

- 已对全站移动端做紧凑化优化：统一压缩页面上下留白、卡片内边距、表单间距、按钮高度和底部导航高度，让首页、添加页、记录页、统计页、设置页和登录页首屏展示更多核心内容。
- 首页移除了网页式 Hero/Banner，不再显示 `COUPLE LEDGER`、大标题和说明性文案。
- 首页只保留两个核心区块：本月总支出和最近记录，不再堆叠本月记录数、共同支出、双方已付等统计卡片。
- 月份区域右侧增加了轻量“📅 收支日历”入口，可进入单独的月历视图；手机端也保持同一行显示。
- 收支日历页改为浅色热力图月历：每天一个格子，金额越高颜色越深，点击某一天可查看当天流水。
- 最近记录区保持按日期分组的手机账本式流水，空状态简化为居中的“暂无数据 / 点击右下角 + 添加第一笔消费”。
- 底部导航保持 `首页 / 记录 / 统计 / 设置` 四项，使用浅色半透明胶囊导航；右下角 `+` 继续作为唯一新增入口。
- 首页右上角主入口改为设置图标，不再使用 `...`。
- 添加消费页已进一步压缩：移除“记账类型”说明卡和基准货币只读框，常用添加链路更短。
- 设置页、登录页和账本加入页的标题区、副标题和说明文案已缩短，整体更接近成熟手机 App 的信息密度。

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

- 设置页默认货币现已简化为：`JPY / CNY`，默认值为 `JPY`。
- 默认货币只在设置页配置；添加消费页不再显示“默认货币设置”相关说明。
- 添加消费页已修复货币字段初始化顺序问题；`syncCurrencyFields` 改为函数声明，避免在初始化链路里出现 `Cannot access 'syncCurrencyFields' before initialization`。
- 添加消费时，金额输入与货币选择已拆开：金额卡片单独展示，货币区域改为轻量下拉加快捷 pill，不再和金额输入挤在同一块，也不再显示默认货币说明块。
- 单笔消费货币现仅允许选择：`JPY / CNY`，默认跟随设置页默认货币。
- 若原始货币和默认货币不同，表单会显示汇率与汇率日期输入框；若两者相同，则不需要填写汇率。
- 当前是 MVP 实现：
  - 优先保证可追溯保存原始金额、原始货币、基准货币、汇率和汇率日期
  - 汇率自动获取暂未接入任何 API
  - 当前只做手动汇率输入：
    - 默认货币是 `JPY`、单笔是 `CNY` 时，输入 `1 CNY = 多少 JPY`
    - 默认货币是 `CNY`、单笔是 `JPY` 时，输入 `1 JPY = 多少 CNY`
  - 保存时会把金额换算成默认货币金额，同时保留原始金额和原始货币
- 页面金额展示统一改成 `货币代码 + 数字`，例如 `JPY 1,078`、`CNY 50`、`CNY 50 ≈ JPY 1,050`，避免 `JPY` 和 `CNY` 都显示成 `¥` 时混淆。

## 全站提示

- 全站成功、失败、警告、信息提示已统一改为全局 toast，不再直接渲染在页面内容区。
- toast 支持 `success / error / warning / info` 四种类型，支持自动消失和手动关闭。
- 登录、注册、账本创建/加入、添加消费、设置保存、密码修改、邀请码复制、PWA 新版本提醒等提示都已接入统一 toast。
- 运行时错误会显示友好的中文 toast：`页面出现问题，请刷新后重试。`
- 控制台仍保留原始错误日志，页面不会直接显示 `[object Object]` 或英文原始报错。

## 删除记录

- 记录页现在支持直接删除账单，每条记录底部都有 `删除` 入口。
- 删除前会弹出自定义确认 modal：
  - `确定删除这笔记录吗？`
  - `删除后无法恢复。`
- 当前是云端模式时：
  - 会先删除当前账本 `book_id` 下的 Supabase `expenses` 记录
  - 云端删除成功后，再从本地列表移除
  - 如果云端删除失败，会 toast 提示：`云端删除失败，请稍后重试。`
- 当前是本地模式时：
  - 会直接从本地 `localStorage` 删除
  - 删除成功后使用 toast 提示：`已删除这笔记录。`
- 首页最近记录没有单独加删除按钮，但会自动跟随记录页删除结果实时更新。

## 本次自测

- 已完成 `npm run build` 与本地 `npm run dev` 联合自测。
- 已验证的主要流程：
  - 邮箱 + 密码登录、退出登录、刷新后的 session 保持
  - 已注册邮箱注册时的 modal 提示
  - 邮箱登录链接入口的发送提示
  - 设置页默认货币修改与刷新后保留
  - 添加消费页 `JPY` / `CNY` 跨币种流程
  - 跨币种汇率缺失时 toast 提示
  - 首页、记录页、统计页、收支日历页的有数据 / 无数据场景
  - 全站 toast 提示替换 inline alert
- 本次修复的自测中发现问题：
  - 添加消费“保存并返回”不应等待云端同步完成，现已改为本地先保存并返回，云端同步后台进行。
  - 跨币种切换时不应沿用 `1` 作为默认汇率，现已改为必须重新输入汇率。
  - 远端拉取不应覆盖本地未同步记录，现已改为合并远端与本地缓存。
  - 消费表单的“消费说明 / 备注”已合并为单个可选字段。
- 当前已知限制：
  - 当前 Supabase 实例尚未执行最新 `expenses` 字段升级 SQL；在执行 SQL 前，页面仍可能提示“云端保存失败，但这笔记录已经保存在当前设备。”
  - 当前 in-app browser 环境下，`复制邀请码` 仍可能因剪贴板权限限制失败；真实浏览器环境建议继续实机验证。
  - 第二个独立测试账号注册后需要邮箱确认，因此本轮无法在未确认邮箱的前提下完成 B 账号登录和双向消费同步验证。

## 云端同步修复

- 已定位真实写入失败原因：Supabase `expenses` 表缺少前端已使用的字段，真实错误为：
  - `code`: `PGRST204`
  - `message`: `Could not find the 'base_currency' column of 'expenses' in the schema cache`
  - `details`: `null`
  - `hint`: `null`
- 已在 [supabase/couple_books.sql](/Users/wu/Desktop/couple-expense-app/supabase/couple_books.sql:1) 与 [supabase/migrations/20260505_fix_expenses_currency_and_pairing.sql](/Users/wu/Desktop/couple-expense-app/supabase/migrations/20260505_fix_expenses_currency_and_pairing.sql:1) 中补齐：
  - `original_amount`
  - `original_currency`
  - `base_currency`
  - `exchange_rate_used`
  - `exchange_rate_date`
  - `split`
  - `split_preset`
  - `book_id`
  - `created_by`
  - `created_at`
  - `updated_at`
- 已补充 `join_book_by_invite()` 的未登录保护，避免未认证时出现数据库 `user_id is null` 约束错误。
- 如果线上或本地云端同步继续报 `PGRST204`，请到 Supabase SQL Editor 执行：
  - [supabase/migrations/20260505_fix_expenses_currency_and_pairing.sql](/Users/wu/Desktop/couple-expense-app/supabase/migrations/20260505_fix_expenses_currency_and_pairing.sql:1)
- 旧数据会按 `JPY` 回填：
  - `original_amount = amount`
  - `original_currency = 'JPY'`
  - `base_currency = 'JPY'`
  - `exchange_rate_used = 1`
  - `exchange_rate_date = date` 或 `created_at::date`
- 执行后建议等待几秒，再回到应用重新保存一笔消费，确保 PostgREST schema cache 已刷新。

## 配对测试结果

- 账号 A：
  - 已验证可登录。
  - 已通过 RPC 成功创建测试账本并拿到邀请码。
- 账号 B：
  - 已成功注册独立测试账号。
  - 当前项目开启邮箱确认，B 账号未确认邮箱前不能密码登录。
  - 因此本轮无法完成“B 登录后输入邀请码加入账本”以及后续 A/B 双向消费同步的最终验证。
- 已验证的配对相关接口结果：
  - 错误邀请码：返回 `邀请码不存在`
  - 当前未确认邮箱的 B 账号直接调用加入：因无会话导致 `user_id null`，该情况已在 SQL 中补了未登录保护

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
