-- 固定扣款「每 N 个月」的周期从开始那个月算起：
--   10/28 加「每 2 个月 1 号」→ 10/1 当作这个月已经扣过，下次是 12/1（以前会算成 11/1）。
-- 每月扣的不受影响。编辑时也可以直接选「首次扣款」日期（存在 start_date）。
--
-- 另外修了几处确认 / 结清的规则：
--   · 账单的金额 / 比例 / 付款人变了（包括「按 TA 说的改」），之前标的「已收到」自动取消
--   · 对方有疑问后，记账人只改了分类 / 日期，也会重新请对方确认
--   · 已确认的还款不能一个人删：要申请删除，对方同意才删（和借款一样）
--   · 结清可以由没付钱的那位先说「我给了」（paid_claimed_at），先垫钱的人确认收到或说没收到
--   · AA 可以按金额分（比如 2200 里我吃了 800）：records.ratio 改成可以存小数
--   · 共同账单记了就入账，对方首页收到提醒；觉得不对点「有疑问」退回成未入账
--   · ratio = 0（付钱的人一分不出、对方全出）不再算请客，对方要把全额转给付钱的人
--   · 「我给了」12 小时对方还没确认，可以「提醒 TA」（paid_nudged_at），之后每 12 小时最多一次
--   · 固定收入（工资）：fixed_expenses.kind = 'income'，到日子自动记一笔收入（只算自己的）
-- 在 20261028_quieter_confirm.sql 之后执行，可重复执行。

alter table public.fixed_expenses add column if not exists kind text not null default 'expense';
alter table public.fixed_expenses drop constraint if exists fixed_expenses_kind_check;
alter table public.fixed_expenses add constraint fixed_expenses_kind_check check (kind in ('expense', 'income'));

create or replace function public.generate_fixed_expenses(p_book_id uuid, p_today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.fixed_expenses;
  v_today date := least(p_today, current_date + 1);
  v_month date;
  v_due date;
  v_last_day integer;
  v_count integer := 0;
  v_guard integer;
begin
  if not public.is_book_member(p_book_id) then
    raise exception '没有权限';
  end if;

  for f in
    select * from public.fixed_expenses
    where book_id = p_book_id and not paused
    for update
  loop
    -- 自动生成的共同账单由「设置这项扣款的人」记，对方确认（见 confirm_guard）
    perform set_config('app.acting_uid', f.created_by::text, true);

    -- start_date 所在的月份算第一个周期（这个月的扣款日已经过了就当这个月扣过了），之后每 interval_months 个月一次
    v_month := date_trunc('month', f.start_date)::date;

    v_guard := 0;
    loop
      v_guard := v_guard + 1;
      exit when v_guard > 240;
      v_last_day := extract(day from (v_month + interval '1 month - 1 day'))::integer;
      v_due := v_month + (least(f.day_of_month, v_last_day) - 1);
      exit when v_due > v_today;
      if v_due >= f.start_date and (f.last_generated_date is null or v_due > f.last_generated_date) then
        insert into public.records (book_id, amount, kind, type, payer_uid, ratio, category, sub_category, note, date, created_by)
        -- 固定收入只算自己的
        values (f.book_id, f.amount, f.kind,
                case when f.kind = 'income' then 'personal' else f.type end,
                f.payer_uid,
                case when f.kind = 'income' then 10 else f.ratio end,
                f.category, f.sub_category,
                f.name || case when f.kind = 'income' then '（固定收入）' else '（固定扣款）' end, v_due, f.created_by);
        update public.fixed_expenses set last_generated_date = v_due where id = f.id;
        f.last_generated_date := v_due;
        v_count := v_count + 1;
      end if;
      v_month := (v_month + make_interval(months => f.interval_months))::date;
    end loop;
  end loop;
  perform set_config('app.acting_uid', '', true);

  return v_count;
end;
$$;

revoke all on function public.generate_fixed_expenses(uuid, date) from public;
revoke execute on function public.generate_fixed_expenses(uuid, date) from anon;
grant execute on function public.generate_fixed_expenses(uuid, date) to authenticated;

-- ───────── 还款删除：已确认的要对方同意 ─────────
alter table public.loan_repayments
  add column if not exists delete_requested_by uuid references auth.users(id) on delete set null;

drop policy if exists "loan_repayments_delete_members" on public.loan_repayments;
-- 自己记的、还没确认的可以直接删；其余要另一个人先申请删除，才能删（相当于同意）
create policy "loan_repayments_delete_members" on public.loan_repayments
  for delete to authenticated
  using (
    public.is_book_member(book_id)
    and (
      (created_by = auth.uid() and confirm_status <> 'confirmed')
      or (delete_requested_by is not null and delete_requested_by <> auth.uid())
    )
  );

alter table public.records add column if not exists paid_nudged_at timestamptz;

-- 按金额分 AA：付款人份额不一定是整成，ratio 存小数（仍然在 0 到 10 之间）
alter table public.records alter column ratio type numeric using ratio::numeric;

-- 「我给了」：没付钱那位给了自己那份后告诉对方，等先垫钱的人确认收到
alter table public.records add column if not exists paid_claimed_at timestamptz;

-- 确认守卫（其余同 20261028_quieter_confirm.sql）
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
  v_strip text[] := array['confirm_status', 'last_edited_by', 'note', 'discussion', 'settled_on_spot', 'settled_at', 'paid_claimed_at', 'paid_nudged_at', 'delete_requested_by'];
  v_new jsonb := to_jsonb(new) - v_strip;
  v_old jsonb;
  -- 账单只看跟钱有关的字段：改分类 / 日期 / 备注不算改动，不打扰对方
  v_is_record boolean := to_jsonb(new) ? 'payer_uid';
  v_money text[] := array['amount', 'kind', 'type', 'payer_uid', 'ratio'];
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
      -- 收到了 / 撤销结清：「我给了」的申请都处理完了
      new.paid_claimed_at := null;
      new.paid_nudged_at := null;
    else
      new.settled_at := old.settled_at;
    end if;
  end if;

  -- 「我给了」：只有没付钱的那位能说；撤回 / 「没收到」谁都可以清掉
  if to_jsonb(new) ? 'paid_claimed_at' then
    if tg_op = 'INSERT' then
      new.paid_claimed_at := null;
      new.paid_nudged_at := null;
    elsif new.paid_claimed_at is distinct from old.paid_claimed_at
          and new.paid_claimed_at is not null
          and new.settled_on_spot is not distinct from old.settled_on_spot then
      if v_actor = old.payer_uid or old.type <> 'shared' then
        raise exception '只有没付钱的那位能说已经给了';
      end if;
      -- 对方刚好已经标了收到（一起勾的几笔里有一笔）：不用再说了，其余照常
      new.paid_claimed_at := case when old.settled_on_spot then null else now() end;
    end if;
  end if;

  -- 「提醒 TA」：说了「我给了」12 小时对方还没确认，给钱的人可以提醒一次，之后每 12 小时最多一次
  if to_jsonb(new) ? 'paid_nudged_at' then
    if tg_op = 'INSERT' or new.paid_claimed_at is null or new.paid_claimed_at is distinct from old.paid_claimed_at then
      -- 没有申请了，或者重新说了一次「我给了」：从头算 12 小时
      new.paid_nudged_at := null;
    elsif new.paid_nudged_at is distinct from old.paid_nudged_at and new.paid_nudged_at is not null then
      if v_actor = old.payer_uid
         or old.paid_claimed_at is null
         or coalesce(old.paid_nudged_at, old.paid_claimed_at) > now() - interval '12 hours' then
        raise exception '12 小时内只能提醒一次';
      end if;
      new.paid_nudged_at := now();
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
        -- 对方有疑问后，记账人改了分类 / 日期（钱没变），也重新请对方确认
        if old.confirm_status = 'disputed'
           and v_actor = old.last_edited_by
           and new.confirm_status = old.confirm_status
           and (to_jsonb(new) - v_strip - 'edited_at') is distinct from (to_jsonb(old) - v_strip - 'edited_at') then
          new.confirm_status := 'pending';
        end if;
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
      -- 有疑问 / 等再看时不算入账，「我给了」的申请也作废
      if v_is_record and new.confirm_status <> 'confirmed' then
        new.paid_claimed_at := null;
        new.paid_nudged_at := null;
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
      -- 比例变了，之前标的「已收到」对不上了，取消结清
      new.settled_on_spot := false;
      new.settled_at := null;
      new.paid_claimed_at := null;
      new.paid_nudged_at := null;
      return new;
    end if;
  end if;

  -- 新建或钱有改动
  new.last_edited_by := v_actor;
  select count(*) into v_members from public.book_members where book_id = new.book_id;

  if v_is_record then
    -- 账单：记了就入账，对方首页提醒「TA 新记了」（edited_at 用来判断有没有新的）；
    -- 对方觉得不对点「有疑问」，退回成未入账
    new.edited_at := now();
    -- 钱变了，之前标的「已收到」对不上了，取消结清，由先垫钱的人重新确认收到多少
    if tg_op = 'UPDATE' then
      new.settled_on_spot := false;
      new.settled_at := null;
      new.paid_claimed_at := null;
      new.paid_nudged_at := null;
    end if;
    new.confirm_status := 'confirmed';
  elsif v_members >= 2 and not (v_new ? 'lender_uid') then
    -- 还款要对方确认；借款本身不用（删除才要）
    new.confirm_status := 'pending';
  else
    new.confirm_status := 'confirmed';
  end if;
  return new;
end;
$$;

-- 以前规则下「等对方确认」、没人回复过的共同账单：按现在的规则直接入账（对方觉得不对可以点「有疑问」）
update public.records
set confirm_status = 'confirmed'
where type = 'shared'
  and confirm_status = 'pending'
  and jsonb_array_length(coalesce(discussion, '[]'::jsonb)) = 0;
