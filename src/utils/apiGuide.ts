/**
 * 给 agent 的接口说明：在「我的 → API 接口」里一键复制，直接贴给 agent。
 * 和 supabase/migrations/20261114_agent_api.sql、docs/API.md 保持一致。
 */
export const apiGuide = (opts: { url: string; anonKey: string; token?: string }) => `# 两个人的账本 · 记账接口

用 HTTP POST 调用，请求体和返回都是 JSON。

- 地址：${opts.url}/rest/v1/rpc/<接口名>
- 请求头：
  - apikey: ${opts.anonKey}
  - Content-Type: application/json
- 密钥（放在请求体的 token 里）：${opts.token ?? '<在 App「我的 → API 接口」里生成>'}

出错时 HTTP 状态码不是 2xx，返回体的 message 是中文原因（会写第几笔、哪里不对）。批量记账时有一笔不对，整批都不会记，改好再传。

## 1. api_info：记账前先调一次

请求：{"token": "<密钥>"}

返回：账本货币、我和 TA 的名字、能用的分类（支出 / 收入，每个大类下的子分类）、今天的日期（日本时间）。

## 2. api_add_records：记一笔或批量导入

请求：{"token": "<密钥>", "items": [ ... ]}，一次最多 200 笔；只记一笔时 items 也可以直接是一个对象。

每一笔的字段：
- amount（必填）：金额，大于 0
- date（必填）：YYYY-MM-DD，不能晚于今天
- category（必填）：大类，必须是 api_info 里有的；sub_category（可选）：子分类
- kind：expense（支出，默认）或 income（收入，只能是个人的）
- type：personal（个人，默认）或 shared（共同，两个人 AA）
- payer：me（我付的，默认）或 partner（TA 付的，只有共同账可以）
- my_share：共同账我承担几成，0–10，默认 5（比如 4 表示我 4 成、TA 6 成；10 表示我请客）
- my_amount：也可以不写 my_share，直接写我那份的钱（比如一共 2200、我吃了 800）
- note（可选）：备注，最多 200 字
- external_id（可选）：导入账单时填交易号之类的唯一编号，同一个编号只会记一次，重复导入不会记重

返回：{"added": 记了几笔, "skipped": 因为 external_id 重复跳过几笔, "records": [{"index": 第几笔, "id": 账单 id, "external_id": ...}], "duplicates": [...]}

例子：
{"token": "<密钥>", "items": [
  {"amount": 2380, "date": "2026-11-13", "category": "饮食", "sub_category": "外食", "type": "shared", "payer": "partner", "my_share": 5, "note": "一兰拉面"},
  {"amount": 640, "date": "2026-11-13", "category": "交通", "sub_category": "巴士·电车"},
  {"amount": 1673, "date": "2026-11-12", "category": "购物", "sub_category": "网购", "note": "裤子", "external_id": "paypay-20261112-0001"}
]}

## 3. api_delete_records：删掉记错的

请求：{"token": "<密钥>", "ids": ["<账单 id>", ...]}，只能删这个密钥的主人自己记的。

返回：{"deleted": 删了几笔}

## 注意

- 用接口记的账和在 App 里自己记的一样：记在密钥主人名下，共同账对方首页会提醒「TA 新记了」，对方觉得不对可以点「有疑问」。
- 拿不准分类、谁付的、怎么分的时候，先问用户，不要猜。
`
