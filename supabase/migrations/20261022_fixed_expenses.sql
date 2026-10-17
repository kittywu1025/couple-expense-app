-- 固定扣款：每月固定日期自动生成一条账单。
-- 在 20261021_revoke_anon_rpc.sql 之后执行，可重复执行。
--
-- ⚠️ 旧版 App 也有一张 fixed_expenses 表（结构不同、新版不再使用），
--    这里会把旧表和 fixed_expense_runs 一起删掉重建。旧版的固定扣款数据会丢失。

do $$
begin
  -- 只在还是旧结构（没有 payer_uid 列）时删除，重复执行不会误删新数据
  if exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'fixed_expenses'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fixed_expenses' and column_name = 'payer_uid'
  ) then
    drop table if exists public.fixed_expense_runs cascade;
    drop table public.fixed_expenses cascade;
  end if;
end $$;

create table if not exists public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 20),
  amount numeric(12, 2) not null check (amount > 0),
  category text not null,
  sub_category text,
  -- 每月几号扣款；大于当月天数时按月底算（如 31 号在 2 月就是 28/29 号）
  day_of_month integer not null check (day_of_month between 1 and 31),
  payer_uid uuid not null references auth.users(id) on delete cascade,
  type text not null default 'personal' check (type in ('personal', 'shared')),
  -- 和 records.ratio 一样：付款人承担的份额 0-10
  ratio integer not null default 10 check (ratio between 0 and 10),
  paused boolean not null default false,
  -- 从这天开始算（添加当天），之前的日期不补生成
  start_date date not null default current_date,
  -- 最近一次已经生成到的扣款日期，避免重复生成
  last_generated_date date,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_fixed_expenses_book on public.fixed_expenses(book_id);

alter table public.fixed_expenses enable row level security;

drop policy if exists "fixed_expenses_select_members" on public.fixed_expenses;
drop policy if exists "fixed_expenses_insert_members" on public.fixed_expenses;
drop policy if exists "fixed_expenses_update_members" on public.fixed_expenses;
drop policy if exists "fixed_expenses_delete_members" on public.fixed_expenses;
create policy "fixed_expenses_select_members" on public.fixed_expenses
  for select to authenticated using (public.is_book_member(book_id));
create policy "fixed_expenses_insert_members" on public.fixed_expenses
  for insert to authenticated with check (public.is_book_member(book_id) and created_by = auth.uid());
create policy "fixed_expenses_update_members" on public.fixed_expenses
  for update to authenticated using (public.is_book_member(book_id)) with check (public.is_book_member(book_id));
create policy "fixed_expenses_delete_members" on public.fixed_expenses
  for delete to authenticated using (public.is_book_member(book_id));

-- 生成到期的固定扣款。两个人同时打开 App 也不会重复：逐条加行锁，并以 last_generated_date 为准。
-- p_today 传用户手机上的「今天」（日本时间），最多比服务器日期多 1 天。
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
begin
  if not public.is_book_member(p_book_id) then
    raise exception '没有权限';
  end if;

  for f in
    select * from public.fixed_expenses
    where book_id = p_book_id and not paused
    for update
  loop
    v_month := date_trunc('month', greatest(f.start_date, coalesce(f.last_generated_date + 1, f.start_date)))::date;
    loop
      v_last_day := extract(day from (v_month + interval '1 month - 1 day'))::integer;
      v_due := v_month + (least(f.day_of_month, v_last_day) - 1);
      exit when v_due > v_today;
      if v_due >= f.start_date and (f.last_generated_date is null or v_due > f.last_generated_date) then
        insert into public.records (book_id, amount, kind, type, payer_uid, ratio, category, sub_category, note, date, created_by)
        values (f.book_id, f.amount, 'expense', f.type, f.payer_uid, f.ratio, f.category, f.sub_category,
                f.name || '（固定扣款）', v_due, f.created_by);
        update public.fixed_expenses set last_generated_date = v_due where id = f.id;
        f.last_generated_date := v_due;
        v_count := v_count + 1;
      end if;
      v_month := (v_month + interval '1 month')::date;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.generate_fixed_expenses(uuid, date) from public;
revoke execute on function public.generate_fixed_expenses(uuid, date) from anon;
grant execute on function public.generate_fixed_expenses(uuid, date) to authenticated;
