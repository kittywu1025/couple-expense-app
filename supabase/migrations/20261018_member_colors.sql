-- 成员自定义标识色：不再强制「女粉男蓝」，同一账本两人颜色不能相同。
-- 在 20261017_rebuild_books_records.sql 之后执行，可重复执行。

alter table public.book_members
  add column if not exists color text;

alter table public.book_members drop constraint if exists book_members_color_check;
alter table public.book_members add constraint book_members_color_check
  check (color in ('pink', 'blue', 'purple', 'green', 'orange', 'yellow', 'red', 'teal'));

-- 同一账本里颜色唯一
create unique index if not exists idx_book_members_book_color
  on public.book_members(book_id, color)
  where color is not null;

-- 已有成员：按性别补默认色（女粉 / 男蓝），撞色时第二个人改用紫色
update public.book_members m
set color = case when m.gender = 'male' then 'blue' else 'pink' end
where m.color is null
  and not exists (
    select 1 from public.book_members o
    where o.book_id = m.book_id
      and o.id <> m.id
      and o.color = case when m.gender = 'male' then 'blue' else 'pink' end
  );
update public.book_members set color = 'purple' where color is null;

-- 选一个账本里还没人用的颜色：优先 p_color，被占用时按调色板顺序找下一个
create or replace function public.pick_member_color(p_book_id uuid, p_color text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c
  from unnest(array[p_color, 'pink', 'blue', 'purple', 'green', 'orange', 'teal', 'yellow', 'red']) with ordinality as t(c, i)
  where c is not null
    and c in ('pink', 'blue', 'purple', 'green', 'orange', 'yellow', 'red', 'teal')
    and not exists (select 1 from public.book_members where book_id = p_book_id and color = c)
  order by i
  limit 1;
$$;

drop function if exists public.create_book(text);
drop function if exists public.create_book(text, text);
drop function if exists public.join_book(text, text);
drop function if exists public.join_book(text, text, text);

create or replace function public.create_book(p_display_name text, p_gender text default null, p_color text default null)
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

  insert into public.book_members (book_id, user_id, display_name, gender, color)
  values (
    v_book.id, auth.uid(), nullif(trim(p_display_name), ''), p_gender,
    public.pick_member_color(v_book.id, p_color)
  );

  return query select * from public.books where id = v_book.id;
end;
$$;

create or replace function public.join_book(
  p_invite_code text, p_display_name text, p_gender text default null, p_color text default null
)
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

  -- 想要的颜色被对方占用时，自动换成下一个可用色（加入后可在「我的」里改）
  insert into public.book_members (book_id, user_id, display_name, gender, color)
  values (
    v_book.id, auth.uid(), nullif(trim(p_display_name), ''), p_gender,
    public.pick_member_color(v_book.id, p_color)
  );

  return query select * from public.books where id = v_book.id;
end;
$$;

revoke all on function public.pick_member_color(uuid, text) from public;
revoke all on function public.create_book(text, text, text) from public;
revoke all on function public.join_book(text, text, text, text) from public;
grant execute on function public.create_book(text, text, text) to authenticated;
grant execute on function public.join_book(text, text, text, text) to authenticated;
