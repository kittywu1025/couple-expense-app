-- 给 agent 用的 HTTP 接口：记账、导入账单。
-- 在「我的 → API 接口」里生成密钥，agent 带着密钥调 Supabase 的 RPC：
--   POST {SUPABASE_URL}/rest/v1/rpc/api_info          {"token": "..."}
--   POST {SUPABASE_URL}/rest/v1/rpc/api_add_records   {"token": "...", "items": [...]}
--   POST {SUPABASE_URL}/rest/v1/rpc/api_delete_records {"token": "...", "ids": [...]}
-- 请求头带 apikey（公开的 anon key，和网页里用的一样）。说明见 docs/API.md。
-- 用 agent 记的账和自己在 App 里记的一样：记在密钥主人名下，共同账对方首页会提醒「TA 新记了」。
-- 可以重复执行。

-- ── 密钥：只存哈希，明文只在生成时给一次 ──
create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  token_hash text not null unique,
  -- 列表里显示前几位，认得出是哪一个
  prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_tokens_user_idx on public.api_tokens (user_id);

alter table public.api_tokens enable row level security;
drop policy if exists "api_tokens_select_own" on public.api_tokens;
create policy "api_tokens_select_own" on public.api_tokens
  for select to authenticated
  using (user_id = auth.uid());
-- 增删只走下面的函数；匿名完全看不到
revoke all on public.api_tokens from anon, authenticated;
grant select on public.api_tokens to authenticated;

-- 导入账单去重：同一个账本里 external_id 一样的只记一次（比如信用卡明细的交易号）
alter table public.records add column if not exists external_id text;
create unique index if not exists records_book_external_id_idx on public.records (book_id, external_id) where external_id is not null;

create or replace function public.api_token_hash(p_token text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- 生成密钥：返回明文（只有这一次能看到）
create or replace function public.create_api_token(p_book_id uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := 'cek_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_name text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null or not public.is_book_member(p_book_id) then
    raise exception '还没有加入账本。';
  end if;
  if v_name = '' then
    raise exception '给密钥起个名字，比如「记账助手」';
  end if;
  if char_length(v_name) > 40 then
    raise exception '名字太长了';
  end if;
  if (select count(*) from public.api_tokens where user_id = auth.uid() and revoked_at is null) >= 10 then
    raise exception '最多 10 个密钥，先撤销不用的';
  end if;
  insert into public.api_tokens (book_id, user_id, name, token_hash, prefix)
  values (p_book_id, auth.uid(), v_name, public.api_token_hash(v_token), left(v_token, 10));
  return v_token;
end;
$$;

create or replace function public.revoke_api_token(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.api_tokens set revoked_at = now()
  where id = p_id and user_id = auth.uid() and revoked_at is null;
  if not found then
    raise exception '密钥不存在或者已经撤销';
  end if;
end;
$$;

-- 认密钥：返回密钥主人和账本，并让后面的触发器按这个人算「记账人」（和固定扣款一样用 app.acting_uid）
create or replace function public.api_auth(p_token text, out o_user uuid, out o_book uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select t.id, t.user_id, t.book_id into v_id, o_user, o_book
  from public.api_tokens t
  where t.token_hash = public.api_token_hash(coalesce(p_token, '')) and t.revoked_at is null;
  if v_id is null then
    raise exception '密钥不对或者已经撤销' using errcode = '28000';
  end if;
  -- 退出账本后密钥跟着失效
  if not exists (select 1 from public.book_members where book_id = o_book and user_id = o_user) then
    raise exception '密钥的主人已经不在这个账本里了' using errcode = '28000';
  end if;
  update public.api_tokens set last_used_at = now() where id = v_id;
  perform set_config('app.acting_uid', o_user::text, true);
end;
$$;

-- 内置分类（和 src/utils/categories.ts 保持一致）
create or replace function public.api_builtin_categories()
returns jsonb
language sql
immutable
as $$
  select '{
    "expense": [
      {"name": "饮食", "subs": ["外食", "超市·便利店"]},
      {"name": "固定开销", "subs": ["房租", "电费", "水费", "煤气费", "手机·网络"]},
      {"name": "交通", "subs": ["巴士·电车", "打车", "停车费", "油费", "ETC"]},
      {"name": "娱乐", "subs": ["出去玩·旅行"]},
      {"name": "购物", "subs": ["网购", "实体购物"]},
      {"name": "学习", "subs": ["学费", "书本·文具"]},
      {"name": "保险", "subs": ["医保", "车险", "其他保险"]},
      {"name": "医疗", "subs": ["医院·诊所", "药局"]},
      {"name": "其他", "subs": []}
    ],
    "income": [
      {"name": "工资", "subs": []},
      {"name": "兼职", "subs": []},
      {"name": "奖金", "subs": []},
      {"name": "红包", "subs": []},
      {"name": "其他", "subs": []}
    ]
  }'::jsonb;
$$;

-- 账本的分类：内置 + 自定义
create or replace function public.api_categories(p_book uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'expense', (public.api_builtin_categories() -> 'expense') || coalesce((
      select jsonb_agg(jsonb_build_object('name', c ->> 'name', 'subs', coalesce((select jsonb_agg(s ->> 'name') from jsonb_array_elements(c -> 'subs') s), '[]'::jsonb)))
      from public.books b, jsonb_array_elements(b.custom_categories) c
      where b.id = p_book and c ->> 'kind' = 'expense'), '[]'::jsonb),
    'income', (public.api_builtin_categories() -> 'income') || coalesce((
      select jsonb_agg(jsonb_build_object('name', c ->> 'name', 'subs', coalesce((select jsonb_agg(s ->> 'name') from jsonb_array_elements(c -> 'subs') s), '[]'::jsonb)))
      from public.books b, jsonb_array_elements(b.custom_categories) c
      where b.id = p_book and c ->> 'kind' = 'income'), '[]'::jsonb)
  );
$$;

-- ── api_info：记账前先看一下账本（谁是谁、货币、能用的分类） ──
create or replace function public.api_info(token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_book uuid;
  v_result jsonb;
begin
  select o_user, o_book into v_user, v_book from public.api_auth(token);
  select jsonb_build_object(
    'book', jsonb_build_object('currency', b.currency, 'settle_day', b.settle_day),
    'me', (select coalesce(m.display_name, '我') from public.book_members m where m.book_id = v_book and m.user_id = v_user),
    'partner', (select m.display_name from public.book_members m where m.book_id = v_book and m.user_id <> v_user limit 1),
    'categories', public.api_categories(v_book),
    'today', (now() at time zone 'Asia/Tokyo')::date
  ) into v_result
  from public.books b where b.id = v_book;
  return v_result;
end;
$$;

-- ── api_add_records：记一笔或批量导入（一次最多 200 笔，有一笔不对就全部不记） ──
-- 每一笔：
--   amount       金额，必填，> 0
--   date         'YYYY-MM-DD'，必填，不能晚于明天
--   category     分类，必填（api_info 里的名字）；sub_category 子分类，可选
--   kind         'expense'（默认）/ 'income'（收入只能是个人的）
--   type         'personal'（默认）/ 'shared'
--   payer        'me'（默认）/ 'partner'：共同账谁付的钱
--   my_share     共同账我承担几成 0–10，默认 5；或者 my_amount 直接写我那份的钱
--   note         备注，可选
--   external_id  可选，导入时填交易号之类的，同一个号只会记一次
create or replace function public.api_add_records(token text, items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_book uuid;
  v_partner uuid;
  v_cats jsonb;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_item jsonb;
  v_i integer := 0;
  v_where text;
  v_amount numeric;
  v_date date;
  v_kind text;
  v_type text;
  v_payer uuid;
  v_share numeric;
  v_ratio numeric;
  v_cat text;
  v_sub text;
  v_cat_def jsonb;
  v_note text;
  v_ext text;
  v_seen text[] := '{}';
  v_row public.records;
  v_added jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
begin
  select o_user, o_book into v_user, v_book from public.api_auth(token);
  select user_id into v_partner from public.book_members where book_id = v_book and user_id <> v_user limit 1;
  v_cats := public.api_categories(v_book);

  if items is null or jsonb_typeof(items) = 'object' then
    items := jsonb_build_array(items);
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'items 要是一笔（对象）或者几笔（数组）';
  end if;
  if jsonb_array_length(items) > 200 then
    raise exception '一次最多 200 笔，分几次传';
  end if;

  for v_item in select * from jsonb_array_elements(items) loop
    v_i := v_i + 1;
    v_where := format('第 %s 笔：', v_i);
    if jsonb_typeof(v_item) <> 'object' then
      raise exception '%不是对象', v_where;
    end if;

    -- 金额
    begin
      v_amount := round((v_item ->> 'amount')::numeric, 2);
    exception when others then
      raise exception '%amount 要是数字', v_where;
    end;
    if v_amount is null or v_amount <= 0 then
      raise exception '%amount 要大于 0', v_where;
    end if;
    if v_amount > 99999999 then
      raise exception '%金额太大了', v_where;
    end if;

    -- 日期
    begin
      v_date := (v_item ->> 'date')::date;
    exception when others then
      raise exception '%date 要写成 YYYY-MM-DD', v_where;
    end;
    if v_date is null then
      raise exception '%缺 date（YYYY-MM-DD）', v_where;
    end if;
    if v_date > v_today + 1 then
      raise exception '%日期不能晚于今天', v_where;
    end if;

    -- 支出 / 收入、个人 / 共同
    v_kind := coalesce(nullif(v_item ->> 'kind', ''), 'expense');
    if v_kind not in ('expense', 'income') then
      raise exception '%kind 只能是 expense 或 income', v_where;
    end if;
    v_type := coalesce(nullif(v_item ->> 'type', ''), 'personal');
    if v_type not in ('personal', 'shared') then
      raise exception '%type 只能是 personal 或 shared', v_where;
    end if;
    if v_kind = 'income' and v_type = 'shared' then
      raise exception '%收入只能记成个人的', v_where;
    end if;
    if v_type = 'shared' and v_partner is null then
      raise exception '%TA 还没加入账本，不能记共同账', v_where;
    end if;

    -- 谁付的
    case coalesce(nullif(v_item ->> 'payer', ''), 'me')
      when 'me' then v_payer := v_user;
      when 'partner' then v_payer := v_partner;
      else raise exception '%payer 只能是 me 或 partner', v_where;
    end case;
    if v_type = 'personal' and v_payer <> v_user then
      raise exception '%不能替 TA 记个人账', v_where;
    end if;

    -- 比例：ratio 存「付款人承担几成」，可以是小数（按金额分）
    if v_type = 'personal' then
      v_ratio := 10;
    else
      begin
        if v_item ? 'my_amount' and v_item ->> 'my_amount' is not null then
          v_share := round((v_item ->> 'my_amount')::numeric, 2);
          if v_share < 0 or v_share > v_amount then
            raise exception 'range';
          end if;
          v_share := v_share * 10 / v_amount;
        else
          v_share := coalesce((v_item ->> 'my_share')::numeric, 5);
          if v_share < 0 or v_share > 10 then
            raise exception 'range';
          end if;
        end if;
      exception when others then
        raise exception '%my_share 要在 0 到 10 之间，my_amount 要在 0 到金额之间', v_where;
      end;
      v_ratio := case when v_payer = v_user then v_share else 10 - v_share end;
    end if;

    -- 分类
    v_cat := trim(coalesce(v_item ->> 'category', ''));
    v_sub := nullif(trim(coalesce(v_item ->> 'sub_category', '')), '');
    select c into v_cat_def from jsonb_array_elements(v_cats -> v_kind) c where c ->> 'name' = v_cat limit 1;
    if v_cat_def is null then
      raise exception '%没有「%」这个%分类，可以用：%', v_where, v_cat, case when v_kind = 'income' then '收入' else '支出' end,
        (select string_agg(c ->> 'name', '、') from jsonb_array_elements(v_cats -> v_kind) c);
    end if;
    if v_sub is not null and not (v_cat_def -> 'subs') ? v_sub then
      raise exception '%「%」下面没有「%」，可以用：%', v_where, v_cat, v_sub,
        coalesce(nullif((select string_agg(s, '、') from jsonb_array_elements_text(v_cat_def -> 'subs') s), ''), '（没有子分类）');
    end if;

    v_note := nullif(trim(coalesce(v_item ->> 'note', '')), '');
    if char_length(v_note) > 200 then
      raise exception '%备注太长了（最多 200 字）', v_where;
    end if;

    -- 去重
    v_ext := nullif(trim(coalesce(v_item ->> 'external_id', '')), '');
    if char_length(v_ext) > 200 then
      raise exception '%external_id 太长了', v_where;
    end if;
    if v_ext is not null and (v_ext = any(v_seen) or exists (select 1 from public.records where book_id = v_book and external_id = v_ext)) then
      v_skipped := v_skipped || jsonb_build_object('index', v_i, 'external_id', v_ext);
      continue;
    end if;
    if v_ext is not null then
      v_seen := v_seen || v_ext;
    end if;

    insert into public.records (book_id, amount, kind, type, payer_uid, ratio, category, sub_category, note, date, created_by, external_id)
    values (v_book, v_amount, v_kind, v_type, v_payer, v_ratio, v_cat, v_sub, v_note, v_date, v_user, v_ext)
    returning * into v_row;
    v_added := v_added || jsonb_build_object('index', v_i, 'id', v_row.id, 'external_id', v_ext);
  end loop;

  perform set_config('app.acting_uid', '', true);
  return jsonb_build_object('added', jsonb_array_length(v_added), 'skipped', jsonb_array_length(v_skipped), 'records', v_added, 'duplicates', v_skipped);
end;
$$;

-- ── api_delete_records：删掉自己记的（agent 记错了可以撤回） ──
create or replace function public.api_delete_records(token text, ids jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_book uuid;
  v_ids uuid[];
  v_count integer;
begin
  select o_user, o_book into v_user, v_book from public.api_auth(token);
  begin
    select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(case when jsonb_typeof(ids) = 'array' then ids else jsonb_build_array(ids) end) x;
  exception when others then
    raise exception 'ids 要是账单 id 的数组';
  end;
  if v_ids is null then
    raise exception 'ids 不能是空的';
  end if;
  delete from public.records where book_id = v_book and created_by = v_user and id = any(v_ids);
  get diagnostics v_count = row_count;
  perform set_config('app.acting_uid', '', true);
  return jsonb_build_object('deleted', v_count);
end;
$$;

-- 权限：管密钥要登录；api_* 用密钥认人，匿名也能调（不带对的密钥什么都做不了）
revoke all on function public.create_api_token(uuid, text) from public, anon;
revoke all on function public.revoke_api_token(uuid) from public, anon;
grant execute on function public.create_api_token(uuid, text) to authenticated;
grant execute on function public.revoke_api_token(uuid) to authenticated;

revoke all on function public.api_auth(text) from public, anon, authenticated;
revoke all on function public.api_categories(uuid) from public, anon, authenticated;
revoke all on function public.api_builtin_categories() from public, anon, authenticated;
revoke all on function public.api_token_hash(text) from public, anon, authenticated;

grant execute on function public.api_info(text) to anon, authenticated;
grant execute on function public.api_add_records(text, jsonb) to anon, authenticated;
grant execute on function public.api_delete_records(text, jsonb) to anon, authenticated;
