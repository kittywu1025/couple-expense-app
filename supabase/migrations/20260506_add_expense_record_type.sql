alter table public.expenses
  add column if not exists record_type text default 'expense';

update public.expenses
set record_type = coalesce(nullif(record_type, ''), 'expense')
where record_type is null
  or record_type = '';
