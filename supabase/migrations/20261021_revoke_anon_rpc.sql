-- 收紧权限：账本相关函数只允许登录用户调用（Supabase 默认也会给 anon 执行权限）。
-- 在 20261020_registration_rules.sql 之后执行，可重复执行。

revoke execute on function public.is_book_member(uuid) from anon;
revoke execute on function public.create_book(text, text, text) from anon;
revoke execute on function public.join_book(text, text, text, text) from anon;
revoke execute on function public.leave_book(uuid) from anon;
revoke execute on function public.invite_taken_colors(text) from anon;
revoke execute on function public.pick_member_color(uuid, text) from anon, authenticated;
