-- 对方的个人记录只能看、不能改删（共同记录两人都能改）。
-- 和前端 canModify 保持一致；在 20261022_fixed_expenses.sql 之后执行，可重复执行。

drop policy if exists "records_update_members" on public.records;
drop policy if exists "records_delete_members" on public.records;

create policy "records_update_members" on public.records
  for update to authenticated
  using (
    public.is_book_member(book_id)
    and (type = 'shared' or payer_uid = auth.uid() or created_by = auth.uid())
  )
  with check (public.is_book_member(book_id));

create policy "records_delete_members" on public.records
  for delete to authenticated
  using (
    public.is_book_member(book_id)
    and (type = 'shared' or payer_uid = auth.uid() or created_by = auth.uid())
  );
