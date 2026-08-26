-- ═══════════════════════════════════════════════════════════════════════════
-- 1. THE TWO INVOICES THAT DISAGREE WITH THEMSELVES
--
-- Gas Line and Solid Waste carry tax_mode 'auto' with hst_amount 0. The list
-- reads the stored amount and shows $0.00; the legacy editor sees 'auto' and
-- computes 13% of the subtotal — 45.50 and 32.48. Same invoice, two answers.
--
-- Both are genuinely exempt, so the amount was right and the MODE was the lie.
-- 'none' rather than a new 'exempt' value: both screens already branch on
-- 'none', and a fourth word would mean two more places to keep in step.
-- ═══════════════════════════════════════════════════════════════════════════

update invoices set tax_mode = 'none'
 where title in ('Gas Line', 'Solid Waste')
   and tax_mode = 'auto'
   and coalesce(hst_amount, 0) = 0;
-- expect: UPDATE 2


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. create_invoice_full — two columns it silently dropped
--
-- Reproduced from the installed definition with ONLY those two edits. In
-- particular the `exception when unique_violation` handler below is the
-- repeat-submit guard the create route depends on (it reads `already`); an
-- earlier draft of this file rewrote the function from scratch and lost it.
-- ═══════════════════════════════════════════════════════════════════════════

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
    property_id, category, notes, hst_amount, tax_mode, status, share_token, due_date
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
    -- The caller's declared intent, not the column default. tax_mode was never in
    -- this insert, so every invoice made through the new-invoice dialog took the
    -- default 'auto' whatever was meant — and where the amount was 0 the list and
    -- the editor then disagreed, one reading the stored amount and the other
    -- recomputing 13%. Gas Line and Solid Waste were the first two to show it.
    coalesce(nullif(payload->>'tax_mode',''), 'auto'),
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
    -- method_detail and method_last4 were absent here, so a payment recorded at
    -- creation could not name the account it came from. That is how two billpays
    -- reached the ledger unattributed.
    insert into invoice_payments (
      id, invoice_id, amount, paid_at, method, method_detail, method_last4, status, due_date
    ) values (
      (payload->'payment'->>'id')::uuid, inv_id,
      (payload->'payment'->>'amount')::numeric,
      nullif(payload->'payment'->>'paid_at','')::date,
      nullif(payload->'payment'->>'method',''),
      nullif(payload->'payment'->>'method_detail',''),
      nullif(payload->'payment'->>'method_last4',''),
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
