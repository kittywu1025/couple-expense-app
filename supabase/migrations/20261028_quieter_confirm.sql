-- 少打扰一点：
--   · 共同账单只有「对方要承担的比平时多」才需要对方确认（比如记成 TA 请客、TA 多出）；
--     我请客、按账本默认比例 AA 记了就算，只在对方首页提醒一下
--   · 改账单时只有金额 / 类型 / 付款人 / 比例变了才算改动（重新判断要不要确认、提醒对方），
--     改分类、日期、备注不打扰对方
-- 在 20261028_loans_delete_request.sql 之后执行，可重复执行。

-- 最近一次「跟钱有关」的新建 / 改动时间，对方首页据此提醒「TA 新记了 N 笔」
alter table public.records
  add column if not exists edited_at timestamptz;
update public.records set edited_at = created_at where edited_at is null;

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
  -- 账单只看跟钱有关的字段：改分类 / 日期 / 备注不算改动，不打扰对方
  v_is_record boolean := to_jsonb(new) ? 'payer_uid';
  v_money text[] := array['amount', 'kind', 'type', 'payer_uid', 'ratio'];
  v_default integer;
  v_partner_share integer;
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

  if v_is_record then
    v_new := (select jsonb_object_agg(k, to_jsonb(new) -> k) from unnest(v_money) k);
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

    v_old := case
      when v_is_record then (select jsonb_object_agg(k, to_jsonb(old) -> k) from unnest(v_money) k)
      else to_jsonb(old) - v_strip
    end;
    if v_new = v_old then
      -- 钱没变：确认 / 有疑问 / 回复 / 改分类日期备注，都不重新确认、不提醒
      new.last_edited_by := old.last_edited_by;
      if v_is_record then
        new.edited_at := old.edited_at;
      end if;
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

  -- 新建或钱有改动
  new.last_edited_by := v_actor;
  select count(*) into v_members from public.book_members where book_id = new.book_id;

  if v_is_record then
    -- 账单：对方要承担的比平时（账本默认比例）多，才需要对方确认，比如记成「TA 请客」；
    -- 我请客、按默认比例 AA 都直接算数，只是提醒对方一下（edited_at 用来判断有没有新的）
    new.edited_at := now();
    select default_ratio into v_default from public.books where id = new.book_id;
    v_partner_share := case when new.payer_uid = v_actor then 10 - new.ratio else new.ratio end;
    if v_members >= 2 and new.type = 'shared' and v_partner_share > 10 - coalesce(v_default, 5) then
      new.confirm_status := 'pending';
    else
      new.confirm_status := 'confirmed';
    end if;
  elsif v_members >= 2 and not (v_new ? 'lender_uid') then
    -- 还款要对方确认；借款本身不用（删除才要）
    new.confirm_status := 'pending';
  else
    new.confirm_status := 'confirmed';
  end if;
  return new;
end;
$$;

-- 以前在等确认、但按新规则不需要确认的（我请客、默认比例 AA）直接算数
update public.records r
set confirm_status = 'confirmed'
from public.books b
where b.id = r.book_id
  and r.confirm_status = 'pending'
  and r.type = 'shared'
  and (case when r.payer_uid = r.last_edited_by then 10 - r.ratio else r.ratio end) <= 10 - b.default_ratio;
