-- 注册资料规则：
-- 1. 性别一旦设置不可修改
-- 2. 加入账本时颜色和先加入的人撞色 → 报错「对方已选择该颜色」，由前端让用户重选（先注册的人有优先选色权）
-- 在 20261019_custom_categories.sql 之后执行，可重复执行。

-- ── 性别锁定 ──
create or replace function public.lock_member_gender()
returns trigger
language plpgsql
as $$
begin
  if old.gender is not null and new.gender is distinct from old.gender then
    raise exception '性别注册后不可修改';
  end if;
  return new;
end;
$$;

drop trigger if exists lock_member_gender on public.book_members;
create trigger lock_member_gender
before update on public.book_members
for each row
execute function public.lock_member_gender();

-- ── 加入前查看对方已用的颜色（只返回颜色，不暴露其他信息） ──
create or replace function public.invite_taken_colors(p_invite_code text)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select m.color
  from public.book_members m
  join public.books b on b.id = m.book_id
  where b.invite_code = upper(trim(p_invite_code))
    and m.color is not null;
$$;

revoke all on function public.invite_taken_colors(text) from public;
grant execute on function public.invite_taken_colors(text) to authenticated;

-- ── 加入账本：撞色时报错，不再自动换色 ──
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

  if p_color is not null and exists (
    select 1 from public.book_members where book_id = v_book.id and color = p_color
  ) then
    raise exception '对方已选择该颜色，请重新选择';
  end if;

  insert into public.book_members (book_id, user_id, display_name, gender, color)
  values (
    v_book.id, auth.uid(), nullif(trim(p_display_name), ''), p_gender,
    coalesce(p_color, public.pick_member_color(v_book.id, null))
  );

  return query select * from public.books where id = v_book.id;
end;
$$;

revoke all on function public.join_book(text, text, text, text) from public;
grant execute on function public.join_book(text, text, text, text) to authenticated;
