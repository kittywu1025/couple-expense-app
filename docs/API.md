# 记账接口（给 agent 用）

让 agent（自己写的脚本、快捷指令、AI 助手）帮忙记账、批量导入账单。

- 数据库：执行 `supabase/migrations/20261114_agent_api.sql`（可以重复执行）。
- 密钥：App 里「我的 → API 接口」生成。明文只显示一次，数据库里只存哈希；不用了就撤销，退出账本后自动失效。
- App 里「复制给 agent 的说明」会生成一份带地址、apikey 和密钥的说明，直接贴给 agent 就行（内容见 `src/utils/apiGuide.ts`）。

## 怎么调

接口是 Supabase 的 RPC，用 HTTP POST，请求体和返回都是 JSON：

```
POST {SUPABASE_URL}/rest/v1/rpc/<接口名>
apikey: {SUPABASE_ANON_KEY}
Content-Type: application/json
```

`apikey` 是公开的 anon key（和网页里用的一样），真正认人的是请求体里的 `token`。

出错时状态码不是 2xx，返回体的 `message` 是中文原因：密钥不对是 403，字段不对是 400（会写第几笔、哪里不对）。

## api_info

记账前先调一次，看分类和谁是谁。

```bash
curl -X POST "$SUPABASE_URL/rest/v1/rpc/api_info" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"token": "cek_..."}'
```

```json
{
  "book": { "currency": "JPY", "settle_day": 1 },
  "me": "小猫",
  "partner": "小狗",
  "categories": {
    "expense": [{ "name": "饮食", "subs": ["外食", "超市·便利店"] }, "..."],
    "income": [{ "name": "工资", "subs": [] }, "..."]
  },
  "today": "2026-11-14"
}
```

分类包括账本里的自定义分类。`today` 是日本时间。

## api_add_records

记一笔或批量导入。一次最多 200 笔；有一笔不对整批都不记。

```bash
curl -X POST "$SUPABASE_URL/rest/v1/rpc/api_add_records" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{
    "token": "cek_...",
    "items": [
      {"amount": 2380, "date": "2026-11-13", "category": "饮食", "sub_category": "外食",
       "type": "shared", "payer": "partner", "my_share": 5, "note": "一兰拉面"},
      {"amount": 1673, "date": "2026-11-12", "category": "购物", "sub_category": "网购",
       "note": "裤子", "external_id": "paypay-20261112-0001"}
    ]
  }'
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `amount` | ✓ | 金额，大于 0，保留两位小数 |
| `date` | ✓ | `YYYY-MM-DD`，不能晚于今天 |
| `category` | ✓ | 大类，必须是 `api_info` 里有的 |
| `sub_category` | | 子分类，必须在这个大类下面 |
| `kind` | | `expense`（默认）/ `income`。收入只能是个人的 |
| `type` | | `personal`（默认）/ `shared` |
| `payer` | | `me`（默认）/ `partner`。只有共同账可以是 TA 付的 |
| `my_share` | | 共同账我承担几成，0–10，默认 5；10 = 我请客 |
| `my_amount` | | 代替 `my_share`，直接写我那份的钱 |
| `note` | | 备注，最多 200 字 |
| `external_id` | | 导入用的唯一编号（交易号等），同一个账本里同一个编号只记一次 |

只记一笔时 `items` 也可以直接是一个对象。

```json
{
  "added": 2,
  "skipped": 0,
  "records": [{ "index": 1, "id": "…", "external_id": null }, { "index": 2, "id": "…", "external_id": "paypay-20261112-0001" }],
  "duplicates": []
}
```

`skipped` / `duplicates` 是 `external_id` 已经导入过、这次跳过的。

## api_delete_records

删掉记错的，只能删密钥主人自己记的。

```bash
curl -X POST "$SUPABASE_URL/rest/v1/rpc/api_delete_records" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"token": "cek_...", "ids": ["<账单 id>"]}'
```

返回 `{"deleted": 1}`。

## 规则

- 记在密钥主人名下，和在 App 里自己记的一样：共同账记了就入账，对方首页提醒「TA 新记了」，对方可以点「有疑问」。
- 数据库里 `ratio` 存的是「付款人承担几成」，接口里统一用「我」的角度（`my_share` / `my_amount`），换算在数据库里做。
- 内置分类写在 `api_builtin_categories()` 里，要和 `src/utils/categories.ts` 一起改。
