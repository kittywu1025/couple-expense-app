-- 借款「互相抵消」：一次记两边的还款，马上生效
-- 以前是一笔笔记还款、等对方确认，点了之后金额不变，看起来像没反应；两笔也不是一起成功或失败。
-- 现在：
--   1. offset_loans() 在一个事务里检查并记下两边的还款，直接算确认
--   2. 同一次抵消的还款共用 offset_id；删其中一笔（照常要对方同意），另一边一起删
-- 可以重复执行。

alter table public.loan_repayments add column if not exists offset_id uuid;
create index if not exists loan_repayments_offset_id_idx on public.loan_repayments (offset_id) where offset_id is not null;

-- 只有 offset_loans() 能写 offset_id、能直接记成已确认；在 confirm_guard 之后执行（触发器按名字排序）
create or replace function public.loan_repayment_offset_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.offset_id := old.offset_id;
    -- 抵消的两笔要一致：不能单独把一笔改成「有疑问」，不对就申请删除，两边一起撤销
    if old.offset_id is not null then
      new.confirm_status := old.confirm_status;
      new.amount := old.amount;
      new.loan_id := old.loan_id;
    end if;
    return new;
  end if;
  if coalesce(current_setting('app.loan_offset', true), '') = 'on' then
    new.confirm_status := 'confirmed';
  else
    new.offset_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists loan_repayments_offset_guard on public.loan_repayments;
create trigger loan_repayments_offset_guard
  before insert or update on public.loan_repayments
  for each row execute function public.loan_repayment_offset_guard();

-- 删掉抵消的一边，另一边也删（不然只剩一半就对不上了）
create or replace function public.loan_repayment_offset_cascade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.offset_id is not null then
    delete from public.loan_repayments where offset_id = old.offset_id and id <> old.id;
  end if;
  return old;
end;
$$;

drop trigger if exists loan_repayments_offset_cascade on public.loan_repayments;
create trigger loan_repayments_offset_cascade
  after delete on public.loan_repayments
  for each row execute function public.loan_repayment_offset_cascade();

-- p_parts: [{"loan_id": "...", "amount": 1000}, ...]
-- 我借 TA 的那几笔加起来，要等于 TA 借我的那几笔加起来；每笔不能超过还没还（含等确认）的部分
create or replace function public.offset_loans(p_book_id uuid, p_parts jsonb)
returns setof public.loan_repayments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_part jsonb;
  v_loan public.loans%rowtype;
  v_amount numeric;
  v_avail numeric;
  v_currency text;
  v_i_owe numeric := 0;
  v_they_owe numeric := 0;
  v_offset uuid := gen_random_uuid();
begin
  if v_uid is null or not public.is_book_member(p_book_id) then
    raise exception '还没有加入账本。';
  end if;
  if jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) < 2 then
    raise exception '两边都要有借款才能抵消';
  end if;
  if (select count(distinct p ->> 'loan_id') from jsonb_array_elements(p_parts) p) <> jsonb_array_length(p_parts) then
    raise exception '同一笔借款不能重复抵消';
  end if;

  for v_part in select * from jsonb_array_elements(p_parts) loop
    select * into v_loan from public.loans where id = (v_part ->> 'loan_id')::uuid and book_id = p_book_id for update;
    if not found then
      raise exception '借款不存在';
    end if;
    if v_uid not in (v_loan.lender_uid, v_loan.borrower_uid) then
      raise exception '只能抵消自己和 TA 之间的借款';
    end if;
    if v_loan.confirm_status <> 'confirmed' or v_loan.delete_requested_by is not null then
      raise exception '有借款在等确认或申请删除，先处理完再抵消';
    end if;
    if v_currency is null then
      v_currency := v_loan.currency;
    elsif v_currency <> v_loan.currency then
      raise exception '不同货币不能互相抵消';
    end if;
    v_amount := round((v_part ->> 'amount')::numeric, 2);
    select v_loan.amount - coalesce(sum(r.amount), 0) into v_avail from public.loan_repayments r where r.loan_id = v_loan.id;
    if v_amount is null or v_amount <= 0 then
      raise exception '金额需要大于 0';
    end if;
    if v_amount > v_avail then
      raise exception '借款金额有变化，刷新后再试';
    end if;
    if v_loan.borrower_uid = v_uid then
      v_i_owe := v_i_owe + v_amount;
    else
      v_they_owe := v_they_owe + v_amount;
    end if;
  end loop;

  if v_i_owe <> v_they_owe then
    raise exception '两边抵消的金额要一样';
  end if;

  perform set_config('app.loan_offset', 'on', true);
  return query
    with ins as (
      insert into public.loan_repayments (loan_id, book_id, amount, date, note, created_by, offset_id)
      select (p ->> 'loan_id')::uuid, p_book_id, round((p ->> 'amount')::numeric, 2), current_date, '互相抵消', v_uid, v_offset
      from jsonb_array_elements(p_parts) p
      returning *
    )
    select * from ins;
  perform set_config('app.loan_offset', 'off', true);
end;
$$;

revoke all on function public.offset_loans(uuid, jsonb) from public;
revoke execute on function public.offset_loans(uuid, jsonb) from anon;
grant execute on function public.offset_loans(uuid, jsonb) to authenticated;

-- 以前点过「一键抵消」、还在等确认的还款：按现在的规则直接算抵消好了。
-- 同一个人同一分钟记的算同一次抵消。改数据时先关掉两个触发器（它们会拦「自己确认自己记的」、会清掉 offset_id）。
do $$
begin
  alter table public.loan_repayments disable trigger loan_repayments_confirm_guard;
  alter table public.loan_repayments disable trigger loan_repayments_offset_guard;

  with groups as (
    select book_id, created_by, date_trunc('minute', created_at) as at, gen_random_uuid() as oid
    from public.loan_repayments
    where note = '互相抵消' and offset_id is null and confirm_status <> 'confirmed'
    group by 1, 2, 3
  )
  update public.loan_repayments r
  set offset_id = g.oid, confirm_status = 'confirmed'
  from groups g
  where r.note = '互相抵消' and r.offset_id is null and r.confirm_status <> 'confirmed'
    and r.book_id = g.book_id and r.created_by = g.created_by and date_trunc('minute', r.created_at) = g.at;

  alter table public.loan_repayments enable trigger loan_repayments_confirm_guard;
  alter table public.loan_repayments enable trigger loan_repayments_offset_guard;
end;
$$;
