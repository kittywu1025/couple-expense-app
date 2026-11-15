-- 2026-11-15 自查优化
-- 可以重复执行。

-- ① 实时同步：对方记账、改账、记还款时，另一台手机马上刷新。
--    Realtime 照样走 RLS，只会收到自己账本里的变化。
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice '没有 supabase_realtime 发布，跳过实时同步';
    return;
  end if;
  foreach t in array array['records', 'loans', 'loan_repayments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ② 记账接口小修（和 20261114_agent_api.sql 里的一致）：
--    日期不能晚于今天（以前多放了一天）、不能早于 2000 年；
--    账本只有一个人时 payer 写 partner 给出明白的提示；
--    两个请求同时导入同一笔时当成重复跳过，不让整批失败。
create or replace function public.api_add_records(token text, items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
    if v_date > v_today then
      raise exception '%日期不能晚于今天（日本时间 %）', v_where, v_today;
    end if;
    if v_date < date '2000-01-01' then
      raise exception '%日期太早了，检查一下年份', v_where;
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
    if v_payer is null then
      raise exception '%TA 还没加入账本，payer 只能是 me', v_where;
    end if;
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

    -- 两个请求同时导入同一笔：后到的那笔当成重复跳过，不让整批失败
    insert into public.records (book_id, amount, kind, type, payer_uid, ratio, category, sub_category, note, date, created_by, external_id)
    values (v_book, v_amount, v_kind, v_type, v_payer, v_ratio, v_cat, v_sub, v_note, v_date, v_user, v_ext)
    on conflict (book_id, external_id) where external_id is not null do nothing
    returning * into v_row;
    if not found then
      v_skipped := v_skipped || jsonb_build_object('index', v_i, 'external_id', v_ext);
      continue;
    end if;
    v_added := v_added || jsonb_build_object('index', v_i, 'id', v_row.id, 'external_id', v_ext);
  end loop;

  perform set_config('app.acting_uid', '', true);
  return jsonb_build_object('added', jsonb_array_length(v_added), 'skipped', jsonb_array_length(v_skipped), 'records', v_added, 'duplicates', v_skipped);
end;
$$;

-- ③ 撤销能原样恢复：删账单、改账单之前先存一份，「撤销」时照原样放回去。
--    以前撤销删除是「再记一笔」，会丢掉结清、有疑问、留言、导入编号，对方还会再收到「TA 新记了」。
create table if not exists public.record_snapshots (
  id bigserial primary key,
  record_id uuid not null,
  book_id uuid not null,
  op text not null check (op in ('update', 'delete')),
  row jsonb not null,
  actor uuid,
  at timestamptz not null default now(),
  -- 撤销用过了：再点一次不会把更早的一步也撤掉
  restored boolean not null default false
);
alter table public.record_snapshots add column if not exists restored boolean not null default false;
create index if not exists record_snapshots_record_idx on public.record_snapshots (record_id, id desc);
create index if not exists record_snapshots_at_idx on public.record_snapshots (at);
alter table public.record_snapshots enable row level security;
revoke all on public.record_snapshots from anon, authenticated;

create or replace function public.snapshot_record()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.record_snapshots (record_id, book_id, op, row, actor)
  values (old.id, old.book_id, lower(tg_op), to_jsonb(old),
          coalesce(nullif(current_setting('app.acting_uid', true), '')::uuid, auth.uid()));
  -- 只留一天，撤销只要几秒钟
  delete from public.record_snapshots where at < now() - interval '1 day';
  return null;
end;
$$;
revoke all on function public.snapshot_record() from public, anon, authenticated;

drop trigger if exists records_snapshot on public.records;
create trigger records_snapshot
  after update or delete on public.records
  for each row execute function public.snapshot_record();

-- 撤销自己 10 分钟内的删除 / 修改。对方在那之后又改过就不能撤了（最新一份不是自己的）。
create or replace function public.restore_record(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_snap public.record_snapshots;
begin
  if v_uid is null then
    raise exception '请先登录' using errcode = '28000';
  end if;
  select * into v_snap from public.record_snapshots where record_id = p_id order by id desc limit 1;
  if not found or v_snap.actor is distinct from v_uid or v_snap.at < now() - interval '10 minutes' then
    raise exception '这一步已经撤销不了了';
  end if;
  if not exists (select 1 from public.book_members where book_id = v_snap.book_id and user_id = v_uid) then
    raise exception '你已经不在这个账本里了' using errcode = '28000';
  end if;
  if v_snap.restored then
    return; -- 已经撤销过了
  end if;
  if v_snap.op = 'update' and not exists (select 1 from public.records where id = p_id) then
    raise exception '这笔已经被删掉了，撤销不了';
  end if;

  -- 原样放回：不经过确认守卫（不然会被当成新记的 / 新改的），也不再存一份
  alter table public.records disable trigger records_confirm_guard;
  alter table public.records disable trigger records_snapshot;
  delete from public.records where id = p_id;
  insert into public.records select (jsonb_populate_record(null::public.records, v_snap.row)).*;
  update public.record_snapshots set restored = true where id = v_snap.id;
  alter table public.records enable trigger records_confirm_guard;
  alter table public.records enable trigger records_snapshot;
end;
$$;
revoke all on function public.restore_record(uuid) from public, anon;
grant execute on function public.restore_record(uuid) to authenticated;

-- ④ 按月算账一次做完、对方「没收到」时整批退回。
--    以前「算这个月」分两步：我先垫的直接结清、我该给的告诉 TA。TA 点「没收到」只退回后一半，
--    我先垫的那几笔还是结清的，等于 TA 欠我的那部分凭空没了。
--    现在同一次算账的账单记在同一个 settle_batch 里：算账在一个事务里做完，TA 点「没收到」时同一批的一起退回。
alter table public.records add column if not exists settle_batch uuid;

create or replace function public.settle_batch(p_receive uuid[], p_pay uuid[])
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_book uuid;
  v_batch uuid := gen_random_uuid();
begin
  if v_uid is null then
    raise exception '请先登录' using errcode = '28000';
  end if;
  select book_id into v_book from public.book_members where user_id = v_uid limit 1;
  if v_book is null then
    raise exception '你还没有加入账本' using errcode = '28000';
  end if;
  -- 我先垫的：直接结清（确认守卫会按我是付款人放行）
  update public.records set settled_on_spot = true, settle_batch = v_batch
  where id = any(coalesce(p_receive, '{}')) and book_id = v_book and type = 'shared'
    and payer_uid = v_uid and not settled_on_spot;
  -- 我该给的：告诉 TA「我给了」
  update public.records set paid_claimed_at = now(), settle_batch = v_batch
  where id = any(coalesce(p_pay, '{}')) and book_id = v_book and type = 'shared'
    and payer_uid <> v_uid and not settled_on_spot and paid_claimed_at is null;
  return v_batch;
end;
$$;
revoke all on function public.settle_batch(uuid[], uuid[]) from public, anon;
grant execute on function public.settle_batch(uuid[], uuid[]) to authenticated;

-- TA 说给了、我点「没收到」：清掉这几笔的「我给了」，同一次算账里 TA 先垫、已经结清的也退回「还没给」
create or replace function public.reject_paid_claims(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_book uuid;
  v_batches uuid[];
  v_other uuid;
  v_n integer;
begin
  if v_uid is null then
    raise exception '请先登录' using errcode = '28000';
  end if;
  select book_id into v_book from public.book_members where user_id = v_uid limit 1;
  select array_agg(distinct settle_batch) filter (where settle_batch is not null) into v_batches
  from public.records
  where id = any(coalesce(p_ids, '{}')) and book_id = v_book and payer_uid = v_uid and paid_claimed_at is not null;

  update public.records set paid_claimed_at = null, settle_batch = null
  where id = any(coalesce(p_ids, '{}')) and book_id = v_book and payer_uid = v_uid and paid_claimed_at is not null;
  get diagnostics v_n = row_count;

  if v_batches is not null then
    select user_id into v_other from public.book_members where book_id = v_book and user_id <> v_uid limit 1;
    -- 以 TA 的名义撤销 TA 那几笔的结清（确认守卫只让付款人改结清）
    perform set_config('app.acting_uid', v_other::text, true);
    update public.records set settled_on_spot = false, settle_batch = null
    where book_id = v_book and settle_batch = any(v_batches) and payer_uid = v_other and settled_on_spot;
    perform set_config('app.acting_uid', '', true);
  end if;
  return v_n;
end;
$$;
revoke all on function public.reject_paid_claims(uuid[]) from public, anon;
grant execute on function public.reject_paid_claims(uuid[]) to authenticated;

-- ⑤ 共同月预算：两个人一起定，每个结算周期的共同支出不超过多少；不设就是 null。
alter table public.books add column if not exists monthly_budget numeric;
alter table public.books drop constraint if exists books_monthly_budget_check;
alter table public.books add constraint books_monthly_budget_check
  check (monthly_budget is null or (monthly_budget > 0 and monthly_budget <= 99999999));
