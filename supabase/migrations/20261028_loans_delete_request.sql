-- 借款不再需要对方确认（记了就算）；删除借款改成「申请删除 → 对方同意才删」。
-- 还款仍然要对方确认。在 20261028_interval_and_settle.sql 之后执行，可重复执行。

alter table public.loans
  add column if not exists delete_requested_by uuid references auth.users(id) on delete set null;

-- 以前等确认 / 有疑问的借款直接算数
update public.loans set confirm_status = 'confirmed' where confirm_status <> 'confirmed';

-- 删除：只有另一个人先申请了，才能删（相当于同意对方的申请）
drop policy if exists "loans_delete_members" on public.loans;
create policy "loans_delete_members" on public.loans
  for delete to authenticated
  using (
    public.is_book_member(book_id)
    and delete_requested_by is not null
    and delete_requested_by <> auth.uid()
  );

-- 确认守卫：借款不用确认；删除申请只能以自己的名义（其余同 20261028_interval_and_settle.sql）
create or replace function public.confirm_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 固定扣款自动生成时，按设置这项扣款的人算「记账人」
  v_actor uuid := coalesce(nullif(current_setting('app.acting_uid', true), '')::uuid, auth.uid());
  -- 「已收到」由先垫钱的人自己标记，不算内容改动、不用对方再确认（下面单独检查）
  v_strip text[] := array['confirm_status', 'last_edited_by', 'note', 'discussion', 'settled_on_spot', 'settled_at', 'delete_requested_by'];
  v_new jsonb := to_jsonb(new) - v_strip;
  v_old jsonb;
  v_old_len integer;
  v_proposal jsonb;
  v_members integer;
begin
  -- SQL Editor / 后台直接改数据：不干预
  if v_actor is null then
    if tg_op = 'INSERT' then
      new.last_edited_by := coalesce(new.last_edited_by, new.created_by);
    end if;
    return new;
  end if;

  -- 结清（只有账单有）：只有先垫钱的人（付款人）能标记「已收到」或撤销
  if to_jsonb(new) ? 'settled_on_spot' then
    if tg_op = 'INSERT' then
      if new.settled_on_spot and v_actor is distinct from new.payer_uid then
        new.settled_on_spot := false;
      end if;
      new.settled_at := case when new.settled_on_spot then now() end;
    elsif new.settled_on_spot is distinct from old.settled_on_spot then
      if v_actor is distinct from old.payer_uid then
        raise exception '只有先垫钱的人能标记已收到';
      end if;
      new.settled_at := case when new.settled_on_spot then now() end;
    else
      new.settled_at := old.settled_at;
    end if;
  end if;

  -- 借款删除申请：只能以自己的名义申请；撤回 / 拒绝谁都可以（真正删除由 RLS 限制为另一个人）
  if to_jsonb(new) ? 'delete_requested_by' then
    if tg_op = 'INSERT' then
      new.delete_requested_by := null;
    elsif new.delete_requested_by is distinct from old.delete_requested_by
          and new.delete_requested_by is not null
          and new.delete_requested_by is distinct from v_actor then
      raise exception '只能以自己的名义申请删除';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.discussion := '[]'::jsonb;
  else
    -- 留言只能往后加，不能改以前的
    v_old_len := jsonb_array_length(old.discussion);
    if jsonb_array_length(new.discussion) < v_old_len
       or coalesce((select jsonb_agg(e order by i) from jsonb_array_elements(new.discussion) with ordinality t(e, i) where i <= v_old_len), '[]'::jsonb)
          <> old.discussion then
      raise exception '以前的留言不能改';
    end if;

    v_old := to_jsonb(old) - v_strip;
    if v_new = v_old then
      -- 内容没变：确认 / 有疑问 / 回复 / 改备注
      new.last_edited_by := old.last_edited_by;
      if new.confirm_status is distinct from old.confirm_status then
        if v_actor = old.last_edited_by then
          -- 记账人回复疑问后，重新请对方确认
          if not (old.confirm_status = 'disputed' and new.confirm_status = 'pending') then
            raise exception '自己记的账要等 TA 确认';
          end if;
        elsif new.confirm_status not in ('confirmed', 'disputed') then
          raise exception '确认状态不对';
        end if;
      end if;
      return new;
    end if;

    -- 记账人「按 TA 说的改」比例：对方提议的，直接算确认
    v_proposal := old.discussion -> -1;
    if old.confirm_status = 'disputed'
       and v_actor = old.last_edited_by
       and v_proposal ? 'ratio'
       and (v_proposal ->> 'by') is distinct from v_actor::text
       and v_new = jsonb_set(v_old, '{ratio}', v_proposal -> 'ratio') then
      new.last_edited_by := v_actor;
      new.confirm_status := 'confirmed';
      return new;
    end if;
  end if;

  -- 新建或内容有改动
  new.last_edited_by := v_actor;
  select count(*) into v_members from public.book_members where book_id = new.book_id;
  -- 借款本身不用对方确认（删除才要）；共同账单、还款要
  if v_members >= 2 and not (v_new ? 'lender_uid') and coalesce(v_new ->> 'type', 'shared') = 'shared' then
    new.confirm_status := 'pending';
  else
    new.confirm_status := 'confirmed';
  end if;
  return new;
end;
$$;
