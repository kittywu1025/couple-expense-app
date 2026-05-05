alter table public.expenses
  add column if not exists book_id uuid references public.books(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists original_amount numeric,
  add column if not exists original_currency text,
  add column if not exists base_currency text,
  add column if not exists exchange_rate_used numeric,
  add column if not exists exchange_rate_date date,
  add column if not exists split jsonb,
  add column if not exists split_preset text;

update public.expenses
set
  created_by = coalesce(created_by, user_id),
  original_amount = coalesce(original_amount, amount),
  original_currency = coalesce(nullif(original_currency, ''), coalesce(nullif(base_currency, ''), 'JPY')),
  base_currency = coalesce(nullif(base_currency, ''), 'JPY'),
  exchange_rate_used = coalesce(exchange_rate_used, 1),
  exchange_rate_date = coalesce(exchange_rate_date, coalesce(date, created_at::date)),
  split = coalesce(split, jsonb_build_object('me', 50, 'partner', 50)),
  split_preset = coalesce(nullif(split_preset, ''), 'equal')
where
  created_by is null
  or original_amount is null
  or original_currency is null
  or base_currency is null
  or exchange_rate_used is null
  or exchange_rate_date is null
  or split is null
  or split_preset is null;

create index if not exists idx_expenses_book_id on public.expenses(book_id);
create index if not exists idx_expenses_created_by on public.expenses(created_by);

create or replace function public.join_book_by_invite(p_invite_code text)
returns setof public.books
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book public.books;
begin
  if auth.uid() is null then
    raise exception '未登录用户不能加入账本';
  end if;

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
