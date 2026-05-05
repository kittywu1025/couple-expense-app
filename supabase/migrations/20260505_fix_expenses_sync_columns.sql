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
