create table if not exists public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  amount numeric not null,
  currency text not null default 'JPY',
  category text not null,
  day_of_month integer not null,
  start_date date not null,
  end_date date null,
  split_type text,
  payer text,
  my_share integer,
  partner_share integer,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fixed_expense_runs (
  id uuid primary key default gen_random_uuid(),
  fixed_expense_id uuid not null references public.fixed_expenses(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  generated_month text not null,
  expense_id uuid references public.expenses(id) on delete set null,
  generated_at timestamptz not null default now(),
  unique (fixed_expense_id, generated_month)
);

create index if not exists idx_fixed_expenses_book_id on public.fixed_expenses(book_id);
create index if not exists idx_fixed_expense_runs_book_id on public.fixed_expense_runs(book_id);
create index if not exists idx_fixed_expense_runs_fixed_id on public.fixed_expense_runs(fixed_expense_id);

alter table public.fixed_expenses enable row level security;
alter table public.fixed_expense_runs enable row level security;

drop trigger if exists set_fixed_expenses_updated_at on public.fixed_expenses;
create trigger set_fixed_expenses_updated_at
before update on public.fixed_expenses
for each row
execute function public.set_updated_at();

drop policy if exists "fixed_expenses_select_book_members" on public.fixed_expenses;
drop policy if exists "fixed_expenses_insert_book_members" on public.fixed_expenses;
drop policy if exists "fixed_expenses_update_book_members" on public.fixed_expenses;
drop policy if exists "fixed_expenses_delete_book_members" on public.fixed_expenses;
drop policy if exists "fixed_expense_runs_select_book_members" on public.fixed_expense_runs;
drop policy if exists "fixed_expense_runs_insert_book_members" on public.fixed_expense_runs;
drop policy if exists "fixed_expense_runs_update_book_members" on public.fixed_expense_runs;
drop policy if exists "fixed_expense_runs_delete_book_members" on public.fixed_expense_runs;

create policy "fixed_expenses_select_book_members"
on public.fixed_expenses
for select
to authenticated
using (public.is_book_member(book_id));

create policy "fixed_expenses_insert_book_members"
on public.fixed_expenses
for insert
to authenticated
with check (
  public.is_book_member(book_id)
  and created_by = auth.uid()
);

create policy "fixed_expenses_update_book_members"
on public.fixed_expenses
for update
to authenticated
using (public.is_book_member(book_id))
with check (public.is_book_member(book_id));

create policy "fixed_expenses_delete_book_members"
on public.fixed_expenses
for delete
to authenticated
using (public.is_book_member(book_id));

create policy "fixed_expense_runs_select_book_members"
on public.fixed_expense_runs
for select
to authenticated
using (public.is_book_member(book_id));

create policy "fixed_expense_runs_insert_book_members"
on public.fixed_expense_runs
for insert
to authenticated
with check (public.is_book_member(book_id));

create policy "fixed_expense_runs_update_book_members"
on public.fixed_expense_runs
for update
to authenticated
using (public.is_book_member(book_id))
with check (public.is_book_member(book_id));

create policy "fixed_expense_runs_delete_book_members"
on public.fixed_expense_runs
for delete
to authenticated
using (public.is_book_member(book_id));
