-- ===========================================================================
-- 1. WHERE THE RECEIPT WENT
--
-- The extract endpoint stores the uploaded file to
-- property-management/invoice-receipts/ and returns its path, but invoices has
-- nowhere to keep it: the legacy screen holds it in local state and loses it on
-- save. Every extracted invoice therefore leaves a file in the bucket that
-- nothing references. expenses has had receipt_path since the start; invoices
-- never got one. Nullable, so every existing row stays valid.
-- ===========================================================================

alter table invoices add column if not exists receipt_path text;


-- ===========================================================================
-- 2. create_invoice_full - carry receipt_path through
--
-- Reproduced from the installed definition with ONLY that column added. The
-- unique_violation handler at the end is the repeat-submit guard the create
-- route depends on; it is intact.
-- ===========================================================================

create or replace function create_invoice_full(payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  inv_id uuid := (payload->>'invoice_id')::uuid;
  item   jsonb;
  n_items int := 0;
  n_adj   int := 0;
  n_pay   int := 0;
begin
  insert into invoices (
    id, title, contractor_name, contractor_contact, company,
    property_id, category, notes, hst_amount, tax_mode, receipt_path, status, share_token, due_date
  ) values (
    inv_id,
    payload->>'title',
    coalesce(payload->>'contractor_name', ''),   -- NOT NULL; the table's convention is '' not null
    nullif(payload->>'contractor_contact',''),
    nullif(payload->>'company',''),
    nullif(payload->>'property_id',''),
    nullif(payload->>'category',''),
    nullif(payload->>'notes',''),
    coalesce((payload->>'hst_amount')::numeric, 0),
    coalesce(nullif(payload->>'tax_mode',''), 'auto'),
    -- where the uploaded receipt was stored. Returned by the extract endpoint and
    -- dropped on save until now, so every extracted invoice left an orphan file
    -- in the bucket that nothing pointed at.
    nullif(payload->>'receipt_path',''),
    'open',
    encode(gen_random_bytes(8), 'hex'),
    (payload->>'due_date')::date
  );

  for item in select * from jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) loop
    insert into invoice_items (id, invoice_id, description, amount)
    values ((item->>'id')::uuid, inv_id, item->>'description', (item->>'amount')::numeric);
    n_items := n_items + 1;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(payload->'adjustments','[]'::jsonb)) loop
    insert into invoice_adjustments (id, invoice_id, description, amount, reason)
    values ((item->>'id')::uuid, inv_id, item->>'description', (item->>'amount')::numeric,
            coalesce(item->>'reason','other'));
    n_adj := n_adj + 1;
  end loop;

  if payload->'payment' is not null and payload->'payment' <> 'null'::jsonb then
    insert into invoice_payments (
      id, invoice_id, amount, paid_at, method, method_detail, method_last4, reference, status, due_date
    ) values (
      (payload->'payment'->>'id')::uuid, inv_id,
      (payload->'payment'->>'amount')::numeric,
      nullif(payload->'payment'->>'paid_at','')::date,
      nullif(payload->'payment'->>'method',''),
      nullif(payload->'payment'->>'method_detail',''),
      nullif(payload->'payment'->>'method_last4',''),
      -- the confirmation number, so a payment created with an invoice can still
      -- be matched to a bank statement later
      nullif(payload->'payment'->>'reference',''),
      coalesce(payload->'payment'->>'status','paid'),
      nullif(payload->'payment'->>'due_date','')::date
    );
    n_pay := 1;
  end if;

  return jsonb_build_object('ok', true, 'invoice_id', inv_id,
                            'items', n_items, 'adjustments', n_adj, 'payments', n_pay);
exception
  when unique_violation then
    -- the same client-generated id already landed: a repeat submit
    return jsonb_build_object('ok', true, 'already', true, 'invoice_id', inv_id);
end;
$$;

grant execute on function create_invoice_full(jsonb) to service_role;

notify pgrst, 'reload schema';

-- SELF-CHECK. Returns a row, so a RESULT rather than "Success. No rows returned"
-- proves the whole file ran. All four must be true.
select
  (select count(*) from information_schema.columns
     where table_name = 'invoices' and column_name = 'receipt_path') = 1 as column_added,
  position('receipt_path'     in pg_get_functiondef('create_invoice_full(jsonb)'::regprocedure)) > 0 as rpc_carries_it,
  position('reference'        in pg_get_functiondef('create_invoice_full(jsonb)'::regprocedure)) > 0 as reference_kept,
  position('unique_violation' in pg_get_functiondef('create_invoice_full(jsonb)'::regprocedure)) > 0 as guard_kept;
