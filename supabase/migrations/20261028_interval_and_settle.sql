-- 1. 固定扣款支持自定义周期：每 N 个月扣一次（1 = 每月，2 = 每两个月，3 = 每季度，6 = 每半年，12 = 每年）。
-- 3. 借款可以记外币（默认账本货币），还款跟着借款的货币。
-- 2. 结清：AA 账单里对方那份给了之后，由先垫钱的人在「结清」页标记「已收到」，不进月末差额。
-- 在 20261028_confirm_and_loans.sql 之后执行，可重复执行。
--
-- 扣款日期的算法：从 start_date 起第一个到期的「N 号」是第一次，之后每隔 interval_months 个月一次。
-- 超过当月天数的按月底（如 31 号在 2 月就是 28/29 号）。

alter table public.fixed_expenses
  add column if not exists interval_months integer not null default 1;

alter table public.fixed_expenses drop constraint if exists fixed_expenses_interval_months_check;
alter table public.fixed_expenses add constraint fixed_expenses_interval_months_check
  check (interval_months between 1 and 12);

create or replace function public.generate_fixed_expenses(p_book_id uuid, p_today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.fixed_expenses;
  v_today date := least(p_today, current_date + 1);
  v_month date;
  v_due date;
  v_last_day integer;
  v_count integer := 0;
  v_guard integer;
begin
  if not public.is_book_member(p_book_id) then
    raise exception '没有权限';
  end if;

  for f in
    select * from public.fixed_expenses
    where book_id = p_book_id and not paused
    for update
  loop
    -- 自动生成的共同账单由「设置这项扣款的人」记，对方确认（见 confirm_guard）
    perform set_config('app.acting_uid', f.created_by::text, true);

    -- 第一次扣款：start_date 当月的扣款日已经过了就从下个月开始
    v_month := date_trunc('month', f.start_date)::date;
    v_last_day := extract(day from (v_month + interval '1 month - 1 day'))::integer;
    if v_month + (least(f.day_of_month, v_last_day) - 1) < f.start_date then
      v_month := (v_month + interval '1 month')::date;
    end if;

    v_guard := 0;
    loop
      v_guard := v_guard + 1;
      exit when v_guard > 240;
      v_last_day := extract(day from (v_month + interval '1 month - 1 day'))::integer;
      v_due := v_month + (least(f.day_of_month, v_last_day) - 1);
      exit when v_due > v_today;
      if f.last_generated_date is null or v_due > f.last_generated_date then
        insert into public.records (book_id, amount, kind, type, payer_uid, ratio, category, sub_category, note, date, created_by)
        values (f.book_id, f.amount, 'expense', f.type, f.payer_uid, f.ratio, f.category, f.sub_category,
                f.name || '（固定扣款）', v_due, f.created_by);
        update public.fixed_expenses set last_generated_date = v_due where id = f.id;
        f.last_generated_date := v_due;
        v_count := v_count + 1;
      end if;
      v_month := (v_month + make_interval(months => f.interval_months))::date;
    end loop;
  end loop;
  perform set_config('app.acting_uid', '', true);

  return v_count;
end;
$$;

revoke all on function public.generate_fixed_expenses(uuid, date) from public;
revoke execute on function public.generate_fixed_expenses(uuid, date) from anon;
grant execute on function public.generate_fixed_expenses(uuid, date) to authenticated;

-- ───────── 借款货币 ─────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'loans' and column_name = 'currency'
  ) then
    alter table public.loans add column currency text not null default 'JPY';
    -- 以前记的借款按账本货币算（只在第一次加列时做，重复执行不会改到后来记的）
    update public.loans l set currency = b.currency from public.books b where b.id = l.book_id;
  end if;
end $$;
alter table public.loans drop constraint if exists loans_currency_check;
alter table public.loans add constraint loans_currency_check
  check (currency in ('JPY', 'CNY', 'USD', 'KRW', 'TWD', 'HKD'));

-- ───────── 结清：记下什么时候收到的 ─────────
alter table public.records
  add column if not exists settled_at timestamptz;

-- 确认守卫加上结清规则（其余和 20261028_confirm_and_loans.sql 一样）
create or replace function public.confirm_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 固定扣款自动生成时，按设置这项扣款的人算「记账人」
  v_actor uuid := coalesce(nullif(current_setting('app.acting_uid', true), '')::uuid, auth.uid());
  -- 「已收到」由先垫钱的人自己标记，不算内容改动、不用对方再确认（下面单独检查）
  v_strip text[] := array['confirm_status', 'last_edited_by', 'note', 'discussion', 'settled_on_spot', 'settled_at'];
  v_new jsonb := to_jsonb(new) - v_strip;
  v_old jsonb;
  v_old_len integer;
  v_proposal jsonb;
  v_members integer;
begin
  -- SQL Editor / 后台直接改数据：不干预
  if v_actor is null then
    if tg_op = 'INSERT' then
      new.last_edited_by := coalesce(new.last_edited_by, new.created_by);
    end if;
    return new;
  end if;

  -- 结清（只有账单有）：只有先垫钱的人（付款人）能标记「已收到」或撤销
  if to_jsonb(new) ? 'settled_on_spot' then
    if tg_op = 'INSERT' then
      if new.settled_on_spot and v_actor is distinct from new.payer_uid then
        new.settled_on_spot := false;
      end if;
      new.settled_at := case when new.settled_on_spot then now() end;
    elsif new.settled_on_spot is distinct from old.settled_on_spot then
      if v_actor is distinct from old.payer_uid then
        raise exception '只有先垫钱的人能标记已收到';
      end if;
      new.settled_at := case when new.settled_on_spot then now() end;
    else
      new.settled_at := old.settled_at;
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.discussion := '[]'::jsonb;
  else
    -- 留言只能往后加，不能改以前的
    v_old_len := jsonb_array_length(old.discussion);
    if jsonb_array_length(new.discussion) < v_old_len
       or coalesce((select jsonb_agg(e order by i) from jsonb_array_elements(new.discussion) with ordinality t(e, i) where i <= v_old_len), '[]'::jsonb)
          <> old.discussion then
      raise exception '以前的留言不能改';
    end if;

    v_old := to_jsonb(old) - v_strip;
    if v_new = v_old then
      -- 内容没变：确认 / 有疑问 / 回复 / 改备注
      new.last_edited_by := old.last_edited_by;
      if new.confirm_status is distinct from old.confirm_status then
        if v_actor = old.last_edited_by then
          -- 记账人回复疑问后，重新请对方确认
          if not (old.confirm_status = 'disputed' and new.confirm_status = 'pending') then
            raise exception '自己记的账要等 TA 确认';
          end if;
        elsif new.confirm_status not in ('confirmed', 'disputed') then
          raise exception '确认状态不对';
        end if;
      end if;
      return new;
    end if;

    -- 记账人「按 TA 说的改」比例：对方提议的，直接算确认
    v_proposal := old.discussion -> -1;
    if old.confirm_status = 'disputed'
       and v_actor = old.last_edited_by
       and v_proposal ? 'ratio'
       and (v_proposal ->> 'by') is distinct from v_actor::text
       and v_new = jsonb_set(v_old, '{ratio}', v_proposal -> 'ratio') then
      new.last_edited_by := v_actor;
      new.confirm_status := 'confirmed';
      return new;
    end if;
  end if;

  -- 新建或内容有改动
  new.last_edited_by := v_actor;
  select count(*) into v_members from public.book_members where book_id = new.book_id;
  if v_members >= 2 and coalesce(v_new ->> 'type', 'shared') = 'shared' then
    new.confirm_status := 'pending';
  else
    new.confirm_status := 'confirmed';
  end if;
  return new;
end;
$$;
