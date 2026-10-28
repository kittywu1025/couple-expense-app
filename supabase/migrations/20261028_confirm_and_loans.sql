-- 共同账单需要对方确认 + 有疑问时留言 / 提议比例 + 当场结清 + 两人之间的借款 / 还款。
-- 在 20261024_record_permissions.sql 之后执行，可重复执行（之前执行过旧版本的，再执行一遍即可）。
--
-- 确认规则（共同账单、借款、还款通用）：
--   · 谁新建或改了金额 / 类型 / 付款人 / 比例 / 分类 / 日期，就由「另一个人」确认，状态变回 pending
--   · 只改备注不需要重新确认
--   · 自己记的、自己改的不能自己确认；对方可以「确认」或「有疑问」（可留言、提议比例）
--   · 有疑问后，记账人可以回复（重新请对方确认）、按对方提议的比例改（直接算确认）或者自己改
--   · 账本只有一个人时直接算已确认
-- 以前的账单一律视为已确认。

-- ───────── 通用确认守卫 ─────────
-- discussion：两人来回的留言（有疑问 / 回复），只能往后加；有疑问时可以附一个提议的比例 ratio（付款人份额 0-10）
create or replace function public.confirm_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 固定扣款自动生成时，按设置这项扣款的人算「记账人」
  v_actor uuid := coalesce(nullif(current_setting('app.acting_uid', true), '')::uuid, auth.uid());
  v_strip text[] := array['confirm_status', 'last_edited_by', 'note', 'discussion'];
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

-- ───────── records：加确认状态 ─────────
alter table public.records
  add column if not exists confirm_status text not null default 'confirmed',
  add column if not exists last_edited_by uuid references auth.users(id) on delete set null,
  add column if not exists discussion jsonb not null default '[]'::jsonb,
  -- AA 的那份当场就给了：照常算各自承担，但不进月末差额
  add column if not exists settled_on_spot boolean not null default false;

alter table public.records drop constraint if exists records_confirm_status_check;
alter table public.records add constraint records_confirm_status_check
  check (confirm_status in ('confirmed', 'pending', 'disputed'));

update public.records set last_edited_by = created_by where last_edited_by is null;

drop trigger if exists records_confirm_guard on public.records;
create trigger records_confirm_guard
  before insert or update on public.records
  for each row execute function public.confirm_guard();

-- ───────── loans：借款 ─────────
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  lender_uid uuid not null references auth.users(id) on delete cascade,
  borrower_uid uuid not null references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  note text check (note is null or char_length(note) <= 50),
  date date not null default current_date,
  confirm_status text not null default 'pending' check (confirm_status in ('confirmed', 'pending', 'disputed')),
  last_edited_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (lender_uid <> borrower_uid)
);

create index if not exists idx_loans_book on public.loans(book_id);

-- ───────── loan_repayments：还款（可以分几次还） ─────────
create table if not exists public.loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  note text check (note is null or char_length(note) <= 50),
  date date not null default current_date,
  confirm_status text not null default 'pending' check (confirm_status in ('confirmed', 'pending', 'disputed')),
  last_edited_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_loan_repayments_loan on public.loan_repayments(loan_id);
create index if not exists idx_loan_repayments_book on public.loan_repayments(book_id);

-- 留言（已经建过表的也补上）
alter table public.loans add column if not exists discussion jsonb not null default '[]'::jsonb;
alter table public.loan_repayments add column if not exists discussion jsonb not null default '[]'::jsonb;

drop trigger if exists loans_confirm_guard on public.loans;
create trigger loans_confirm_guard
  before insert or update on public.loans
  for each row execute function public.confirm_guard();

drop trigger if exists loan_repayments_confirm_guard on public.loan_repayments;
create trigger loan_repayments_confirm_guard
  before insert or update on public.loan_repayments
  for each row execute function public.confirm_guard();

alter table public.loans enable row level security;
alter table public.loan_repayments enable row level security;

drop policy if exists "loans_select_members" on public.loans;
drop policy if exists "loans_insert_members" on public.loans;
drop policy if exists "loans_update_members" on public.loans;
drop policy if exists "loans_delete_members" on public.loans;
create policy "loans_select_members" on public.loans
  for select to authenticated using (public.is_book_member(book_id));
create policy "loans_insert_members" on public.loans
  for insert to authenticated
  with check (
    public.is_book_member(book_id)
    and created_by = auth.uid()
    and auth.uid() in (lender_uid, borrower_uid)
    and exists (select 1 from public.book_members m where m.book_id = loans.book_id and m.user_id = lender_uid)
    and exists (select 1 from public.book_members m where m.book_id = loans.book_id and m.user_id = borrower_uid)
  );
create policy "loans_update_members" on public.loans
  for update to authenticated using (public.is_book_member(book_id)) with check (public.is_book_member(book_id));
-- 借出的人可以删（相当于不用还了）；借入的人只能删自己记的、对方还没确认的
create policy "loans_delete_members" on public.loans
  for delete to authenticated
  using (
    public.is_book_member(book_id)
    and (lender_uid = auth.uid() or (created_by = auth.uid() and confirm_status <> 'confirmed'))
  );

drop policy if exists "loan_repayments_select_members" on public.loan_repayments;
drop policy if exists "loan_repayments_insert_members" on public.loan_repayments;
drop policy if exists "loan_repayments_update_members" on public.loan_repayments;
drop policy if exists "loan_repayments_delete_members" on public.loan_repayments;
create policy "loan_repayments_select_members" on public.loan_repayments
  for select to authenticated using (public.is_book_member(book_id));
create policy "loan_repayments_insert_members" on public.loan_repayments
  for insert to authenticated
  with check (
    public.is_book_member(book_id)
    and created_by = auth.uid()
    and exists (select 1 from public.loans l where l.id = loan_id and l.book_id = loan_repayments.book_id)
  );
create policy "loan_repayments_update_members" on public.loan_repayments
  for update to authenticated using (public.is_book_member(book_id)) with check (public.is_book_member(book_id));
-- 已确认的还款只有借出的人能删；没确认的记录人自己也能删
create policy "loan_repayments_delete_members" on public.loan_repayments
  for delete to authenticated
  using (
    public.is_book_member(book_id)
    and (
      exists (select 1 from public.loans l where l.id = loan_id and l.lender_uid = auth.uid())
      or (created_by = auth.uid() and confirm_status <> 'confirmed')
    )
  );

-- ───────── 固定扣款：自动生成的共同账单由「设置这项扣款的人」记，对方确认 ─────────
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
    perform set_config('app.acting_uid', f.created_by::text, true);
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
  perform set_config('app.acting_uid', '', true);

  return v_count;
end;
$$;

revoke all on function public.generate_fixed_expenses(uuid, date) from public;
revoke execute on function public.generate_fixed_expenses(uuid, date) from anon;
grant execute on function public.generate_fixed_expenses(uuid, date) to authenticated;
revoke all on function public.confirm_guard() from public, anon, authenticated;
