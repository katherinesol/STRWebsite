-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A REFERENCE YOU CAN QUOTE BACK
--
-- An e-transfer confirmation number, a bill-pay reference, a cheque number. The
-- `payments` table has carried one since it was built; invoice_payments and
-- expenses never have, so the only place a reference could go was free-text
-- notes, where nothing can search for it and nothing can match it to a bank
-- statement. Nullable, so every existing row is untouched and still valid.
-- ═══════════════════════════════════════════════════════════════════════════

alter table invoice_payments add column if not exists reference text;
alter table expenses         add column if not exists reference text;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. edit_invoice_full — carry tax_mode alongside hst_amount
--
-- The new-invoice path now records the declared tax intent; the EDIT path did
-- not, so editing an invoice could leave the mode saying one thing and the
-- amount another — the exact split that made Gas Line and Solid Waste disagree
-- with themselves across two screens.
--
-- Reproduced from the installed definition with ONLY that one line added.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function edit_invoice_full(payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  inv_id      uuid := (payload->>'invoice_id')::uuid;
  item        jsonb;
  old_cat     text;
  new_cat     text;
  before_items numeric;
  before_adj   numeric;
  before_total numeric;
  after_items  numeric;
  after_adj    numeric;
  after_total  numeric;
  paid_total   numeric;
  hst          numeric;
  n_del_i int := 0; n_up_i int := 0; n_new_i int := 0;
  n_del_a int := 0; n_up_a int := 0; n_new_a int := 0;
  synced_ids uuid[] := '{}';
  keep_ids uuid[];
begin
  select category, coalesce(hst_amount, 0) into old_cat, hst from invoices where id = inv_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Invoice not found');
  end if;

  select coalesce(sum(amount), 0) into before_items from invoice_items       where invoice_id = inv_id;
  select coalesce(sum(amount), 0) into before_adj   from invoice_adjustments where invoice_id = inv_id;
  before_total := before_items - before_adj + hst;

  new_cat := coalesce(nullif(payload->>'category', ''), old_cat);

  update invoices set
    title          = coalesce(nullif(payload->>'title', ''), title),
    category       = new_cat,
    notes          = case when payload ? 'notes' then nullif(payload->>'notes', '') else notes end,
    hst_amount     = coalesce((payload->>'hst_amount')::numeric, hst_amount),
    -- the declared intent, stored beside the amount. Without it a screen that
    -- recomputes from the mode disagrees with one that reads the stored figure.
    tax_mode       = coalesce(nullif(payload->>'tax_mode',''), tax_mode)
  where id = inv_id;

  select coalesce(hst_amount, 0) into hst from invoices where id = inv_id;

  -- ---- line items: desired full state ----
  select coalesce(array_agg((v->>'id')::uuid), '{}')
    into keep_ids
    from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb)) v;

  with gone as (
    delete from invoice_items where invoice_id = inv_id and not (id = any(keep_ids)) returning 1
  ) select count(*) into n_del_i from gone;

  for item in select * from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb)) loop
    if exists (select 1 from invoice_items where id = (item->>'id')::uuid and invoice_id = inv_id) then
      update invoice_items
         set description = item->>'description',
             amount      = (item->>'amount')::numeric
       where id = (item->>'id')::uuid;
      n_up_i := n_up_i + 1;
    else
      insert into invoice_items (id, invoice_id, description, amount)
      values ((item->>'id')::uuid, inv_id, item->>'description', (item->>'amount')::numeric);
      n_new_i := n_new_i + 1;
    end if;
  end loop;

  -- ---- adjustments: desired full state ----
  select coalesce(array_agg((v->>'id')::uuid), '{}')
    into keep_ids
    from jsonb_array_elements(coalesce(payload->'adjustments', '[]'::jsonb)) v;

  with gone as (
    delete from invoice_adjustments where invoice_id = inv_id and not (id = any(keep_ids)) returning 1
  ) select count(*) into n_del_a from gone;

  for item in select * from jsonb_array_elements(coalesce(payload->'adjustments', '[]'::jsonb)) loop
    if exists (select 1 from invoice_adjustments where id = (item->>'id')::uuid and invoice_id = inv_id) then
      update invoice_adjustments
         set description = item->>'description',
             amount      = (item->>'amount')::numeric,
             reason      = coalesce(item->>'reason', reason)
       where id = (item->>'id')::uuid;
      n_up_a := n_up_a + 1;
    else
      insert into invoice_adjustments (id, invoice_id, description, amount, reason)
      values ((item->>'id')::uuid, inv_id, item->>'description', (item->>'amount')::numeric,
              coalesce(item->>'reason', 'other'));
      n_new_a := n_new_a + 1;
    end if;
  end loop;

  select coalesce(sum(amount), 0) into after_items from invoice_items       where invoice_id = inv_id;
  select coalesce(sum(amount), 0) into after_adj   from invoice_adjustments where invoice_id = inv_id;
  after_total := after_items - after_adj + hst;

  -- ---- overpayment guard ----
  -- Money already paid is a fact. If an edit drops the total below it, the edit
  -- is wrong, not the payment history. Raising here rolls the whole edit back.
  select coalesce(sum(amount), 0) into paid_total
    from invoice_payments where invoice_id = inv_id and status = 'paid';

  if after_total < paid_total - 0.005 then
    raise exception 'Total would fall to % but % is already paid. Reduce or remove a payment first.',
      to_char(after_total, 'FM999999990.00'), to_char(paid_total, 'FM999999990.00')
      using errcode = 'check_violation';
  end if;

  -- ---- category sync: all linked expenses, category only ----
  if new_cat is distinct from old_cat then
    with touched as (
      update expenses e set category = new_cat
       where e.id in (select p.expense_id from invoice_payments p
                       where p.invoice_id = inv_id and p.expense_id is not null)
         and e.category is distinct from new_cat
      returning e.id
    ) select coalesce(array_agg(id), '{}') into synced_ids from touched;
  end if;

  return jsonb_build_object(
    'ok', true,
    'invoice_id', inv_id,
    'before', jsonb_build_object('items', before_items, 'adjustments', before_adj,
                                 'total', before_total, 'category', old_cat),
    'after',  jsonb_build_object('items', after_items,  'adjustments', after_adj,
                                 'total', after_total,  'category', new_cat),
    'paid', paid_total,
    'balance', after_total - paid_total,
    'items',       jsonb_build_object('deleted', n_del_i, 'updated', n_up_i, 'inserted', n_new_i),
    'adjustments', jsonb_build_object('deleted', n_del_a, 'updated', n_up_a, 'inserted', n_new_a),
    'expenses_synced', to_jsonb(synced_ids),
    'expenses_synced_count', coalesce(array_length(synced_ids, 1), 0)
  );
end;
$$;

grant execute on function edit_invoice_full(jsonb) to service_role;
