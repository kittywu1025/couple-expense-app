-- 重构版数据结构：books / book_members / records
-- 可在已有数据库上重复执行（幂等）。旧的 expenses / fixed_expenses 表不受影响。

create extension if not exists pgcrypto;

-- ───────── books ─────────
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  settle_day integer not null default 1,
  default_ratio integer not null default 5,
  currency text not null default 'JPY',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.books
  add column if not exists settle_day integer not null default 1,
  add column if not exists default_ratio integer not null default 5,
  add column if not exists currency text not null default 'JPY';

-- 旧版 books 有 name 列，新版不再需要
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'books' and column_name = 'name'
  ) then
    alter table public.books alter column name drop not null;
  end if;
end $$;

alter table public.books drop constraint if exists books_settle_day_check;
alter table public.books add constraint books_settle_day_check check (settle_day between 1 and 28);
alter table public.books drop constraint if exists books_default_ratio_check;
alter table public.books add constraint books_default_ratio_check check (default_ratio between 0 and 10);
alter table public.books drop constraint if exists books_currency_check;
alter table public.books add constraint books_currency_check
  check (currency in ('JPY', 'CNY', 'USD', 'KRW', 'TWD', 'HKD'));

-- ───────── book_members ─────────
create table if not exists public.book_members (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  -- 性别由用户自己设定，用于记录列表的付款人底色（female 粉 / male 蓝）
  gender text check (gender in ('female', 'male')),
  joined_at timestamptz not null default now(),
  unique (book_id, user_id)
);

alter table public.book_members
  add column if not exists gender text check (gender in ('female', 'male'));

-- 旧版 book_members 有 role 列，新版不再需要
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'book_members' and column_name = 'role'
  ) then
    alter table public.book_members alter column role drop not null;
  end if;
end $$;

-- ───────── records ─────────
create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  -- 支出 / 收入（记账页的「支出·收入」切换）
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  type text not null default 'personal' check (type in ('personal', 'shared')),
  payer_uid uuid not null references auth.users(id) on delete cascade,
  -- 付款人承担的份额（0-10）。10 = 付款人请客，0 = 对方请客
  ratio integer not null default 5 check (ratio between 0 and 10),
  category text not null,
  sub_category text,
  note text,
  date date not null default current_date,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_book_members_user_id on public.book_members(user_id);
create index if not exists idx_book_members_book_id on public.book_members(book_id);
create index if not exists idx_records_book_date on public.records(book_id, date desc);

alter table public.books enable row level security;
alter table public.book_members enable row level security;
alter table public.records enable row level security;

-- ───────── helpers ─────────
create or replace function public.is_book_member(p_book_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.book_members
    where book_id = p_book_id and user_id = auth.uid()
  );
$$;

create or replace function public.gen_invite_code()
returns text
language sql
volatile
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$$;

-- 创建账本：生成 6 位邀请码，并把自己加为成员
drop function if exists public.create_book(text);
drop function if exists public.join_book(text, text);

create or replace function public.create_book(p_display_name text, p_gender text default null)
returns setof public.books
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book public.books;
  v_attempt integer := 0;
begin
  if auth.uid() is null then
    raise exception '未登录用户不能创建账本';
  end if;

  loop
    begin
      insert into public.books (invite_code, created_by)
      values (public.gen_invite_code(), auth.uid())
      returning * into v_book;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt >= 5 then
        raise exception '邀请码生成失败，请重试';
      end if;
    end;
  end loop;

  insert into public.book_members (book_id, user_id, display_name, gender)
  values (v_book.id, auth.uid(), nullif(trim(p_display_name), ''), p_gender);

  return query select * from public.books where id = v_book.id;
end;
$$;

-- 通过邀请码加入：一个账本最多两人
create or replace function public.join_book(p_invite_code text, p_display_name text, p_gender text default null)
returns setof public.books
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book public.books;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception '未登录用户不能加入账本';
  end if;

  select * into v_book from public.books where invite_code = upper(trim(p_invite_code));
  if not found then
    raise exception '邀请码不存在';
  end if;

  if public.is_book_member(v_book.id) then
    raise exception '你已经在这个账本中';
  end if;

  select count(*) into v_count from public.book_members where book_id = v_book.id;
  if v_count >= 2 then
    raise exception '这个账本已经满两人了';
  end if;

  insert into public.book_members (book_id, user_id, display_name, gender)
  values (v_book.id, auth.uid(), nullif(trim(p_display_name), ''), p_gender);

  return query select * from public.books where id = v_book.id;
end;
$$;

-- 退出账本：最后一人退出时连同账本和记录一起删除
create or replace function public.leave_book(p_book_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.book_members where book_id = p_book_id and user_id = auth.uid();
  if not exists (select 1 from public.book_members where book_id = p_book_id) then
    delete from public.books where id = p_book_id;
  end if;
end;
$$;

revoke all on function public.is_book_member(uuid) from public;
revoke all on function public.create_book(text, text) from public;
revoke all on function public.join_book(text, text, text) from public;
revoke all on function public.leave_book(uuid) from public;
grant execute on function public.is_book_member(uuid) to authenticated;
grant execute on function public.create_book(text, text) to authenticated;
grant execute on function public.join_book(text, text, text) to authenticated;
grant execute on function public.leave_book(uuid) to authenticated;

-- ───────── RLS ─────────
drop policy if exists "books_select_members" on public.books;
drop policy if exists "books_insert_authenticated" on public.books;
drop policy if exists "books_update_members" on public.books;
create policy "books_select_members" on public.books
  for select to authenticated using (public.is_book_member(id));
create policy "books_update_members" on public.books
  for update to authenticated
  using (public.is_book_member(id)) with check (public.is_book_member(id));

drop policy if exists "book_members_select_self" on public.book_members;
drop policy if exists "book_members_select_same_book" on public.book_members;
drop policy if exists "book_members_insert_self" on public.book_members;
drop policy if exists "book_members_update_self" on public.book_members;
create policy "book_members_select_same_book" on public.book_members
  for select to authenticated using (public.is_book_member(book_id));
create policy "book_members_update_self" on public.book_members
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "records_select_members" on public.records;
drop policy if exists "records_insert_members" on public.records;
drop policy if exists "records_update_members" on public.records;
drop policy if exists "records_delete_members" on public.records;
create policy "records_select_members" on public.records
  for select to authenticated using (public.is_book_member(book_id));
create policy "records_insert_members" on public.records
  for insert to authenticated
  with check (public.is_book_member(book_id) and created_by = auth.uid());
create policy "records_delete_members" on public.records
  for delete to authenticated using (public.is_book_member(book_id));
create policy "records_update_members" on public.records
  for update to authenticated
  using (public.is_book_member(book_id)) with check (public.is_book_member(book_id));
