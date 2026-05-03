create extension if not exists pgcrypto;

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.book_members (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  display_name text,
  joined_at timestamptz not null default now(),
  unique (book_id, user_id)
);

alter table public.expenses
  add column if not exists book_id uuid references public.books(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.expenses
set created_by = coalesce(created_by, user_id)
where created_by is null;

create index if not exists idx_books_invite_code on public.books(invite_code);
create index if not exists idx_book_members_user_id on public.book_members(user_id);
create index if not exists idx_book_members_book_id on public.book_members(book_id);
create index if not exists idx_expenses_book_id on public.expenses(book_id);
create index if not exists idx_expenses_created_by on public.expenses(created_by);

alter table public.books enable row level security;
alter table public.book_members enable row level security;
alter table public.expenses enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_books_updated_at on public.books;
create trigger set_books_updated_at
before update on public.books
for each row
execute function public.set_updated_at();

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
before update on public.expenses
for each row
execute function public.set_updated_at();

create or replace function public.is_book_member(p_book_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.book_members
    where book_id = p_book_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_book_owner(p_book_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.books
    where id = p_book_id
      and created_by = auth.uid()
  );
$$;

create or replace function public.create_book_with_owner(p_name text)
returns setof public.books
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book public.books;
  v_invite_code text;
  v_attempt integer := 0;
begin
  if auth.uid() is null then
    raise exception '未登录用户不能创建账本';
  end if;

  loop
    v_invite_code := (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      from generate_series(1, 6)
    );

    begin
      insert into public.books (name, invite_code, created_by)
      values (coalesce(nullif(trim(p_name), ''), '我们的账本'), v_invite_code, auth.uid())
      returning * into v_book;
      exit;
    exception
      when unique_violation then
        v_attempt := v_attempt + 1;
        if v_attempt >= 5 then
          raise exception '邀请码生成失败，请重试';
        end if;
    end;
  end loop;

  insert into public.book_members (book_id, user_id, role)
  values (v_book.id, auth.uid(), 'owner');

  return query
  select *
  from public.books
  where id = v_book.id;
end;
$$;

create or replace function public.join_book_by_invite(p_invite_code text)
returns setof public.books
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book public.books;
begin
  select *
  into v_book
  from public.books
  where invite_code = upper(trim(p_invite_code));

  if not found then
    raise exception '邀请码不存在';
  end if;

  if public.is_book_member(v_book.id) then
    raise exception '你已经在这个账本中';
  end if;

  insert into public.book_members (book_id, user_id, role)
  values (v_book.id, auth.uid(), 'member');

  return query
  select *
  from public.books
  where id = v_book.id;
end;
$$;

revoke all on function public.is_book_member(uuid) from public;
revoke all on function public.is_book_owner(uuid) from public;
revoke all on function public.create_book_with_owner(text) from public;
revoke all on function public.join_book_by_invite(text) from public;

grant execute on function public.is_book_member(uuid) to authenticated;
grant execute on function public.is_book_owner(uuid) to authenticated;
grant execute on function public.create_book_with_owner(text) to authenticated;
grant execute on function public.join_book_by_invite(text) to authenticated;

drop policy if exists "books_select_members" on public.books;
drop policy if exists "books_insert_authenticated" on public.books;
drop policy if exists "book_members_select_self" on public.book_members;
drop policy if exists "book_members_select_same_book" on public.book_members;
drop policy if exists "book_members_insert_self" on public.book_members;
drop policy if exists "expenses_select_book_members" on public.expenses;
drop policy if exists "expenses_insert_book_members" on public.expenses;
drop policy if exists "expenses_update_book_members" on public.expenses;
drop policy if exists "expenses_delete_book_members" on public.expenses;

create policy "books_select_members"
on public.books
for select
to authenticated
using (public.is_book_member(id));

create policy "books_insert_authenticated"
on public.books
for insert
to authenticated
with check (created_by = auth.uid());

create policy "book_members_select_same_book"
on public.book_members
for select
to authenticated
using (public.is_book_member(book_id));

create policy "book_members_insert_self"
on public.book_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    public.is_book_owner(book_id)
    or public.is_book_member(book_id)
  )
);

create policy "expenses_select_book_members"
on public.expenses
for select
to authenticated
using (public.is_book_member(book_id));

create policy "expenses_insert_book_members"
on public.expenses
for insert
to authenticated
with check (
  public.is_book_member(book_id)
  and created_by = auth.uid()
);

create policy "expenses_update_book_members"
on public.expenses
for update
to authenticated
using (public.is_book_member(book_id))
with check (public.is_book_member(book_id));

create policy "expenses_delete_book_members"
on public.expenses
for delete
to authenticated
using (public.is_book_member(book_id));
