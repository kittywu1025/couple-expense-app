-- 自定义分类：存在账本上，两个人共用。
-- 结构：[{ key, name, icon, color, kind: 'expense' | 'income', subs: [{ name, icon }] }]
-- 在 20261018_member_colors.sql 之后执行，可重复执行。

alter table public.books
  add column if not exists custom_categories jsonb not null default '[]'::jsonb;

alter table public.books drop constraint if exists books_custom_categories_check;
alter table public.books add constraint books_custom_categories_check
  check (jsonb_typeof(custom_categories) = 'array' and jsonb_array_length(custom_categories) <= 50);
